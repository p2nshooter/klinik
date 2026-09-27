// Generic, registry-driven CRUD for every entity (D1 + CMS) with per-entity business hooks.
import { can, destroyUserSessions, requirePerm, requireStaff, userBranch } from '../lib/auth.js';
import { byId, cmsCreate, cmsDelete, cmsGet, cmsList, cmsReorder, cmsUpdate, getBundle, rebuildBundle } from '../lib/cms.js';
import { branchCode, bumpStats, computeTotals, meetUrl, refreshQueue } from '../lib/clinic.js';
import { hashPassword, passwordProblems } from '../lib/crypto.js';
import { audit, batch, d1Delete, d1Get, d1Insert, d1List, d1Update, insertStmt, makeNumber, nextSeq, q1, refLabels, run } from '../lib/db.js';
import { BLOCK_TYPES, ENTITIES, GROUPS, OPTIONS, SPECIAL_PERMS } from '../schema/entities.js';
import { badRequest, conflict, forbidden, json, localDate, notFound, readJSON } from '../lib/util.js';
import { createPatient, createVisit, promoteWaitlist, recordPayment, settleInvoice } from './shared.js';

const str = (v, max = 20000) => (v === null || v === undefined ? '' : String(v).slice(0, max));

export function cleanValue(f, v) {
  if (v === undefined) return undefined;
  if (f.i18n && ['text', 'textarea', 'markdown'].includes(f.type)) {
    if (v && typeof v === 'object') return { id: str(v.id, 50000), en: str(v.en, 50000) };
    return { id: str(v, 50000), en: str(v, 50000) };
  }
  switch (f.type) {
    case 'number':
    case 'money': {
      if (v === '' || v === null) return null;
      const n = Number(String(v).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
    case 'refs':
    case 'tags':
      return (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => str(x, 200).trim()).filter(Boolean).slice(0, 200);
    case 'perms':
      return (Array.isArray(v) ? v : []).map((x) => str(x, 80).trim()).filter((p) => /^!?(\*|[\w]+:[\w*]+|\*:[\w]+)$/.test(p));
    case 'items':
      return (Array.isArray(v) ? v : [])
        .slice(0, 500)
        .map((row) => {
          const o = {};
          for (const c of f.columns || []) if (row?.[c.key] !== undefined) o[c.key] = cleanValue(c, row[c.key]);
          for (const k of ['auto', 'ref', 'kind', 'total', 'unit', 'price', 'test_id', 'medicine_id']) if (row?.[k] !== undefined && o[k] === undefined) o[k] = row[k];
          return o;
        });
    case 'blocks':
      return (Array.isArray(v) ? v : []).slice(0, 60).filter((b) => b && BLOCK_TYPES.some(([t]) => t === b.type));
    case 'json':
      return v && typeof v === 'object' ? v : null;
    case 'color':
      return /^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : '';
    case 'ref':
      return v === null || v === '' ? null : str(v, 100);
    default:
      return str(v);
  }
}

function sanitize(e, input, { partial }) {
  const out = {};
  for (const f of e.fields) {
    if (f.readonly || f.hidden || f.secret) continue;
    if (!(f.key in input)) continue;
    const v = cleanValue(f, input[f.key]);
    if (v !== undefined) out[f.key] = v;
  }
  if (!partial) {
    for (const f of e.fields) {
      if (!f.required || f.readonly) continue;
      const v = out[f.key];
      const emptyI18n = f.i18n && v && typeof v === 'object' && !v.id && !v.en;
      if (v === undefined || v === null || v === '' || emptyI18n) throw badRequest(`${f.label[0]} wajib diisi`);
      if (f.type !== 'password' && Array.isArray(v) && f.type === 'refs' && !v.length) throw badRequest(`${f.label[0]} wajib diisi`);
    }
    for (const f of e.fields) if (out[f.key] === undefined && f.default !== undefined && !f.readonly) out[f.key] = f.default;
  }
  return out;
}

function getEntity(name) {
  const e = ENTITIES[name];
  if (!e) throw notFound('Modul tidak dikenal');
  return { name, ...e };
}

function scopedBranch(ctx, e, data) {
  const b = userBranch(ctx);
  if (b && e.branch) {
    if (data[e.branch] && data[e.branch] !== b) throw forbidden('Anda hanya dapat mengelola data cabang Anda');
    data[e.branch] = b;
  }
}

// ---------------------------------------------------------------- hooks
const HOOKS = {
  users: {
    async beforeSave(ctx, data, { id, input }) {
      if (data.username) {
        data.username = data.username.trim().toLowerCase();
        if (!/^[a-z0-9._@+-]{3,64}$/.test(data.username)) throw badRequest('Username hanya huruf kecil, angka, titik, strip (3-64)');
      }
      if ((data.role === 'superadmin' || input?.role === 'superadmin') && ctx.session.role !== 'superadmin') throw forbidden('Hanya Super Admin yang dapat menetapkan peran Super Admin');
      if (input.password) {
        const err = passwordProblems(input.password);
        if (err) throw badRequest(err);
        data.password_hash = await hashPassword(String(input.password));
      } else if (!id) throw badRequest('Password wajib diisi untuk pengguna baru');
      if (!id) data.totp_enabled = 0;
    },
    async afterSave(ctx, id, data, { input }) {
      if (input.password || data.status === 'suspended' || data.role) await destroyUserSessions(ctx.env, id, ctx.session.uid === Number(id) ? ctx.session.token : undefined);
    },
    async beforeDelete(ctx, id) {
      if (Number(id) === ctx.session.uid) throw badRequest('Tidak dapat menghapus akun Anda sendiri');
      const u = await q1(ctx.env, 'SELECT role FROM users WHERE id = ?', Number(id));
      if (u?.role === 'superadmin' && ctx.session.role !== 'superadmin') throw forbidden();
      await destroyUserSessions(ctx.env, Number(id));
    },
  },
  patients: {
    async create(ctx, data) {
      return createPatient(ctx, data);
    },
  },
  visits: {
    async create(ctx, data) {
      if (!can(ctx.perms, 'clinic:register') && !can(ctx.perms, 'visits:create')) throw forbidden();
      return createVisit(ctx, data);
    },
    async afterSave(ctx, id) {
      const v = await q1(ctx.env, 'SELECT branch_id, date FROM visits WHERE id = ?', Number(id));
      if (v) ctx.waitUntil(refreshQueue(ctx.env, v.branch_id, v.date).catch(() => {}));
    },
  },
  appointments: {
    async beforeSave(ctx, data, { id, before }) {
      if (!id) {
        data.booking_no = await makeNumber(ctx.env, 'booking');
        data.source = 'admin';
        data.status ||= 'confirmed';
        if (data.type === 'telemedicine') data.meet_url = meetUrl(data.booking_no);
      } else if (before && (data.date && data.date !== before.date || data.time && data.time !== before.time)) data.reminded = 0;
      if (data.type === 'telemedicine' && !before?.meet_url && id) data.meet_url = meetUrl(before?.booking_no || 'GK');
    },
    async afterSave(ctx, id, data, { before }) {
      if (before && ((data.status && data.status === 'cancelled' && before.status !== 'cancelled') || (data.date && data.date !== before.date) || (data.time && data.time !== before.time))) ctx.waitUntil(promoteWaitlist(ctx, before).catch(() => {}));
    },
  },
  invoices: {
    async beforeSave(ctx, data, { id, before }) {
      if (before && ['paid', 'refunded', 'void'].includes(before.status) && (data.items || data.discount !== undefined)) throw badRequest('Invoice yang sudah lunas/batal tidak dapat diubah');
      const bundle = await getBundle(ctx.env);
      if (!id) {
        data.date ||= localDate();
        data.invoice_no = await makeNumber(ctx.env, 'invoice', branchCode(bundle, data.branch_id));
        data.paid = 0;
      }
      if (data.items || data.discount !== undefined) {
        const items = (data.items || before?.items || []).map((i) => ({ ...i, total: Math.max(0, (Number(i.qty) || 0) * (Number(i.price) || 0) - (Number(i.discount) || 0)) }));
        const t = computeTotals(items, data.discount ?? before?.discount, bundle.settings?.tax_percent);
        Object.assign(data, { items, ...t });
        const paid = Number(before?.paid) || 0;
        if (!data.status || data.status === 'unpaid' || data.status === 'partial' || data.status === 'paid') data.status = t.total <= 0 ? 'paid' : paid <= 0 ? (data.status === 'draft' ? 'draft' : 'unpaid') : paid >= t.total ? 'paid' : 'partial';
      }
    },
    async beforeDelete(ctx, id) {
      const p = await q1(ctx.env, "SELECT id FROM payments WHERE invoice_id = ? AND status IN ('confirmed','pending') LIMIT 1", Number(id));
      if (p) throw conflict('Invoice memiliki pembayaran. Gunakan Void / Refund.');
    },
  },
  payments: {
    async create(ctx, data) {
      if (!can(ctx.perms, 'billing:cashier') && !can(ctx.perms, 'payments:create')) throw forbidden();
      const inv = await q1(ctx.env, 'SELECT * FROM invoices WHERE id = ?', Number(data.invoice_id));
      if (!inv) throw notFound('Invoice tidak ditemukan');
      return recordPayment(ctx, inv, { method: data.method, amount: data.amount, reference: data.reference, status: data.status || 'confirmed', proof: data.proof, notes: data.notes });
    },
    async beforeSave(ctx, data, { before }) {
      if (before && data.status === 'confirmed' && before.status !== 'confirmed') data.confirmed_by = ctx.session.name;
    },
    async afterSave(ctx, id, data, { before }) {
      if (before && data.status && data.status !== before.status) await settleInvoice(ctx, before.invoice_id, data.status === 'confirmed' ? { ...before, ...data } : null);
    },
    async beforeDelete(ctx, id) {
      const p = await q1(ctx.env, 'SELECT status FROM payments WHERE id = ?', Number(id));
      if (p?.status === 'confirmed') throw conflict('Pembayaran terkonfirmasi tidak dapat dihapus. Gunakan refund.');
    },
  },
  refunds: {
    async create(ctx, data) {
      if (!can(ctx.perms, 'billing:refund') && !can(ctx.perms, 'refunds:create')) throw forbidden();
      return processRefund(ctx, Number(data.payment_id), data.amount, data.reason);
    },
  },
  claims: {
    async beforeSave(ctx, data, { id }) {
      if (!id) {
        const bundle = await getBundle(ctx.env);
        data.claim_no = await makeNumber(ctx.env, 'claim', branchCode(bundle, data.branch_id));
        data.date ||= localDate();
      }
    },
  },
  purchase_orders: {
    async beforeSave(ctx, data, { id, before }) {
      if (before?.status === 'received' && data.items) throw badRequest('PO yang sudah diterima tidak dapat diubah');
      if (!id) {
        const bundle = await getBundle(ctx.env);
        data.po_no = await makeNumber(ctx.env, 'po', branchCode(bundle, data.branch_id));
      }
      if (data.items) data.total = data.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
      if (data.status === 'received' && before?.status !== 'received') throw badRequest('Gunakan tombol "Terima barang" untuk menerima PO');
    },
  },
  prescriptions: {
    async beforeSave(ctx, data, { id }) {
      if (!id) {
        const bundle = await getBundle(ctx.env);
        data.rx_no = await makeNumber(ctx.env, 'rx', branchCode(bundle, data.branch_id));
        data.date = localDate();
      }
    },
  },
  lab_orders: {
    async beforeSave(ctx, data, { id }) {
      const bundle = await getBundle(ctx.env);
      if (!id) {
        data.lab_no = await makeNumber(ctx.env, 'lab', branchCode(bundle, data.branch_id));
        data.date = localDate();
      }
      if (data.tests) data.tests = data.tests.map((t) => labFlag(bundle, t));
    },
  },
  medicines: {
    async beforeSave(ctx, data, { id }) {
      if (!id && !data.code) data.code = 'OBT-' + String(await nextSeq(ctx.env, 'medicine')).padStart(5, '0');
    },
  },
  coupons: {
    async beforeSave(ctx, data) {
      if (data.code) data.code = data.code.trim().toUpperCase();
    },
  },
  documents: {
    async beforeSave(ctx, data, { id }) {
      if (!id) data.uploaded_by = ctx.session.name;
    },
  },
  roles: {
    async beforeSave(ctx, data, { before }) {
      if (data.code) data.code = data.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if ((data.perms || []).includes('*') && ctx.session.role !== 'superadmin') throw forbidden('Hanya Super Admin yang dapat memberi akses penuh');
      if (before?.id === 'superadmin' && ctx.session.role !== 'superadmin') throw forbidden();
    },
  },
};

export function labFlag(bundle, t) {
  const m = byId(bundle.lab_tests, t.test_id);
  const out = { ...t };
  if (m) {
    out.name ||= m.name;
    out.unit ||= m.unit;
    out.ref ||= m.ref_text || (m.ref_low != null && m.ref_high != null ? `${m.ref_low} – ${m.ref_high}` : '');
    if (out.price === undefined || out.price === null || out.price === '') out.price = m.price;
    const v = parseFloat(String(t.result ?? '').replace(',', '.'));
    if (Number.isFinite(v) && !t.flag_manual) {
      out.flag = m.ref_high != null && v > Number(m.ref_high) ? 'H' : m.ref_low != null && v < Number(m.ref_low) ? 'L' : '';
    }
  }
  return out;
}

export async function processRefund(ctx, paymentId, amount, reason) {
  const env = ctx.env;
  const pay = await q1(env, 'SELECT * FROM payments WHERE id = ?', paymentId);
  if (!pay) throw notFound('Pembayaran tidak ditemukan');
  if (pay.status !== 'confirmed') throw badRequest('Hanya pembayaran terkonfirmasi yang dapat direfund');
  amount = Math.round(Number(amount) || pay.amount);
  const done = await q1(env, "SELECT COALESCE(SUM(amount),0) AS s FROM refunds WHERE payment_id = ? AND status = 'processed'", paymentId);
  if (amount <= 0 || amount + done.s > pay.amount) throw badRequest('Jumlah refund melebihi pembayaran');
  if (!reason) throw badRequest('Alasan refund wajib diisi');
  const bundle = await getBundle(env);
  const rec = { refund_no: await makeNumber(env, 'refund', branchCode(bundle, pay.branch_id)), date: localDate(), payment_id: pay.id, invoice_id: pay.invoice_id, branch_id: pay.branch_id, amount, reason: String(reason).slice(0, 1000), status: 'processed', processed_by: ctx.session.name };
  const id = await d1Insert(env, ENTITIES_D1('refunds'), rec, ctx.session.uid);
  if (amount + done.s >= pay.amount) await run(env, "UPDATE payments SET status = 'refunded', updated_at = datetime('now') WHERE id = ?", pay.id);
  await settleInvoice(ctx, pay.invoice_id);
  bumpStats(ctx, pay.branch_id, { revenue: -amount, refunds: 1 });
  audit(ctx, 'refund', 'payments', pay.id, { amount, reason });
  return { id, ...rec };
}
const ENTITIES_D1 = (n) => ({ name: n, ...ENTITIES[n] });

// ---------------------------------------------------------------- handlers
function permFor(e, name, act) {
  return `${name}:${act}`;
}

export async function list(ctx) {
  const name = ctx.params.entity;
  const e = getEntity(name);
  const isPublicish = e.store === 'cms' && ['branches', 'polis', 'doctors', 'services', 'insurers', 'units', 'medicine_categories', 'procedures', 'lab_tests', 'rooms', 'schedules', 'membership_tiers', 'holidays'].includes(name);
  if (!(isPublicish && ctx.session && ctx.session.role !== 'patient')) requirePerm(ctx, permFor(e, name, 'view'));
  const u = ctx.url.searchParams;
  if (e.single) return json({ row: await cmsGet(ctx.env, name) });
  if (e.store === 'cms') {
    const rows = await cmsList(ctx.env, name, { full: u.get('full') === '1' });
    return json({ rows });
  }
  const filters = {};
  for (const [k, v] of u) if (k.startsWith('f_')) filters[k.slice(2)] = v.includes('|') ? v.split('|') : v;
  const res = await d1List(ctx.env, e, { q: u.get('q'), page: +u.get('page') || 1, limit: +u.get('limit') || 25, sort: u.get('sort'), dir: u.get('dir'), from: u.get('from'), to: u.get('to'), filters }, userBranch(ctx));
  res.refs = await refLabels(ctx.env, e, res.rows);
  return json(res);
}

export async function exportRows(ctx) {
  const name = ctx.params.entity;
  const e = getEntity(name);
  requirePerm(ctx, permFor(e, name, 'export'));
  audit(ctx, 'export', name, null);
  if (e.store === 'cms') return json({ rows: await cmsList(ctx.env, name, { full: true }) });
  const u = ctx.url.searchParams;
  const filters = {};
  for (const [k, v] of u) if (k.startsWith('f_')) filters[k.slice(2)] = v;
  const res = await d1List(ctx.env, e, { q: u.get('q'), limit: 5000, max: 5000, from: u.get('from'), to: u.get('to'), filters, sort: u.get('sort'), dir: u.get('dir') }, userBranch(ctx));
  res.refs = await refLabels(ctx.env, e, res.rows);
  return json(res);
}

export async function getOne(ctx) {
  const { entity: name, id } = ctx.params;
  const e = getEntity(name);
  requirePerm(ctx, permFor(e, name, 'view'));
  if (e.store === 'cms') return json({ row: await cmsGet(ctx.env, name, id) });
  const row = await d1Get(ctx.env, e, id);
  const b = userBranch(ctx);
  if (b && e.branch && row[e.branch] && row[e.branch] !== b) throw forbidden();
  if (name === 'patients' || name === 'medical_records') audit(ctx, 'view', name, id);
  return json({ row, refs: await refLabels(ctx.env, e, [row]) });
}

export async function create(ctx) {
  const name = ctx.params.entity;
  const e = getEntity(name);
  if (e.readonly || e.single) throw forbidden('Modul ini hanya-baca');
  requirePerm(ctx, permFor(e, name, 'create'));
  const input = await readJSON(ctx.req);
  const data = sanitize(e, input, { partial: false });
  const hook = HOOKS[name] || {};
  if (e.store === 'cms') {
    if (hook.beforeSave) await hook.beforeSave(ctx, data, { input });
    const row = await cmsCreate(ctx.env, name, data);
    audit(ctx, 'create', name, row.id);
    return json({ row }, 201);
  }
  scopedBranch(ctx, e, data);
  if (hook.create) {
    const row = await hook.create(ctx, { ...data, ...pickVirtual(e, input) });
    return json({ row }, 201);
  }
  if (hook.beforeSave) await hook.beforeSave(ctx, data, { input });
  for (const f of e.fields) {
    if (f.auto && !data[f.key]) {
      const bundle = await getBundle(ctx.env);
      data[f.key] = await makeNumber(ctx.env, f.auto, branchCode(bundle, data.branch_id));
    }
  }
  if (e.dateField === 'date' && !data.date) data.date = localDate();
  const id = await d1Insert(ctx.env, e, data, ctx.session.uid);
  if (hook.afterSave) await hook.afterSave(ctx, id, data, { input });
  audit(ctx, 'create', name, id);
  return json({ row: await d1Get(ctx.env, e, id) }, 201);
}

const pickVirtual = (e, input) => Object.fromEntries(e.fields.filter((f) => f.virtual && input[f.key] !== undefined).map((f) => [f.key, input[f.key]]));

export async function update(ctx) {
  const { entity: name, id } = ctx.params;
  const e = getEntity(name);
  if (e.readonly) throw forbidden('Modul ini hanya-baca');
  requirePerm(ctx, permFor(e, name, 'update'));
  const input = await readJSON(ctx.req);
  const data = sanitize(e, input, { partial: true });
  const hook = HOOKS[name] || {};
  if (e.store === 'cms') {
    const before = e.single ? null : await cmsGet(ctx.env, name, id);
    if (hook.beforeSave) await hook.beforeSave(ctx, data, { id, input, before });
    const row = await cmsUpdate(ctx.env, name, id, data);
    audit(ctx, 'update', name, id, Object.keys(data).join(','));
    return json({ row });
  }
  const before = await d1Get(ctx.env, e, id);
  const b = userBranch(ctx);
  if (b && e.branch && before[e.branch] && before[e.branch] !== b) throw forbidden();
  if (b && e.branch && data[e.branch] && data[e.branch] !== b) throw forbidden();
  if (hook.beforeSave) await hook.beforeSave(ctx, data, { id, input, before });
  if (Object.keys(data).length) await d1Update(ctx.env, e, id, data);
  if (hook.afterSave) await hook.afterSave(ctx, id, data, { input, before });
  audit(ctx, 'update', name, id, Object.keys(data).filter((k) => k !== 'password_hash').join(','));
  return json({ row: await d1Get(ctx.env, e, id) });
}

export async function remove(ctx) {
  const { entity: name, id } = ctx.params;
  const e = getEntity(name);
  if (e.readonly || e.single) throw forbidden('Modul ini hanya-baca');
  requirePerm(ctx, permFor(e, name, 'delete'));
  const hook = HOOKS[name] || {};
  if (hook.beforeDelete) await hook.beforeDelete(ctx, id);
  if (e.store === 'cms') await cmsDelete(ctx.env, name, id);
  else {
    const before = await d1Get(ctx.env, e, id);
    const b = userBranch(ctx);
    if (b && e.branch && before[e.branch] && before[e.branch] !== b) throw forbidden();
    await d1Delete(ctx.env, e, id);
  }
  audit(ctx, 'delete', name, id);
  return json({ ok: true });
}

export async function reorder(ctx) {
  const name = ctx.params.entity;
  const e = getEntity(name);
  if (e.store !== 'cms') throw badRequest('Tidak didukung');
  requirePerm(ctx, permFor(e, name, 'update'));
  const { ids } = await readJSON(ctx.req);
  await cmsReorder(ctx.env, name, (ids || []).map(String));
  return json({ ok: true });
}

export async function importRows(ctx) {
  const name = ctx.params.entity;
  const e = getEntity(name);
  if (e.readonly || e.single) throw forbidden();
  requirePerm(ctx, permFor(e, name, 'create'));
  const { rows } = await readJSON(ctx.req, 5_000_000);
  if (!Array.isArray(rows) || !rows.length) throw badRequest('Tidak ada data');
  if (rows.length > 1000) throw badRequest('Maksimal 1000 baris per impor');
  let ok = 0;
  const errors = [];
  if (e.store === 'cms') {
    for (const [i, r] of rows.entries()) {
      try {
        await cmsCreate(ctx.env, name, sanitize(e, r, { partial: false }));
        ok++;
      } catch (err) {
        errors.push(`Baris ${i + 2}: ${err.message}`);
      }
    }
  } else if (name === 'patients') {
    for (const [i, r] of rows.entries()) {
      try {
        await createPatient(ctx, sanitize(e, r, { partial: false }));
        ok++;
      } catch (err) {
        errors.push(`Baris ${i + 2}: ${err.message}`);
      }
    }
  } else {
    const stmts = [];
    for (const [i, r] of rows.entries()) {
      try {
        const d = sanitize(e, r, { partial: false });
        scopedBranch(ctx, e, d);
        if (HOOKS[name]?.beforeSave) await HOOKS[name].beforeSave(ctx, d, { input: r });
        stmts.push(insertStmt(ctx.env, e, d, ctx.session.uid));
      } catch (err) {
        errors.push(`Baris ${i + 2}: ${err.message}`);
      }
    }
    for (let i = 0; i < stmts.length; i += 50) {
      try {
        await batch(ctx.env, stmts.slice(i, i + 50));
        ok += Math.min(50, stmts.length - i);
      } catch (err) {
        errors.push(`Batch ${i / 50 + 1}: ${err.message}`);
      }
    }
  }
  audit(ctx, 'import', name, null, { ok, errors: errors.length });
  return json({ ok, errors: errors.slice(0, 50) });
}

/** Everything the staff app needs to render menus, forms and reference dropdowns (1 KV read). */
export async function meta(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const entities = {};
  for (const [n, e] of Object.entries(ENTITIES)) {
    entities[n] = { ...e, fields: e.fields.filter((f) => !f.secret) };
  }
  return json({ entities, groups: GROUPS, options: OPTIONS, blockTypes: BLOCK_TYPES, specialPerms: SPECIAL_PERMS, bundle, env: { midtrans: !!ctx.env.MIDTRANS_SERVER_KEY, resend: !!ctx.env.RESEND_API_KEY, wa: !!ctx.env.WA_TOKEN, satusehat: !!ctx.env.SATUSEHAT_CLIENT_ID } });
}

export async function rebuild(ctx) {
  requirePerm(ctx, 'settings:update');
  const b = await rebuildBundle(ctx.env);
  return json({ ok: true, ver: b.ver });
}
