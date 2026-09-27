// Shared clinic business logic: schedules & slots, queue snapshots (KV), daily stats counters, billing math.
import { active, byId, getBundle, priceFor } from './cms.js';
import { q, q1 } from './db.js';
import { addDays, localDate, localTime, minToTime, nowISO, timeToMin, tr, weekday } from './util.js';

export const branchCode = (bundle, id) => byId(bundle.branches, id)?.code || 'GK';

// ---------------------------------------------------------------- schedules / slots
export function schedulesFor(bundle, { doctorId, branchId, date, type }) {
  const wd = String(weekday(date));
  return active(bundle.schedules).filter(
    (s) =>
      (!doctorId || s.doctor_id === doctorId) &&
      (!branchId || s.branch_id === branchId) &&
      String(s.day) === wd &&
      (!type || !s.type || s.type === 'both' || s.type === type)
  );
}

export function holidayFor(bundle, date, branchId, doctorId) {
  return (bundle.holidays || []).find((h) => {
    const end = h.date_end || h.date;
    return date >= h.date && date <= end && (!h.branch_id || h.branch_id === branchId) && (!h.doctor_id || h.doctor_id === doctorId);
  });
}

export async function availableSlots(env, bundle, { doctorId, branchId, date, type }) {
  const scheds = schedulesFor(bundle, { doctorId, branchId, date, type });
  if (!scheds.length) return { slots: [], reason: 'no_schedule' };
  const hol = holidayFor(bundle, date, branchId, doctorId);
  if (hol) return { slots: [], reason: 'holiday', holiday: hol.name };
  const rows = await q(
    env,
    "SELECT time, COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND date = ? AND status NOT IN ('cancelled','waitlist','no_show') GROUP BY time",
    doctorId,
    date
  );
  const booked = Object.fromEntries(rows.map((r) => [r.time, r.c]));
  const today = localDate();
  const nowMin = timeToMin(localTime());
  const map = new Map();
  for (const s of scheds) {
    const step = Math.max(5, Number(s.slot_minutes) || 20);
    const quota = Math.max(1, Number(s.quota_per_slot) || 1);
    for (let m = timeToMin(s.start); m + step <= timeToMin(s.end); m += step) {
      const t = minToTime(m);
      const used = booked[t] || 0;
      const past = date < today || (date === today && m <= nowMin + 15);
      if (!map.has(t)) map.set(t, { time: t, available: !past && used < quota, left: Math.max(0, quota - used), quota, branch_id: s.branch_id });
    }
  }
  return { slots: [...map.values()].sort((a, b) => a.time.localeCompare(b.time)) };
}

