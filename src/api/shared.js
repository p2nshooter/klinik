// Core clinic workflows shared by public site, patient portal and staff app.
import { byId, getBundle, priceFor } from '../lib/cms.js';
import { availableSlots, branchCode, bumpStats, computeTotals, consultFee, couponDiscount, invoiceStatus, meetUrl, procedurePrice, refreshQueue, tierFor } from '../lib/clinic.js';
import { audit, d1Entity, d1Insert, makeNumber, q, q1, queueSeq, run, updateStmt } from '../lib/db.js';
import { apptData, notify } from '../lib/notify.js';
import { addDays, badRequest, code, conflict, isDate, isTime, localDate, normPhone, notFound, nowISO, parseJSON, tr } from '../lib/util.js';

export function phoneVariants(p) {
  const n = normPhone(p);
  if (!n) return [];
  const local = n.startsWith('62') ? '0' + n.slice(2) : n;
  return [...new Set([n, '+' + n, local, String(p || '').trim()])];
}
export function samePhone(a, b) {
  const x = normPhone(a), y = normPhone(b);
  return x && y && x.slice(-9) === y.slice(-9);
}

// ---------------------------------------------------------------- patients
const PATIENT_FIELDS = d1Entity('patients').fields.filter((f) => !f.readonly).map((f) => f.key);

export async function createPatient(ctx, data) {
  const env = ctx.env;
  if (!data.name || String(data.name).trim().length < 2) throw badRequest('Nama pasien wajib diisi');
  const rec = {};
  for (const k of PATIENT_FIELDS) if (data[k] !== undefined) rec[k] = data[k];
  rec.mrn = await makeNumber(env, 'mrn');
  rec.referral_code = code(6);
  rec.points = 0;
  rec.payer_type ||= 'umum';
  const id = await d1Insert(env, d1Entity('patients'), rec, ctx.session?.uid ?? null);
  bumpStats(ctx, rec.branch_id, { new_patients: 1 });
  if (data.referred_by) {
    const ref = await q1(env, 'SELECT id FROM patients WHERE referral_code = ?', String(data.referred_by).trim().toUpperCase());
    if (ref) ctx.waitUntil(addPoints(env, ref.id, 10, `Referral pasien baru ${rec.mrn}`, rec.mrn));
  }
  audit(ctx, 'create', 'patients', id, { mrn: rec.mrn, name: rec.name });
  return { id, ...rec };
}

export async function findPatient(env, { phone, name, birth_date }) {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const rows = await q(env, `SELECT * FROM patients WHERE phone IN (${variants.map(() => '?').join(',')}) ORDER BY id LIMIT 20`, ...variants);
  const nm = String(name || '').trim().toLowerCase();
  return rows.find((r) => r.name?.trim().toLowerCase() === nm && (!birth_date || !r.birth_date || r.birth_date === birth_date)) || null;
}

export async function addPoints(env, patientId, points, reason, ref) {
  if (!points) return;
  const bundle = await getBundle(env);
  const now = nowISO();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO loyalty_ledger (patient_id, points, reason, ref, created_at, updated_at) VALUES (?,?,?,?,?,?)').bind(patientId, points, reason, ref || '', now, now),
    env.DB.prepare('UPDATE patients SET points = COALESCE(points,0) + ?, updated_at = ? WHERE id = ?').bind(points, now, patientId),
  ]);
  const p = await q1(env, 'SELECT points, member_tier FROM patients WHERE id = ?', patientId);
  const tier = tierFor(bundle, p?.points);
  if (tier && tier.id !== p.member_tier) await run(env, 'UPDATE patients SET member_tier = ? WHERE id = ?', tier.id, patientId);
}

