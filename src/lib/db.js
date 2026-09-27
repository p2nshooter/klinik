// D1 access layer: safe SQL built only from the entity registry, JSON columns, atomic counters,
// document numbering and audit logging. Designed to minimise rows read (indexed filters, N+1 paging, no COUNT(*)).
import { ENTITIES } from '../schema/entities.js';
import { HttpError, clamp, code, conflict, localDate, notFound, nowISO, parseJSON } from './util.js';

export const JSON_TYPES = new Set(['items', 'json', 'tags', 'refs', 'perms', 'blocks']);
const NUM_TYPES = new Set(['number', 'money']);

export function d1Entity(name) {
  const e = ENTITIES[name];
  if (!e || e.store !== 'd1') throw notFound('Modul tidak dikenal');
  return { name, ...e };
}
export const storedFields = (e) => e.fields.filter((f) => !f.virtual);
export const isD1Ref = (f) => f.type === 'ref' && ENTITIES[f.ref]?.store === 'd1';

export function coerce(f, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return f.type === 'bool' ? 0 : null;
  if (NUM_TYPES.has(f.type)) {
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (f.type === 'bool') return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0;
  if (isD1Ref(f)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (JSON_TYPES.has(f.type)) return typeof v === 'string' ? v : JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim().slice(0, 50000);
}

export function decode(e, row, { keepSecret = false } = {}) {
  if (!row) return row;
  const out = { ...row };
  for (const f of e.fields) {
    if (f.secret && !keepSecret) delete out[f.key];
    else if (JSON_TYPES.has(f.type)) out[f.key] = parseJSON(row[f.key], f.type === 'json' ? null : []);
    else if (f.type === 'bool') out[f.key] = !!row[f.key];
  }
  return out;
}

function mapDbError(err) {
  const m = String(err?.message || err);
  if (m.includes('UNIQUE constraint failed')) {
    const col = m.split('.').pop();
    return new HttpError(409, `Data dengan ${col} yang sama sudah ada`);
  }
  return err;
}

export async function q(env, sql, ...params) {
  try {
    return (await env.DB.prepare(sql).bind(...params).all()).results;
  } catch (e) {
    throw mapDbError(e);
  }
}
export async function q1(env, sql, ...params) {
  try {
    return await env.DB.prepare(sql).bind(...params).first();
  } catch (e) {
    throw mapDbError(e);
  }
}
export async function run(env, sql, ...params) {
  try {
    return await env.DB.prepare(sql).bind(...params).run();
  } catch (e) {
    throw mapDbError(e);
  }
}
export async function batch(env, stmts) {
  try {
    return await env.DB.batch(stmts);
  } catch (e) {
    throw mapDbError(e);
  }
}

// ---------- Counters & numbering ----------
export async function nextSeq(env, key) {
  const r = await env.DB.prepare('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value').bind(key).first();
  return r.value;
}

export async function makeNumber(env, kind, branchCode = 'GK', date = localDate()) {
  const [y, m, d] = date.split('-');
  const yy = y.slice(2);
  const bc = (branchCode || 'GK').toUpperCase();
  const seq = async (key, pad) => String(await nextSeq(env, key)).padStart(pad, '0');
  switch (kind) {
    case 'mrn': return 'RM-' + (await seq('mrn', 6));
    case 'booking': return `GK${yy}${m}${d}-${code(4)}`;
    case 'visit': return `KJ-${bc}-${yy}${m}${d}-${await seq(`visit:${bc}:${date}`, 3)}`;
    case 'invoice': return `INV/${bc}/${y}/${m}/${await seq(`inv:${bc}:${y}${m}`, 5)}`;
    case 'payment': return `PAY-${bc}-${yy}${m}-${await seq(`pay:${bc}:${y}${m}`, 5)}`;
    case 'rx': return `RX-${bc}-${yy}${m}-${await seq(`rx:${bc}:${y}${m}`, 5)}`;
    case 'lab': return `LAB-${bc}-${yy}${m}-${await seq(`lab:${bc}:${y}${m}`, 5)}`;
    case 'refund': return `RF-${bc}-${yy}${m}-${await seq(`rf:${bc}:${y}${m}`, 4)}`;
    case 'claim': return `CLM-${bc}-${yy}${m}-${await seq(`clm:${bc}:${y}${m}`, 4)}`;
    case 'po': return `PO-${bc}-${yy}${m}-${await seq(`po:${bc}:${y}${m}`, 4)}`;
    default: return `${kind.toUpperCase()}-${Date.now()}`;
  }
}

export async function queueSeq(env, branchId, poliId, date) {
  return nextSeq(env, `q:${branchId}:${poliId}:${date}`);
}

// ---------- Generic CRUD ----------
export async function d1List(env, e, opts = {}, scopeBranch = null) {
  const cols = ['id', ...storedFields(e).filter((f) => !f.secret).map((f) => f.key), 'created_at', 'updated_at'];
  const where = [];
  const params = [];
  if (scopeBranch && e.branch) {
    where.push(`${e.branch} = ?`);
    params.push(scopeBranch);
  }
  for (const [k, v] of Object.entries(opts.filters || {})) {
    const f = e.fields.find((x) => x.key === k);
    if (!f || v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      where.push(`${k} IN (${v.map(() => '?').join(',')})`);
      params.push(...v.map((x) => coerce(f, x)));
    } else {
      where.push(`${k} = ?`);
      params.push(coerce(f, v));
    }
  }
  if (opts.q) {
    const sf = e.fields.filter((f) => f.search);
    if (sf.length) {
      where.push('(' + sf.map((f) => `${f.key} LIKE ?`).join(' OR ') + ')');
      for (let i = 0; i < sf.length; i++) params.push(`%${String(opts.q).slice(0, 100)}%`);
    }
  }
  const df = e.dateField;
  if (df && opts.from) {
    where.push(`${df} >= ?`);
    params.push(opts.from);
  }
  if (df && opts.to) {
    where.push(`${df} <= ?`);
    params.push(opts.to);
  }
  if (opts.idGt) {
    where.push('id > ?');
    params.push(Number(opts.idGt));
  }
  if (opts.updatedAfter) {
    where.push('updated_at > ?');
    params.push(opts.updatedAfter);
  }
  const sortable = new Set(['id', 'created_at', 'updated_at', ...e.fields.map((f) => f.key)]);
  const sort = sortable.has(opts.sort) ? opts.sort : 'id';
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = clamp(opts.limit || 25, 1, opts.max || 200);
  const page = clamp(opts.page || 1, 1, 100000);
  const sql = `SELECT ${cols.join(', ')} FROM ${e.name}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} ${dir}${sort !== 'id' ? ', id DESC' : ''} LIMIT ? OFFSET ?`;
  const results = await q(env, sql, ...params, limit + 1, (page - 1) * limit);
  return { rows: results.slice(0, limit).map((r) => decode(e, r)), page, limit, hasMore: results.length > limit };
}

export async function refLabels(env, e, rows) {
  const out = {};
  const groups = {};
  for (const f of e.fields) {
    if (!isD1Ref(f)) continue;
    const ids = [...new Set(rows.map((r) => r[f.key]).filter((x) => x !== null && x !== undefined && x !== ''))];
    if (!ids.length) continue;
    (groups[f.ref] ||= { fields: [], ids: new Set() }).fields.push(f.key);
    ids.forEach((i) => groups[f.ref].ids.add(i));
  }
  await Promise.all(
    Object.entries(groups).map(async ([table, g]) => {
      const t = ENTITIES[table];
      const lf = t.labelField || 'id';
      const lx = t.labelExtra;
      const ids = [...g.ids].slice(0, 200);
      const rs = await q(env, `SELECT id, ${lf}${lx ? ', ' + lx : ''} FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
      const map = Object.fromEntries(rs.map((r) => [r.id, lx && r[lx] ? `${r[lf]} · ${r[lx]}` : String(r[lf] ?? r.id)]));
      for (const k of g.fields) out[k] = map;
    })
  );
  return out;
}

export async function d1Get(env, e, id, opts) {
  const row = await q1(env, `SELECT * FROM ${e.name} WHERE id = ?`, Number(id));
  if (!row) throw notFound();
  return decode(e, row, opts);
}

export async function d1Insert(env, e, data, userId = null) {
  const fields = storedFields(e).filter((f) => data[f.key] !== undefined);
  const cols = fields.map((f) => f.key);
  const vals = fields.map((f) => coerce(f, data[f.key]));
  const now = nowISO();
  cols.push('created_at', 'updated_at', 'created_by');
  vals.push(data.created_at || now, now, userId);
  const r = await q1(env, `INSERT INTO ${e.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`, ...vals);
  return r.id;
}

export function insertStmt(env, e, data, userId = null) {
  const fields = storedFields(e).filter((f) => data[f.key] !== undefined);
  const cols = fields.map((f) => f.key);
  const vals = fields.map((f) => coerce(f, data[f.key]));
  const now = nowISO();
  cols.push('created_at', 'updated_at', 'created_by');
  vals.push(now, now, userId);
  return env.DB.prepare(`INSERT INTO ${e.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...vals);
}

export function updateStmt(env, e, id, data) {
  const fields = storedFields(e).filter((f) => data[f.key] !== undefined);
  const sets = fields.map((f) => `${f.key} = ?`);
  const vals = fields.map((f) => coerce(f, data[f.key]));
  sets.push('updated_at = ?');
  vals.push(nowISO());
  return env.DB.prepare(`UPDATE ${e.name} SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, Number(id));
}

export async function d1Update(env, e, id, data) {
  try {
    const r = await updateStmt(env, e, id, data).run();
    if (!r.meta?.changes) throw notFound();
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function d1Delete(env, e, id) {
  const r = await run(env, `DELETE FROM ${e.name} WHERE id = ?`, Number(id));
  if (!r.meta?.changes) throw notFound();
}

// ---------- Audit ----------
export function audit(ctx, action, entity, entityId, detail) {
  const s = ctx.session || {};
  const text = detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 4000) : '';
  const p = ctx.env.DB.prepare(
    'INSERT INTO audit_logs (date, user_id, username, role, action, entity, entity_id, ip, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  )
    .bind(localDate(), s.uid ?? null, s.username ?? 'public', s.role ?? '', action, entity ?? '', entityId != null ? String(entityId) : '', ctx.ip || '', text, nowISO())
    .run()
    .catch(() => {});
  ctx.waitUntil(p);
}

export { conflict };