/** Next dates (up to `days`) where a doctor has a schedule — used by the booking calendar. */
export function scheduleDays(bundle, doctorId, branchId, days = 30) {
  const out = [];
  const today = localDate();
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    if (schedulesFor(bundle, { doctorId, branchId, date: d }).length && !holidayFor(bundle, d, branchId, doctorId)) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------- queue snapshot in KV
export async function refreshQueue(env, branchId, date = localDate()) {
  const bundle = await getBundle(env);
  const rows = await q(
    env,
    `SELECT v.id, v.queue_no, v.queue_seq, v.poli_id, v.doctor_id, v.queue_status, v.called_at, p.name
       FROM visits v LEFT JOIN patients p ON p.id = v.patient_id
      WHERE v.branch_id = ? AND v.date = ? AND v.status != 'cancelled'
      ORDER BY v.queue_seq`,
    branchId,
    date
  );
  const polis = {};
  for (const r of rows) {
    const k = r.poli_id || 'umum';
    const pl = (polis[k] ||= { poli_id: k, name: byId(bundle.polis, k)?.name || k, color: byId(bundle.polis, k)?.color || '#0F766E', current: null, waiting: 0, done: 0, next: [] });
    if (r.queue_status === 'waiting') {
      pl.waiting++;
      if (pl.next.length < 4) pl.next.push(r.queue_no);
    } else if (r.queue_status === 'called' || r.queue_status === 'serving') {
      if (!pl.current || (r.called_at || '') > (pl.current.called_at || '')) {
        pl.current = { queue_no: r.queue_no, status: r.queue_status, called_at: r.called_at, doctor: byId(bundle.doctors, r.doctor_id)?.name || '', name: maskName(r.name) };
      }
    } else if (r.queue_status === 'done') pl.done++;
  }
  const called = rows
    .filter((r) => r.called_at)
    .sort((a, b) => (b.called_at || '').localeCompare(a.called_at || ''))
    .slice(0, 6)
    .map((r) => ({ queue_no: r.queue_no, poli: tr(byId(bundle.polis, r.poli_id)?.name) || '', doctor: byId(bundle.doctors, r.doctor_id)?.name || '', called_at: r.called_at, status: r.queue_status, id: r.id }));
  const snap = { branch_id: branchId, date, updated: nowISO(), polis: Object.values(polis), called, total: rows.length };
  await env.KV.put(`queue:${branchId}:${date}`, JSON.stringify(snap), { expirationTtl: 86400 * 2 });
  return snap;
}

export async function getQueue(env, branchId, date = localDate()) {
  return (await env.KV.get(`queue:${branchId}:${date}`, { type: 'json' })) || { branch_id: branchId, date, polis: [], called: [], total: 0 };
}

function maskName(n) {
  if (!n) return '';
  return String(n)
    .split(' ')
    .map((w, i) => (i === 0 ? w : w[0] + '.'))
    .join(' ');
}

// ---------------------------------------------------------------- daily stats counters (cheap dashboards)
export function statStmts(env, branchId, metrics, date = localDate()) {
  return Object.entries(metrics)
    .filter(([, v]) => v)
    .map(([k, v]) =>
      env.DB.prepare('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value').bind(`stat:${date}:${branchId || 'all'}:${k}`, Math.round(v))
    );
}
export function bumpStats(ctx, branchId, metrics, date) {
  const stmts = statStmts(ctx.env, branchId, metrics, date);
  if (stmts.length) ctx.waitUntil(ctx.env.DB.batch(stmts).catch(() => {}));
}
export async function readStats(env, from, to, branchId) {
  const rows = await q(env, 'SELECT key, value FROM counters WHERE key >= ? AND key < ?', `stat:${from}`, `stat:${addDays(to, 1)}`);
  const out = {};
  for (const r of rows) {
    const [, date, br, metric] = r.key.split(':');
    if (branchId && br !== branchId) continue;
    const d = (out[date] ||= {});
    d[metric] = (d[metric] || 0) + r.value;
  }
  return out;
}

// ---------------------------------------------------------------- billing math
export function lineTotal(it) {
  return Math.max(0, (Number(it.qty) || 0) * (Number(it.price) || 0) - (Number(it.discount) || 0));
}
export function computeTotals(items, discount = 0, taxPct = 0) {
  const subtotal = (items || []).reduce((a, it) => a + lineTotal(it), 0);
  const disc = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const tax = Math.round(((subtotal - disc) * (Number(taxPct) || 0)) / 100);
  return { subtotal, discount: disc, tax, total: subtotal - disc + tax };
}
export function invoiceStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (paid + 0.5 >= total) return 'paid';
  return 'partial';
}

export async function couponDiscount(env, codeStr, subtotal) {
  if (!codeStr) return { discount: 0 };
  const c = await q1(env, 'SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', String(codeStr).trim());
  const today = localDate();
  if (!c || !c.active) return { discount: 0, error: 'Kupon tidak ditemukan / tidak aktif' };
  if ((c.start_date && today < c.start_date) || (c.end_date && today > c.end_date)) return { discount: 0, error: 'Kupon sudah tidak berlaku' };
  if (c.max_uses > 0 && c.used >= c.max_uses) return { discount: 0, error: 'Kuota kupon habis' };
  if (subtotal < (c.min_amount || 0)) return { discount: 0, error: 'Belum memenuhi minimal transaksi kupon' };
  const discount = c.type === 'percent' ? Math.round((subtotal * Number(c.value)) / 100) : Number(c.value);
  return { discount: Math.min(subtotal, discount), coupon: c };
}

export function procedurePrice(bundle, procId, branchId) {
  return priceFor(byId(bundle.procedures, procId), branchId);
}

export function consultFee(bundle, doctorId, serviceId, branchId) {
  const doc = byId(bundle.doctors, doctorId);
  if (doc?.consult_fee) return Number(doc.consult_fee);
  const svc = byId(bundle.services, serviceId);
  return svc ? priceFor(svc, branchId) : 0;
}

export function tierFor(bundle, points) {
  const tiers = [...(bundle.membership_tiers || [])].sort((a, b) => (b.min_points || 0) - (a.min_points || 0));
  return tiers.find((t) => (Number(points) || 0) >= (t.min_points || 0)) || null;
}

export function meetUrl(bookingNo) {
  return `https://meet.jit.si/GlobalKlinik-${bookingNo}-${crypto.randomUUID().slice(0, 8)}`;
}