// ---------------------------------------------------------------- appointments
export async function createAppointment(ctx, input, { source = 'web', patientId = null } = {}) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  const s = bundle.settings || {};
  const a = {
    branch_id: String(input.branch_id || ''),
    poli_id: String(input.poli_id || ''),
    service_id: String(input.service_id || ''),
    doctor_id: String(input.doctor_id || ''),
    date: String(input.date || ''),
    time: String(input.time || ''),
    type: input.type === 'telemedicine' ? 'telemedicine' : 'offline',
    name: String(input.name || '').trim().slice(0, 120),
    phone: String(input.phone || '').trim().slice(0, 30),
    email: String(input.email || '').trim().slice(0, 120),
    birth_date: isDate(input.birth_date) ? input.birth_date : null,
    gender: ['L', 'P'].includes(input.gender) ? input.gender : null,
    complaint: String(input.complaint || '').slice(0, 1000),
    coupon: String(input.coupon || '').trim().toUpperCase().slice(0, 30),
    referral: String(input.referral || '').trim().toUpperCase().slice(0, 20),
    source,
    patient_id: patientId,
  };
  const doctor = byId(bundle.doctors, a.doctor_id);
  const branch = byId(bundle.branches, a.branch_id);
  if (!branch) throw badRequest('Pilih cabang');
  if (!doctor) throw badRequest('Pilih dokter');
  if (!a.poli_id) a.poli_id = doctor.poli_id || '';
  if (!isDate(a.date) || !isTime(a.time)) throw badRequest('Pilih tanggal dan jam');
  if (a.name.length < 2) throw badRequest('Nama pasien wajib diisi');
  if (normPhone(a.phone).length < 9) throw badRequest('Nomor HP tidak valid');
  const today = localDate();
  if (a.date < today || a.date > addDays(today, Number(s.booking_days_ahead) || 30)) throw badRequest('Tanggal di luar rentang booking');
  if (a.type === 'telemedicine' && doctor.telemedicine === false) throw badRequest('Dokter ini belum melayani telemedicine');

  const { slots, reason } = await availableSlots(env, bundle, { doctorId: a.doctor_id, branchId: a.branch_id, date: a.date, type: a.type });
  const slot = slots.find((x) => x.time === a.time);
  if (!slot) throw badRequest(reason === 'holiday' ? 'Klinik/dokter libur pada tanggal tersebut' : 'Jam tidak tersedia pada jadwal dokter');

  a.booking_no = await makeNumber(env, 'booking');
  if (a.type === 'telemedicine') a.meet_url = meetUrl(a.booking_no);
  const wantWait = !!input.waitlist;
  a.status = s.booking_auto_confirm === false ? 'pending' : 'confirmed';

  // Atomic capacity check: insert only if the slot still has room (no race between two bookings)
  const cols = ['booking_no', 'patient_id', 'name', 'phone', 'email', 'birth_date', 'gender', 'branch_id', 'poli_id', 'service_id', 'doctor_id', 'date', 'time', 'type', 'status', 'complaint', 'coupon', 'referral', 'meet_url', 'source', 'reminded', 'created_at', 'updated_at', 'created_by'];
  const now = nowISO();
  const vals = cols.map((c) => (c === 'created_at' || c === 'updated_at' ? now : c === 'created_by' ? ctx.session?.uid ?? null : c === 'reminded' ? 0 : a[c] ?? null));
  let res = await env.DB.prepare(
    `INSERT INTO appointments (${cols.join(',')}) SELECT ${cols.map(() => '?').join(',')}
      WHERE (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status NOT IN ('cancelled','waitlist','no_show')) < ?`
  )
    .bind(...vals, a.doctor_id, a.date, a.time, slot.quota)
    .run();
  if (!res.meta.changes) {
    if (!wantWait) throw conflict('Slot baru saja terisi. Pilih jam lain atau masuk daftar tunggu.');
    a.status = 'waitlist';
    vals[cols.indexOf('status')] = 'waitlist';
    res = await env.DB.prepare(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...vals).run();
  }
  const row = await q1(env, 'SELECT * FROM appointments WHERE booking_no = ?', a.booking_no);
  bumpStats(ctx, a.branch_id, { bookings: 1 });
  audit(ctx, 'create', 'appointments', row.id, { booking_no: a.booking_no, source });
  const tpl = a.status === 'waitlist' ? 'booking_waitlist' : a.status === 'pending' ? 'booking_pending' : 'booking_confirmed';
  ctx.waitUntil(notify(env, { template: tpl, data: apptData(bundle, row, ctx.site), phone: a.phone, email: a.email, patientId, ref: a.booking_no }).catch(() => {}));
  return row;
}

