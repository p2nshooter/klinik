// System: media library (R2, public), private files (R2, access-checked), backups & restore (D1 → R2 NDJSON),
// status, blueprint, SATU SEHAT tools, cache rebuild.
import blueprintText from '../../BLUEPRINT.md';
import { canAny, requirePerm, requireStaff } from '../lib/auth.js';
import { getBundle, rebuildBundle } from '../lib/cms.js';
import { audit, q, q1 } from '../lib/db.js';
import { notify } from '../lib/notify.js';
import { buildEncounterBundle, buildLabBundle, processQueue } from '../lib/satusehat.js';
import { ENTITIES } from '../schema/entities.js';
import { badRequest, forbidden, json, localDate, notFound, nowISO, readJSON, rid, slugify, unauthorized } from '../lib/util.js';

const IMG = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/;
const DOC = /^(application\/pdf|image\/(png|jpe?g|webp|heic)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/plain)$/;
const MAX = 10 * 1024 * 1024;

function safeName(name) {
  const n = String(name || 'file');
  const dot = n.lastIndexOf('.');
  const ext = dot > 0 ? n.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : 'bin';
  return `${slugify(dot > 0 ? n.slice(0, dot) : n) || 'file'}.${ext}`;
}

// ---------------------------------------------------------------- media (public images for website)
export async function mediaUpload(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'media:manage', 'settings:update')) throw forbidden();
  const form = await ctx.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw badRequest('File tidak ditemukan');
  if (!IMG.test(file.type)) throw badRequest('Hanya gambar (PNG, JPG, WEBP, GIF, SVG, AVIF)');
  if (file.size > MAX) throw badRequest('Ukuran maksimal 10 MB');
  const d = localDate();
  const key = `media/${d.slice(0, 7)}/${rid(8)}-${safeName(file.name)}`;
  await ctx.env.R2.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { name: String(file.name).slice(0, 200), by: ctx.session.username } });
  audit(ctx, 'upload', 'media', key);
  return json({ ok: true, key, url: '/' + key, name: file.name, size: file.size }, 201);
}

export async function mediaList(ctx) {
  requireStaff(ctx);
  const r = await ctx.env.R2.list({ prefix: 'media/', cursor: ctx.url.searchParams.get('cursor') || undefined, limit: 100, include: ['customMetadata', 'httpMetadata'] });
  return json({ rows: r.objects.map((o) => ({ key: o.key, url: '/' + o.key, size: o.size, uploaded: o.uploaded, name: o.customMetadata?.name || o.key.split('/').pop(), type: o.httpMetadata?.contentType })).sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded))), cursor: r.truncated ? r.cursor : null });
}

export async function mediaDelete(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'media:manage', 'settings:update')) throw forbidden();
  const key = ctx.url.searchParams.get('key') || '';
  if (!key.startsWith('media/')) throw badRequest('Key tidak valid');
  await ctx.env.R2.delete(key);
  audit(ctx, 'delete', 'media', key);
  return json({ ok: true });
}

export async function serveMedia(ctx) {
  const key = 'media/' + ctx.params.path;
  const obj = await ctx.env.R2.get(key, { onlyIf: ctx.req.headers });
  if (!obj) throw notFound('File tidak ditemukan');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (headers.get('content-type') === 'image/svg+xml') headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------- private files (medical documents, payment proofs)
export async function storePrivate(ctx, file, folder = 'docs') {
  if (!DOC.test(file.type)) throw badRequest('Format file tidak didukung (PDF, gambar, Word, teks)');
  if (file.size > MAX) throw badRequest('Ukuran maksimal 10 MB');
  const key = `${folder}/${localDate().slice(0, 7)}/${rid(16)}-${safeName(file.name)}`;
  await ctx.env.R2.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { name: String(file.name).slice(0, 200), by: ctx.session?.username || '' } });
  return key;
}

export async function fileUpload(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'documents:create', 'clinic:examine', 'lab:process', 'payments:create', 'billing:cashier')) throw forbidden();
  const form = await ctx.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw badRequest('File tidak ditemukan');
  const key = await storePrivate(ctx, file, 'docs');
  audit(ctx, 'upload', 'files', key);
  return json({ ok: true, key, name: file.name, size: file.size, type: file.type }, 201);
}

