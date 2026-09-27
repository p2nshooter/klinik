// Public (no login) endpoints: booking data, slots, bookings, check-in, queue display, forms.
import { rateCheck, rateHit } from '../lib/auth.js';
import { active, byId, getBundle } from '../lib/cms.js';
import { availableSlots, getQueue, scheduleDays } from '../lib/clinic.js';
import { audit, d1Entity, d1Insert, q1 } from '../lib/db.js';
import { badRequest, isDate, json, localDate, notFound, readJSON, tr } from '../lib/util.js';
import { cancelAppointment, checkinAppointment, createAppointment, rescheduleAppointment, samePhone } from './shared.js';

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** Compact data for the booking wizard (0 D1 reads). */
export async function bookingData(ctx) {
  const b = await getBundle(ctx.env);
  return json({
    branches: active(b.branches).map((x) => pick(x, ['id', 'name', 'city', 'address', 'phone'])),
    polis: active(b.polis).map((x) => pick(x, ['id', 'name', 'code', 'icon', 'color', 'branches'])),
    services: active(b.services).map((x) => pick(x, ['id', 'name', 'poli_id', 'price', 'branch_prices', 'branches', 'telemedicine', 'icon'])),
    doctors: active(b.doctors).map((x) => pick(x, ['id', 'name', 'specialty', 'poli_id', 'branches', 'photo', 'consult_fee', 'telemedicine', 'slug'])),
    days_ahead: Number(b.settings?.booking_days_ahead) || 30,
  }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function slots(ctx) {
  const u = ctx.url.searchParams;
  const doctorId = u.get('doctor_id'), branchId = u.get('branch_id'), date = u.get('date');
  const bundle = await getBundle(ctx.env);
  if (!doctorId || !branchId) throw badRequest('doctor_id & branch_id wajib');
  if (!date) return json({ days: scheduleDays(bundle, doctorId, branchId, Number(bundle.settings?.booking_days_ahead) || 30) });
  if (!isDate(date)) throw badRequest('Tanggal tidak valid');
  return json(await availableSlots(ctx.env, bundle, { doctorId, branchId, date, type: u.get('type') || undefined }));
}

export async function book(ctx) {
  await rateCheck(ctx.env, `book:${ctx.ip}`, 12, 3600);
  const body = await readJSON(ctx.req);
  if (body.website) throw badRequest('Spam terdeteksi'); // honeypot
  const patientId = ctx.session?.role === 'patient' ? ctx.session.patient_id : null;
  const row = await createAppointment(ctx, body, { source: patientId ? 'portal' : 'web', patientId });
  ctx.waitUntil(rateHit(ctx.env, `book:${ctx.ip}`, 3600));
  return json({ ok: true, appointment: publicAppt(await getBundle(ctx.env), row) }, 201);
}

export function publicAppt(bundle, a) {
  const doc = byId(bundle.doctors, a.doctor_id);
  const br = byId(bundle.branches, a.branch_id);
  return {
    booking_no: a.booking_no, name: a.name, date: a.date, time: a.time, status: a.status, type: a.type,
    doctor: doc?.name || '', doctor_id: a.doctor_id, branch: br?.name || '', branch_id: a.branch_id, address: br?.address || '',
    poli: tr(byId(bundle.polis, a.poli_id)?.name), service: tr(byId(bundle.services, a.service_id)?.name),
    meet_url: a.type === 'telemedicine' && ['confirmed', 'checked_in', 'in_progress'].includes(a.status) ? a.meet_url : null,
    complaint: a.complaint, created_at: a.created_at, visit_id: a.visit_id,
  };
}

async function findBooking(ctx, body) {
  const no = String(body.booking_no || '').trim().toUpperCase();
  if (!no) throw badRequest('Masukkan nomor booking');
  await rateCheck(ctx.env, `lookup:${ctx.ip}`, 20, 900);
  const a = await q1(ctx.env, 'SELECT * FROM appointments WHERE booking_no = ?', no);
  if (!a || !samePhone(a.phone, body.phone)) {
    ctx.waitUntil(rateHit(ctx.env, `lookup:${ctx.ip}`, 900));
    throw notFound('Booking tidak ditemukan. Periksa nomor booking dan nomor HP.');
  }
  return a;
}

export async function lookup(ctx) {
  const a = await findBooking(ctx, await readJSON(ctx.req));
  let queue = null;
  if (a.visit_id) {
    const v = await q1(ctx.env, 'SELECT queue_no, queue_status, poli_id, branch_id FROM visits WHERE id = ?', a.visit_id);
    if (v) queue = { ...v, snapshot: await getQueue(ctx.env, v.branch_id) };
  }
  return json({ appointment: publicAppt(await getBundle(ctx.env), a), queue });
}

export async function reschedule(ctx) {
  const body = await readJSON(ctx.req);
  const a = await findBooking(ctx, body);
  if (!isDate(body.date) || !body.time) throw badRequest('Pilih tanggal & jam baru');
  const row = await rescheduleAppointment(ctx, a, body.date, body.time);
  return json({ ok: true, appointment: publicAppt(await getBundle(ctx.env), row) });
}

export async function cancel(ctx) {
  const body = await readJSON(ctx.req);
  const a = await findBooking(ctx, body);
  await cancelAppointment(ctx, a, String(body.reason || '').slice(0, 200));
  return json({ ok: true });
}

export async function checkin(ctx) {
  const body = await readJSON(ctx.req);
  const a = await findBooking(ctx, body);
  const visit = await checkinAppointment(ctx, a);
  return json({ ok: true, queue_no: visit.queue_no, visit_no: visit.visit_no });
}

export async function queueDisplay(ctx) {
  const bundle = await getBundle(ctx.env);
  const branch = ctx.url.searchParams.get('branch') || active(bundle.branches)[0]?.id;
  const snap = await getQueue(ctx.env, branch, localDate());
  return json({ ...snap, branch: byId(bundle.branches, branch)?.name || '' }, 200, { 'cache-control': 'no-store' });
}

async function publicForm(ctx, key, limit = 6) {
  await rateCheck(ctx.env, `${key}:${ctx.ip}`, limit, 3600);
  const body = await readJSON(ctx.req, 20000);
  if (body.website) throw badRequest('Spam terdeteksi');
  ctx.waitUntil(rateHit(ctx.env, `${key}:${ctx.ip}`, 3600));
  return body;
}

export async function contact(ctx) {
  const b = await publicForm(ctx, 'contact');
  if (!b.name || (!b.phone && !b.email)) throw badRequest('Nama dan kontak wajib diisi');
  const id = await d1Insert(ctx.env, d1Entity('leads'), {
    date: localDate(), name: String(b.name).slice(0, 120), phone: String(b.phone || '').slice(0, 30), email: String(b.email || '').slice(0, 120),
    source: String(b.source || 'website').slice(0, 40), interest: String(b.interest || '').slice(0, 120), message: String(b.message || '').slice(0, 3000), status: 'new',
  });
  audit(ctx, 'create', 'leads', id, 'form kontak');
  return json({ ok: true }, 201);
}

export async function newsletter(ctx) {
  const b = await publicForm(ctx, 'news', 5);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Email tidak valid');
  await ctx.env.DB.prepare("INSERT INTO newsletter (email, name, status, created_at, updated_at) VALUES (?, ?, 'subscribed', datetime('now'), datetime('now')) ON CONFLICT(email) DO UPDATE SET status = 'subscribed', updated_at = datetime('now')").bind(email, String(b.name || '').slice(0, 80)).run();
  return json({ ok: true }, 201);
}

export async function testimonial(ctx) {
  const b = await publicForm(ctx, 'testi', 3);
  if (!b.name || !b.content) throw badRequest('Nama dan testimoni wajib diisi');
  const { cmsCreate } = await import('../lib/cms.js');
  await cmsCreate(ctx.env, 'testimonials', {
    name: String(b.name).slice(0, 80), caption: { id: String(b.caption || 'Pasien').slice(0, 80), en: String(b.caption || 'Patient').slice(0, 80) },
    rating: Math.min(5, Math.max(1, Number(b.rating) || 5)), content: { id: String(b.content).slice(0, 1000), en: String(b.content).slice(0, 1000) }, status: 'pending', date: localDate(),
  });
  return json({ ok: true, message: 'Terima kasih! Testimoni Anda akan tampil setelah dimoderasi.' }, 201);
}
