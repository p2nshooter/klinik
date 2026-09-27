// Patient portal: profile, appointments, visit history (EMR summary), invoices & payments, documents, notifications.
import { byId, getBundle } from '../lib/cms.js';
import { getQueue } from '../lib/clinic.js';
import { audit, d1Entity, decode, q, q1, run } from '../lib/db.js';
import { storePrivate } from './system.js';
import { badRequest, forbidden, json, localDate, notFound, nowISO, parseJSON, readJSON, unauthorized } from '../lib/util.js';
import { publicAppt } from './public.js';
import { cancelAppointment, checkinAppointment, createAppointment, recordPayment, rescheduleAppointment } from './shared.js';

function me(ctx) {
  if (!ctx.session) throw unauthorized();
  if (ctx.session.role !== 'patient' || !ctx.session.patient_id) throw forbidden('Portal khusus pasien');
  return ctx.session.patient_id;
}

export async function overview(ctx) {
  const pid = me(ctx);
  const env = ctx.env;
  const bundle = await getBundle(env);
  const today = localDate();
  const [patient, upcoming, visits, unpaid, notifs] = await Promise.all([
    q1(env, 'SELECT * FROM patients WHERE id = ?', pid),
    q(env, "SELECT * FROM appointments WHERE patient_id = ? AND date >= ? AND status NOT IN ('cancelled','completed','no_show') ORDER BY date, time LIMIT 5", pid, today),
    q(env, 'SELECT v.*, (SELECT diagnoses FROM medical_records r WHERE r.visit_id = v.id) AS diagnoses FROM visits v WHERE v.patient_id = ? ORDER BY v.id DESC LIMIT 5', pid),
    q(env, "SELECT id, invoice_no, date, total, paid, status FROM invoices WHERE patient_id = ? AND status IN ('unpaid','partial') ORDER BY id DESC LIMIT 10", pid),
    env.KV.get(`notif:p:${pid}`, { type: 'json' }),
  ]);
  if (!patient) throw notFound('Data pasien tidak ditemukan');
  const todayVisit = visits.find((v) => v.date === today && !['done', 'cancelled'].includes(v.status));
  const queue = todayVisit ? await getQueue(env, todayVisit.branch_id, today) : null;
  const tier = byId(bundle.membership_tiers, patient.member_tier);
  return json({
    patient: decode(d1Entity('patients'), patient),
    tier: tier || null,
    upcoming: upcoming.map((a) => ({ ...publicAppt(bundle, a), id: a.id })),
    visits: visits.map((v) => ({ ...v, diagnoses: parseJSON(v.diagnoses, []), poli: byId(bundle.polis, v.poli_id)?.name, doctor: byId(bundle.doctors, v.doctor_id)?.name })),
    unpaid,
    today: todayVisit ? { queue_no: todayVisit.queue_no, queue_status: todayVisit.queue_status, poli_id: todayVisit.poli_id, snapshot: queue } : null,
    unread: (notifs || []).filter((n) => !n.read).length,
  });
}

const EDITABLE = ['phone', 'email', 'address', 'city', 'occupation', 'marital_status', 'religion', 'blood_type', 'guardian_name', 'guardian_relation', 'guardian_phone', 'allergies', 'nik', 'bpjs_no', 'insurance_no', 'birth_place', 'birth_date', 'gender'];