export async function fileGet(ctx) {
  if (!ctx.session) throw unauthorized();
  const key = ctx.url.searchParams.get('key') || '';
  if (!/^(docs|proofs)\//.test(key)) throw badRequest('Key tidak valid');
  if (ctx.session.role === 'patient') {
    const pid = ctx.session.patient_id;
    const own = (await q1(ctx.env, 'SELECT id FROM documents WHERE file = ? AND patient_id = ? AND shared_with_patient = 1', key, pid)) || (await q1(ctx.env, 'SELECT id FROM payments WHERE proof = ? AND patient_id = ?', key, pid));
    if (!own) throw forbidden();
  } else if (!canAny(ctx, 'documents:view', 'payments:view', 'billing:cashier', 'clinic:examine', 'medical_records:view')) throw forbidden();
  const obj = await ctx.env.R2.get(key);
  if (!obj) throw notFound();
  audit(ctx, 'download', 'files', key);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('content-disposition', `${ctx.url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${(obj.customMetadata?.name || key.split('/').pop()).replace(/"/g, '')}"`);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------- backup & restore
const D1_TABLES = ['counters', ...Object.keys(ENTITIES).filter((n) => ENTITIES[n].store === 'd1')];

/** Incremental (rows updated since last run) or full export of every D1 table to R2 as NDJSON. */
export async function runBackup(env, { full = false, by = 'cron' } = {}) {
  const stamp = nowISO().replace(/[:]/g, '').replace('T', '-').slice(0, 15);
  const prefix = `backups/${localDate()}/${stamp}-${full ? 'full' : 'inc'}/`;
  const marks = (full ? null : await env.KV.get('backup:marks', { type: 'json' })) || {};
  const nextMarks = { ...marks };
  const manifest = { created_at: nowISO(), type: full ? 'full' : 'incremental', by, tables: {} };
  for (const t of D1_TABLES) {
    const since = marks[t];
    let lastId = 0, count = 0, maxUpdated = since || '';
    const lines = [];
    for (;;) {
      const sql = t === 'counters' ? 'SELECT rowid AS _rid, * FROM counters WHERE rowid > ? ORDER BY rowid LIMIT 1000' : `SELECT * FROM ${t} WHERE id > ?${since ? ' AND updated_at > ?' : ''} ORDER BY id LIMIT 1000`;
      const rows = await q(env, sql, lastId, ...(since && t !== 'counters' ? [since] : []));
      for (const r of rows) {
        lines.push(JSON.stringify(r));
        if (r.updated_at && r.updated_at > maxUpdated) maxUpdated = r.updated_at;
      }
      count += rows.length;
      if (rows.length < 1000) break;
      lastId = t === 'counters' ? rows[rows.length - 1]._rid : rows[rows.length - 1].id;
    }
    if (count) await env.R2.put(prefix + t + '.ndjson', lines.join('\n'), { httpMetadata: { contentType: 'application/x-ndjson' } });
    manifest.tables[t] = count;
    if (maxUpdated) nextMarks[t] = maxUpdated;
  }
  await env.R2.put(prefix + 'manifest.json', JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: 'application/json' } });
  // CMS snapshot (content is small) so a restore brings back the website too
  const cms = await env.R2.list({ prefix: 'cms/' });
  for (const o of cms.objects) {
    const obj = await env.R2.get(o.key);
    if (obj) await env.R2.put(prefix + o.key, await obj.arrayBuffer(), { httpMetadata: { contentType: 'application/json' } });
  }
  await env.KV.put('backup:marks', JSON.stringify(nextMarks));
  await env.KV.put('backup:last', JSON.stringify({ at: nowISO(), prefix, type: manifest.type, rows: Object.values(manifest.tables).reduce((a, b) => a + b, 0) }));
  return { prefix, manifest };
}

export async function backupNow(ctx) {
  requirePerm(ctx, 'system:backup');
  const b = await readJSON(ctx.req);
  const res = await runBackup(ctx.env, { full: b.full !== false, by: ctx.session.username });
  audit(ctx, 'backup', 'system', res.prefix);
  return json({ ok: true, ...res });
}

export async function backupList(ctx) {
  requirePerm(ctx, 'system:backup');
  const r = await ctx.env.R2.list({ prefix: 'backups/', limit: 1000 });
  const sets = new Map();
  for (const o of r.objects) {
    const parts = o.key.split('/');
    const set = parts.slice(0, 3).join('/') + '/';
    const s = sets.get(set) || { prefix: set, files: [], size: 0, uploaded: o.uploaded };
    s.files.push({ key: o.key, name: parts.slice(3).join('/'), size: o.size });
    s.size += o.size;
    sets.set(set, s);
  }
  return json({ rows: [...sets.values()].sort((a, b) => b.prefix.localeCompare(a.prefix)), last: await ctx.env.KV.get('backup:last', { type: 'json' }) });
}