export async function rescheduleAppointment(ctx, appt, date, time) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  if (['cancelled', 'completed', 'checked_in', 'in_progress'].includes(appt.status)) throw badRequest('Booking ini tidak dapat dijadwalkan ulang');
  const { slots } = await availableSlots(env, bundle, { doctorId: appt.doctor_id, branchId: appt.branch_id, date, type: appt.type });
  const slot = slots.find((x) => x.time === time);
  if (!slot || !slot.available) throw conflict('Jam yang dipilih tidak tersedia');
  await run(env, "UPDATE appointments SET date = ?, time = ?, status = CASE WHEN status = 'waitlist' THEN 'confirmed' ELSE status END, reminded = 0, updated_at = ? WHERE id = ?", date, time, nowISO(), appt.id);
  const row = await q1(env, 'SELECT * FROM appointments WHERE id = ?', appt.id);
  audit(ctx, 'reschedule', 'appointments', appt.id, { from: `${appt.date} ${appt.time}`, to: `${date} ${time}` });
  ctx.waitUntil(notify(env, { template: 'booking_rescheduled', data: apptData(bundle, row, ctx.site), phone: row.phone, email: row.email, patientId: row.patient_id, ref: row.booking_no }).catch(() => {}));
  ctx.waitUntil(promoteWaitlist(ctx, appt).catch(() => {}));
  return row;
}

export async function cancelAppointment(ctx, appt, reason = '') {
  const env = ctx.env;
  if (['cancelled', 'completed', 'checked_in', 'in_progress'].includes(appt.status)) throw badRequest('Booking ini tidak dapat dibatalkan');
  await run(env, "UPDATE appointments SET status = 'cancelled', notes = TRIM(COALESCE(notes,'') || ' ' || ?), updated_at = ? WHERE id = ?", reason ? `[Batal: ${reason}]` : '[Batal]', nowISO(), appt.id);
  const bundle = await getBundle(env);
  audit(ctx, 'cancel', 'appointments', appt.id, reason);
  ctx.waitUntil(notify(env, { template: 'booking_cancelled', data: apptData(bundle, appt, ctx.site), phone: appt.phone, email: appt.email, patientId: appt.patient_id, ref: appt.booking_no }).catch(() => {}));
  ctx.waitUntil(promoteWaitlist(ctx, appt).catch(() => {}));
}

/** When a slot frees up, the oldest waitlist entry for that doctor/date/time is confirmed automatically. */
export async function promoteWaitlist(ctx, appt) {
  const env = ctx.env;
  const w = await q1(env, "SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status = 'waitlist' ORDER BY id LIMIT 1", appt.doctor_id, appt.date, appt.time);
  if (!w) return;
  const bundle = await getBundle(env);
  const { slots } = await availableSlots(env, bundle, { doctorId: w.doctor_id, branchId: w.branch_id, date: w.date });
  if (!slots.find((s) => s.time === w.time && s.left > 0)) return;
  await run(env, "UPDATE appointments SET status = 'confirmed', updated_at = ? WHERE id = ?", nowISO(), w.id);
  await notify(env, { template: 'waitlist_promoted', data: apptData(bundle, w, ctx.site), phone: w.phone, email: w.email, patientId: w.patient_id, ref: w.booking_no });
}