export async function updateProfile(ctx) {
  const pid = me(ctx);
  const b = await readJSON(ctx.req, 10000);
  const sets = [];
  const vals = [];
  for (const k of EDITABLE) {
    if (b[k] === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(String(b[k] ?? '').slice(0, 500) || null);
  }
  if (!sets.length) throw badRequest('Tidak ada perubahan');
  await run(ctx.env, `UPDATE patients SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...vals, nowISO(), pid);
  if (b.email || b.phone) await run(ctx.env, 'UPDATE users SET email = COALESCE(?, email), phone = COALESCE(?, phone), updated_at = ? WHERE id = ?', b.email || null, b.phone || null, nowISO(), ctx.session.uid);
  audit(ctx, 'update', 'patients', pid, 'portal: ' + sets.map((s) => s.split(' ')[0]).join(','));
  return json({ ok: true });
}

export async function appointments(ctx) {
  const pid = me(ctx);
  const bundle = await getBundle(ctx.env);
  const rows = await q(ctx.env, 'SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, time DESC LIMIT 100', pid);
  return json({ rows: rows.map((a) => ({ ...publicAppt(bundle, a), id: a.id })) });
}

export async function book(ctx) {
  const pid = me(ctx);
  const p = await q1(ctx.env, 'SELECT name, phone, email, birth_date, gender FROM patients WHERE id = ?', pid);
  const b = await readJSON(ctx.req);
  const row = await createAppointment(ctx, { ...b, name: b.name || p.name, phone: b.phone || p.phone, email: b.email || p.email, birth_date: p.birth_date, gender: p.gender }, { source: 'portal', patientId: pid });
  return json({ ok: true, appointment: publicAppt(await getBundle(ctx.env), row) }, 201);
}

async function ownAppt(ctx) {
  const pid = me(ctx);
  const a = await q1(ctx.env, 'SELECT * FROM appointments WHERE id = ? AND patient_id = ?', Number(ctx.params.id), pid);
  if (!a) throw notFound('Booking tidak ditemukan');
  return a;
}

export async function apptAction(ctx) {
  const a = await ownAppt(ctx);
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  switch (ctx.params.action) {
    case 'cancel':
      await cancelAppointment(ctx, a, b.reason || 'Dibatalkan pasien');
      return json({ ok: true });
    case 'reschedule':
      return json({ ok: true, appointment: publicAppt(bundle, await rescheduleAppointment(ctx, a, b.date, b.time)) });
    case 'checkin': {
      const v = await checkinAppointment(ctx, a);
      return json({ ok: true, queue_no: v.queue_no });
    }
    default:
      throw badRequest('Aksi tidak dikenal');
  }
}

export async function visits(ctx) {
  const pid = me(ctx);
  const env = ctx.env;
  const bundle = await getBundle(env);
  const [vs, recs, rxs, labs, docs] = await Promise.all([
    q(env, 'SELECT * FROM visits WHERE patient_id = ? ORDER BY id DESC LIMIT 60', pid),
    q(env, "SELECT visit_id, diagnoses, therapy, plan, vitals, status, notes FROM medical_records WHERE patient_id = ? ORDER BY id DESC LIMIT 60", pid),
    q(env, "SELECT id, rx_no, visit_id, date, items, status FROM prescriptions WHERE patient_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 60", pid),
    q(env, "SELECT id, lab_no, visit_id, date, tests, status, result_at FROM lab_orders WHERE patient_id = ? ORDER BY id DESC LIMIT 60", pid),
    q(env, 'SELECT id, title, category, visit_id, file, created_at FROM documents WHERE patient_id = ? AND shared_with_patient = 1 ORDER BY id DESC LIMIT 60', pid),
  ]);
  const ready = (l) => ['completed', 'validated'].includes(l.status);
  const rows = vs.map((v) => {
    const r = recs.find((x) => x.visit_id === v.id);
    return {
      id: v.id, visit_no: v.visit_no, date: v.date, status: v.status, queue_no: v.queue_no,
      poli: byId(bundle.polis, v.poli_id)?.name, doctor: byId(bundle.doctors, v.doctor_id)?.name, branch: byId(bundle.branches, v.branch_id)?.name,
      record: r && r.status === 'final' ? { diagnoses: parseJSON(r.diagnoses, []), therapy: r.therapy, plan: r.plan, vitals: parseJSON(r.vitals, null), notes: r.notes } : null,
      prescriptions: rxs.filter((x) => x.visit_id === v.id).map((x) => ({ ...x, items: parseJSON(x.items, []) })),
      labs: labs.filter((x) => x.visit_id === v.id).map((x) => ({ ...x, tests: ready(x) ? parseJSON(x.tests, []) : [], ready: ready(x) })),
      documents: docs.filter((d) => d.visit_id === v.id),
    };
  });
  return json({ rows, documents: docs.filter((d) => !d.visit_id) });
}

export async function invoices(ctx) {
  const pid = me(ctx);
  const [inv, pays] = await Promise.all([
    q(ctx.env, 'SELECT * FROM invoices WHERE patient_id = ? ORDER BY id DESC LIMIT 100', pid),
    q(ctx.env, 'SELECT * FROM payments WHERE patient_id = ? ORDER BY id DESC LIMIT 200', pid),
  ]);
  const bundle = await getBundle(ctx.env);
  return json({
    rows: inv.map((i) => ({ ...decode(d1Entity('invoices'), i), payments: pays.filter((p) => p.invoice_id === i.id) })),
    banks: bundle.settings?.bank_accounts || [],
    qris: bundle.settings?.qris_image || '',
    gateway: !!ctx.env.MIDTRANS_SERVER_KEY,
  });
}

/** Patient uploads a bank-transfer proof → payment "pending" for cashier confirmation. File stored privately in R2. */
export async function uploadProof(ctx) {
  const pid = me(ctx);
  const inv = await q1(ctx.env, 'SELECT * FROM invoices WHERE id = ? AND patient_id = ?', Number(ctx.params.id), pid);
  if (!inv) throw notFound('Invoice tidak ditemukan');
  const form = await ctx.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw badRequest('Lampirkan bukti transfer');
  const key = await storePrivate(ctx, file, 'proofs');
  const amount = Number(form.get('amount')) || Math.max(0, inv.total - inv.paid);
  const pay = await recordPayment(ctx, inv, { method: form.get('method') === 'qris' ? 'qris' : 'transfer', amount, status: 'pending', proof: key, reference: String(form.get('reference') || '').slice(0, 100), notes: 'Upload bukti dari portal pasien' });
  return json({ ok: true, payment: pay }, 201);
}

export async function notifications(ctx) {
  const pid = me(ctx);
  const list = (await ctx.env.KV.get(`notif:p:${pid}`, { type: 'json' })) || [];
  return json({ rows: list });
}

export async function readNotifications(ctx) {
  const pid = me(ctx);
  const key = `notif:p:${pid}`;
  const list = (await ctx.env.KV.get(key, { type: 'json' })) || [];
  if (list.some((n) => !n.read)) await ctx.env.KV.put(key, JSON.stringify(list.map((n) => ({ ...n, read: true }))));
  return json({ ok: true });
}

export async function points(ctx) {
  const pid = me(ctx);
  const rows = await q(ctx.env, 'SELECT * FROM loyalty_ledger WHERE patient_id = ? ORDER BY id DESC LIMIT 100', pid);
  return json({ rows });
}