export async function backupFile(ctx) {
  requirePerm(ctx, 'system:backup');
  const key = ctx.url.searchParams.get('key') || '';
  if (!key.startsWith('backups/')) throw badRequest('Key tidak valid');
  const obj = await ctx.env.R2.get(key);
  if (!obj) throw notFound();
  audit(ctx, 'download', 'backup', key);
  return new Response(obj.body, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${key.replace(/\//g, '_')}"` } });
}

export async function restore(ctx) {
  requirePerm(ctx, 'system:backup');
  if (ctx.session.role !== 'superadmin') throw forbidden('Restore hanya untuk Super Admin');
  const b = await readJSON(ctx.req);
  if (b.confirm !== 'RESTORE') throw badRequest('Ketik RESTORE untuk konfirmasi');
  const prefix = String(b.prefix || '');
  if (!/^backups\/\d{4}-\d{2}-\d{2}\/[\w-]+\/$/.test(prefix)) throw badRequest('Backup tidak valid');
  const tables = Array.isArray(b.tables) && b.tables.length ? b.tables.filter((t) => D1_TABLES.includes(t)) : D1_TABLES;
  const result = {};
  for (const t of tables) {
    const obj = await ctx.env.R2.get(prefix + t + '.ndjson');
    if (!obj) continue;
    const lines = (await obj.text()).split('\n').filter(Boolean);
    let n = 0;
    for (let i = 0; i < lines.length; i += 50) {
      const stmts = lines.slice(i, i + 50).map((l) => {
        const r = JSON.parse(l);
        delete r._rid;
        const cols = Object.keys(r).filter((c) => /^\w+$/.test(c));
        return ctx.env.DB.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => r[c]));
      });
      await ctx.env.DB.batch(stmts);
      n += stmts.length;
    }
    result[t] = n;
  }
  if (b.cms) {
    const r = await ctx.env.R2.list({ prefix: prefix + 'cms/' });
    for (const o of r.objects) {
      const obj = await ctx.env.R2.get(o.key);
      if (obj) await ctx.env.R2.put(o.key.slice(prefix.length), await obj.arrayBuffer(), { httpMetadata: { contentType: 'application/json' } });
    }
    await rebuildBundle(ctx.env);
    result.cms = r.objects.length;
  }
  audit(ctx, 'restore', 'system', prefix, result);
  return json({ ok: true, result });
}

/** Archive audit logs older than 90 days to R2 and remove them from D1 (keeps D1 small & fast). */
export async function archiveAudit(env) {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const rows = await q(env, 'SELECT * FROM audit_logs WHERE date < ? ORDER BY id LIMIT 5000', cutoff);
  if (!rows.length) return 0;
  await env.R2.put(`archive/audit/${cutoff}-${rows[0].id}-${rows[rows.length - 1].id}.ndjson`, rows.map((r) => JSON.stringify(r)).join('\n'));
  await env.DB.prepare('DELETE FROM audit_logs WHERE id <= ? AND date < ?').bind(rows[rows.length - 1].id, cutoff).run();
  return rows.length;
}

// ---------------------------------------------------------------- status & tools
export async function status(ctx) {
  requireStaff(ctx);
  const env = ctx.env;
  const t0 = Date.now();
  const d1 = await q1(env, 'SELECT COUNT(*) AS n FROM counters').then(() => Date.now() - t0).catch((e) => 'error: ' + e.message);
  const t1 = Date.now();
  const bundle = await getBundle(env);
  const kv = Date.now() - t1;
  const t2 = Date.now();
  const r2 = await env.R2.head('cms/settings.json').then(() => Date.now() - t2).catch(() => 'error');
  return json({
    app: env.APP_NAME, version: env.APP_VERSION, time: nowISO(), bundle_ver: bundle.ver,
    latency_ms: { d1, kv, r2 },
    integrations: { midtrans: !!env.MIDTRANS_SERVER_KEY, resend: !!env.RESEND_API_KEY, whatsapp: !!env.WA_TOKEN, satusehat: !!env.SATUSEHAT_CLIENT_ID, sms: !!env.SMS_API_URL },
    backup: await env.KV.get('backup:last', { type: 'json' }),
    storage: { d1: 'global-klinik-db', kv: ['global-klinik-kv', 'global-klinik-sessions'], r2: 'global-klinik-storage' },
  });
}

export async function blueprint(ctx) {
  requireStaff(ctx);
  return json({ markdown: blueprintText });
}

export async function satusehatPreview(ctx) {
  requirePerm(ctx, 'system:satusehat');
  const { type, id } = ctx.params;
  const bundle = type === 'lab' ? await buildLabBundle(ctx.env, id) : await buildEncounterBundle(ctx.env, id);
  return json(bundle);
}

export async function satusehatRun(ctx) {
  requirePerm(ctx, 'system:satusehat');
  const res = await processQueue(ctx.env, 20);
  audit(ctx, 'satusehat_run', 'system', null, res);
  return json(res);
}

export async function satusehatQueue(ctx) {
  requirePerm(ctx, 'system:satusehat');
  const b = await readJSON(ctx.req);
  const res = String(b.resource) === 'DiagnosticReport' ? 'DiagnosticReport' : 'Encounter';
  await ctx.env.DB.prepare("INSERT INTO satusehat_sync (resource, local_id, status, attempts, created_at, updated_at) VALUES (?, ?, 'pending', 0, ?, ?)").bind(res, String(b.local_id), nowISO(), nowISO()).run();
  return json({ ok: true });
}

export async function notifyTest(ctx) {
  requirePerm(ctx, 'settings:update');
  const b = await readJSON(ctx.req);
  const r = await notify(ctx.env, { template: 'custom', data: { text: b.text || 'Tes notifikasi Global Klinik ✅' }, phone: b.phone, email: b.email, channels: ['wa', 'email', 'sms'], ref: 'test' });
  return json(r);
}

export async function rebuildCache(ctx) {
  requirePerm(ctx, 'settings:update');
  const b = await rebuildBundle(ctx.env);
  audit(ctx, 'rebuild_cache', 'system', b.ver);
  return json({ ok: true, ver: b.ver });
}