// ---------------------------------------------------------------- visits & queue
export async function createVisit(ctx, input) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  const date = input.date || localDate();
  const branch = byId(bundle.branches, input.branch_id);
  const poli = byId(bundle.polis, input.poli_id);
  if (!branch) throw badRequest('Cabang tidak valid');
  if (!poli) throw badRequest('Poli tidak valid');
  const patient = await q1(env, 'SELECT id, name, payer_type, insurer_id FROM patients WHERE id = ?', Number(input.patient_id));
  if (!patient) throw notFound('Pasien tidak ditemukan');
  const dup = await q1(env, "SELECT id, queue_no FROM visits WHERE patient_id = ? AND date = ? AND poli_id = ? AND status NOT IN ('done','cancelled') LIMIT 1", patient.id, date, poli.id);
  if (dup) throw conflict(`Pasien sudah terdaftar hari ini di poli ini (antrian ${dup.queue_no})`);
  const seq = await queueSeq(env, branch.id, poli.id, date);
  const visit = {
    visit_no: await makeNumber(env, 'visit', branch.code, date),
    queue_no: `${(poli.code || 'A').toUpperCase()}-${String(seq).padStart(3, '0')}`,
    queue_seq: seq,
    date,
    patient_id: patient.id,
    branch_id: branch.id,
    poli_id: poli.id,
    doctor_id: input.doctor_id || null,
    queue_status: 'waiting',
    status: 'registered',
    payer_type: input.payer_type || patient.payer_type || 'umum',
    insurer_id: input.insurer_id || patient.insurer_id || null,
    complaint: input.complaint || '',
    appointment_id: input.appointment_id || null,
  };
  const id = await d1Insert(env, d1Entity('visits'), visit, ctx.session?.uid ?? null);
  if (visit.appointment_id) await run(env, "UPDATE appointments SET status = 'checked_in', visit_id = ?, patient_id = COALESCE(patient_id, ?), checkin_at = ?, updated_at = ? WHERE id = ?", id, patient.id, nowISO(), nowISO(), visit.appointment_id);
  bumpStats(ctx, branch.id, { visits: 1 });
  audit(ctx, 'create', 'visits', id, { visit_no: visit.visit_no, queue_no: visit.queue_no });
  ctx.waitUntil(refreshQueue(env, branch.id, date).catch(() => {}));
  return { id, ...visit };
}

/** Online / QR check-in: converts a confirmed appointment for today into a visit with a queue number. */
export async function checkinAppointment(ctx, appt) {
  const env = ctx.env;
  if (appt.visit_id) {
    const v = await q1(env, 'SELECT * FROM visits WHERE id = ?', appt.visit_id);
    if (v) return v;
  }
  if (appt.date !== localDate()) throw badRequest('Check-in hanya dapat dilakukan pada hari jadwal');
  if (!['confirmed', 'pending'].includes(appt.status)) throw badRequest('Status booking tidak dapat check-in');
  let patientId = appt.patient_id;
  if (!patientId) {
    const found = await findPatient(env, { phone: appt.phone, name: appt.name, birth_date: appt.birth_date });
    patientId = found?.id || (await createPatient(ctx, { name: appt.name, phone: appt.phone, email: appt.email, birth_date: appt.birth_date, gender: appt.gender, branch_id: appt.branch_id })).id;
  }
  return createVisit(ctx, { patient_id: patientId, branch_id: appt.branch_id, poli_id: appt.poli_id, doctor_id: appt.doctor_id, complaint: appt.complaint, appointment_id: appt.id });
}

// ---------------------------------------------------------------- billing
export async function buildVisitInvoice(ctx, visitId) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  const visit = await q1(env, 'SELECT * FROM visits WHERE id = ?', Number(visitId));
  if (!visit) throw notFound('Kunjungan tidak ditemukan');
  const [rec, rxs, labs, appt, patient, existing] = await Promise.all([
    q1(env, 'SELECT procedures FROM medical_records WHERE visit_id = ?', visit.id),
    q(env, "SELECT id, rx_no, items FROM prescriptions WHERE visit_id = ? AND status != 'cancelled'", visit.id),
    q(env, "SELECT id, lab_no, tests FROM lab_orders WHERE visit_id = ? AND status != 'cancelled'", visit.id),
    visit.appointment_id ? q1(env, 'SELECT service_id, coupon FROM appointments WHERE id = ?', visit.appointment_id) : null,
    q1(env, 'SELECT id, points, member_tier FROM patients WHERE id = ?', visit.patient_id),
    q1(env, "SELECT * FROM invoices WHERE visit_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1", visit.id),
  ]);
  if (existing && ['paid', 'refunded'].includes(existing.status)) return existing;
  const items = [];
  const doc = byId(bundle.doctors, visit.doctor_id);
  const fee = consultFee(bundle, visit.doctor_id, appt?.service_id, visit.branch_id);
  if (fee) items.push({ kind: 'consult', name: `Konsultasi ${doc?.name || tr(byId(bundle.polis, visit.poli_id)?.name) || 'dokter'}`, qty: 1, price: fee, discount: 0, auto: true });
  for (const p of parseJSON(rec?.procedures, [])) {
    if (!p?.name && !p?.procedure_id) continue;
    const pr = byId(bundle.procedures, p.procedure_id);
    items.push({ kind: 'procedure', name: p.name || pr?.name, qty: Number(p.qty) || 1, price: Number(p.price) || procedurePrice(bundle, p.procedure_id, visit.branch_id), discount: 0, auto: true });
  }
  for (const rx of rxs) for (const it of parseJSON(rx.items, [])) items.push({ kind: 'medicine', name: it.name, qty: Number(it.qty) || 1, price: Number(it.price) || 0, discount: 0, auto: true, ref: `rx:${rx.id}` });
  for (const lab of labs) for (const t of parseJSON(lab.tests, [])) items.push({ kind: 'lab', name: `Lab: ${t.name}`, qty: 1, price: Number(t.price) || 0, discount: 0, auto: true, ref: `lab:${lab.id}` });
  const adminFee = Number(bundle.settings?.admin_fee) || 0;
  if (adminFee) items.push({ kind: 'admin', name: 'Biaya administrasi', qty: 1, price: adminFee, discount: 0, auto: true });

  const manual = existing ? parseJSON(existing.items, []).filter((i) => !i.auto) : [];
  const all = [...items, ...manual];
  let discount = existing ? Number(existing.discount) || 0 : 0;
  let notes = existing?.notes || '';
  let coupon = existing?.coupon || appt?.coupon || '';
  if (!existing) {
    const sub = computeTotals(all).subtotal;
    const tier = byId(bundle.membership_tiers, patient?.member_tier);
    if (tier?.discount_pct) {
      discount += Math.round((sub * tier.discount_pct) / 100);
      notes = `Diskon member ${tier.name} ${tier.discount_pct}%`;
    }
    if (coupon) {
      const c = await couponDiscount(env, coupon, sub);
      if (c.discount) {
        discount += c.discount;
        notes = [notes, `Kupon ${coupon}`].filter(Boolean).join(' · ');
      } else coupon = '';
    }
  }
  const t = computeTotals(all, discount, bundle.settings?.tax_percent);
  const paid = existing ? Number(existing.paid) || 0 : 0;
  const data = { items: all, ...t, paid, status: t.total <= 0 ? 'paid' : invoiceStatus(t.total, paid), coupon, notes };
  const e = d1Entity('invoices');
  if (existing) {
    await updateStmt(env, e, existing.id, data).run();
    return { ...existing, ...data, id: existing.id };
  }
  const inv = { ...data, invoice_no: await makeNumber(env, 'invoice', branchCode(bundle, visit.branch_id)), date: localDate(), patient_id: visit.patient_id, visit_id: visit.id, branch_id: visit.branch_id, type: 'visit', payer_type: visit.payer_type, insurer_id: visit.insurer_id };
  const id = await d1Insert(env, e, inv, ctx.session?.uid ?? null);
  const p = await q1(env, 'SELECT phone, email FROM patients WHERE id = ?', visit.patient_id);
  ctx.waitUntil(notify(env, { template: 'invoice_created', data: { invoice_no: inv.invoice_no, total: inv.total, link: `${ctx.site}/app/#/portal/invoices` }, patientId: visit.patient_id, channels: ['inapp'], ref: inv.invoice_no }).catch(() => {}));
  return { id, ...inv, phone: p?.phone };
}

export async function recordPayment(ctx, inv, { method, amount, reference = '', status = 'confirmed', proof = null, gateway_ref = null, notes = '' }) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  amount = Math.round(Number(amount) || 0);
  if (amount <= 0) throw badRequest('Jumlah pembayaran harus lebih dari 0');
  if (['void', 'refunded'].includes(inv.status)) throw badRequest('Invoice tidak dapat dibayar');
  const remaining = Math.max(0, Number(inv.total) - Number(inv.paid));
  if (status === 'confirmed' && remaining <= 0) throw badRequest('Invoice sudah lunas');
  const applied = status === 'confirmed' ? Math.min(amount, remaining) : amount;
  const pay = {
    payment_no: await makeNumber(env, 'payment', branchCode(bundle, inv.branch_id)),
    date: localDate(), invoice_id: inv.id, patient_id: inv.patient_id, branch_id: inv.branch_id,
    method, amount: applied, status, reference, proof, gateway_ref, notes,
    confirmed_by: status === 'confirmed' ? ctx.session?.name || 'system' : null,
  };
  const id = await d1Insert(env, d1Entity('payments'), pay, ctx.session?.uid ?? null);
  audit(ctx, 'payment', 'invoices', inv.id, { payment_no: pay.payment_no, amount: applied, method, status });
  if (status === 'confirmed') await settleInvoice(ctx, inv.id, { id, ...pay });
  return { id, ...pay, change: Math.max(0, amount - applied) };
}

export async function settleInvoice(ctx, invoiceId, payment) {
  const env = ctx.env;
  const bundle = await getBundle(env);
  const inv = await q1(env, 'SELECT * FROM invoices WHERE id = ?', invoiceId);
  const [{ s: paidSum }, { s: refundSum }] = await Promise.all([
    q1(env, "SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id = ? AND status IN ('confirmed','refunded')", invoiceId),
    q1(env, "SELECT COALESCE(SUM(amount),0) AS s FROM refunds WHERE invoice_id = ? AND status = 'processed'", invoiceId),
  ]);
  const paid = Math.max(0, paidSum - refundSum);
  let status = invoiceStatus(inv.total, paid);
  if (refundSum > 0 && paid <= 0) status = 'refunded';
  await run(env, 'UPDATE invoices SET paid = ?, status = ?, updated_at = ? WHERE id = ?', paid, status, nowISO(), invoiceId);
  if (payment?.status === 'confirmed') {
    bumpStats(ctx, inv.branch_id, { revenue: payment.amount, payments: 1 });
    if (inv.patient_id) {
      const p = await q1(env, 'SELECT phone, email FROM patients WHERE id = ?', inv.patient_id);
      ctx.waitUntil(notify(env, { template: 'payment_received', data: { amount: payment.amount, invoice_no: inv.invoice_no, payment_no: payment.payment_no }, phone: p?.phone, email: p?.email, patientId: inv.patient_id, channels: ['inapp', 'email'], ref: payment.payment_no }).catch(() => {}));
    }
  }
  if (status === 'paid' && inv.status !== 'paid') {
    if (inv.visit_id) await run(env, "UPDATE visits SET status = CASE WHEN status IN ('billing','pharmacy','lab','examining','registered','triage') THEN 'done' ELSE status END, updated_at = ? WHERE id = ?", nowISO(), inv.visit_id);
    if (inv.coupon) await run(env, 'UPDATE coupons SET used = COALESCE(used,0) + 1 WHERE code = ?', inv.coupon);
    const per = Number(bundle.settings?.points_per_10k) || 0;
    const pts = Math.floor(inv.total / 10000) * per;
    if (inv.patient_id && pts > 0) ctx.waitUntil(addPoints(env, inv.patient_id, pts, `Transaksi ${inv.invoice_no}`, inv.invoice_no).catch(() => {}));
  }
  return { paid, status };
}

export { priceFor };
