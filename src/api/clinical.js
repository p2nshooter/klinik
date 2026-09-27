// Clinical workflows: registration & queue, triage, doctor examination (SOAP/ERM), prescriptions, lab orders, history.
import { can, canAny, requirePerm, requireStaff, userBranch } from '../lib/auth.js';
import { active, byId, getBundle } from '../lib/cms.js';
import { branchCode, bumpStats, getQueue, refreshQueue } from '../lib/clinic.js';
import { audit, d1Entity, d1Insert, decode, makeNumber, q, q1, run, updateStmt } from '../lib/db.js';
import { notify } from '../lib/notify.js';
import { queueResource } from '../lib/satusehat.js';
import { badRequest, forbidden, isDate, json, localDate, notFound, nowISO, parseJSON, readJSON, tr } from '../lib/util.js';
import { labFlag } from './crud.js';
import { buildVisitInvoice, checkinAppointment, createPatient, createVisit } from './shared.js';

const E = (n) => d1Entity(n);

function branchOf(ctx, requested) {
  const b = userBranch(ctx);
  if (b && requested && requested !== b) throw forbidden('Anda hanya dapat mengakses cabang Anda');
  return b || requested;
}

async function loadVisit(ctx, id) {
  const v = await q1(ctx.env, 'SELECT * FROM visits WHERE id = ?', Number(id));
  if (!v) throw notFound('Kunjungan tidak ditemukan');
  branchOf(ctx, v.branch_id);
  return v;
}

// ---------------------------------------------------------------- registration
export async function register(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'clinic:register', 'visits:create')) throw forbidden();
  const b = await readJSON(ctx.req);
  let patientId = b.patient_id;
  let created = null;
  if (!patientId) {
    if (!canAny(ctx, 'patients:create', 'clinic:register')) throw forbidden();
    created = await createPatient(ctx, { ...(b.patient || {}), branch_id: b.branch_id });
    patientId = created.id;
  }
  const visit = await createVisit(ctx, { ...b, patient_id: patientId, branch_id: branchOf(ctx, b.branch_id) });
  return json({ visit, patient: created ? { id: created.id, mrn: created.mrn, name: created.name } : null }, 201);
}

export async function checkinByCode(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'clinic:register', 'appointments:update')) throw forbidden();
  const b = await readJSON(ctx.req);
  const raw = String(b.code || '').trim();
  const no = (raw.match(/GK\d{6}-[A-Z0-9]{4}/i) || [raw])[0].toUpperCase();
  const appt = await q1(ctx.env, 'SELECT * FROM appointments WHERE booking_no = ?', no);
  if (!appt) throw notFound('Booking tidak ditemukan');
  branchOf(ctx, appt.branch_id);
  const visit = await checkinAppointment(ctx, appt);
  return json({ visit, appointment: appt });
}

// ---------------------------------------------------------------- queue
export async function queueList(ctx) {
  requireStaff(ctx);
  const u = ctx.url.searchParams;
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, u.get('branch')) || active(bundle.branches)[0]?.id;
  const date = isDate(u.get('date')) ? u.get('date') : localDate();
  const where = ['v.branch_id = ?', 'v.date = ?'];
  const params = [branch, date];
  if (u.get('poli')) {
    where.push('v.poli_id = ?');
    params.push(u.get('poli'));
  }
  if (u.get('doctor')) {
    where.push('(v.doctor_id = ? OR v.doctor_id IS NULL)');
    params.push(u.get('doctor'));
  }
  const rows = await q(
    ctx.env,
    `SELECT v.*, p.name AS patient_name, p.mrn, p.gender, p.birth_date, p.allergies, p.phone,
            (SELECT status FROM medical_records r WHERE r.visit_id = v.id) AS record_status,
            (SELECT vitals FROM medical_records r WHERE r.visit_id = v.id) AS vitals,
            (SELECT status FROM invoices i WHERE i.visit_id = v.id ORDER BY i.id DESC LIMIT 1) AS invoice_status
       FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE ${where.join(' AND ')} ORDER BY v.queue_seq, v.id LIMIT 500`,
    ...params
  );
  const appts = await q(
    ctx.env,
    "SELECT id, booking_no, name, phone, time, doctor_id, poli_id, status, type, patient_id, meet_url FROM appointments WHERE branch_id = ? AND date = ? AND status IN ('confirmed','pending') ORDER BY time LIMIT 300",
    branch,
    date
  );
  return json({ branch, date, visits: rows.map((r) => ({ ...r, vitals: parseJSON(r.vitals, null) })), appointments: appts });
}

const QUEUE_ACTIONS = {
  call: { queue_status: 'called', called: true },
  recall: { queue_status: 'called', called: true },
  serve: { queue_status: 'serving', status: 'examining' },
  skip: { queue_status: 'skipped' },
  requeue: { queue_status: 'waiting' },
  done: { queue_status: 'done' },
  cancel: { queue_status: 'done', status: 'cancelled' },
  triage: { status: 'triage' },
};

export async function queueAction(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'queue:call', 'visits:update')) throw forbidden();
  const act = QUEUE_ACTIONS[ctx.params.action];
  if (!act) throw badRequest('Aksi tidak dikenal');
  const v = await loadVisit(ctx, ctx.params.id);
  const set = { queue_status: act.queue_status ?? v.queue_status, status: act.status ?? v.status };
  const now = nowISO();
  let doctorId = v.doctor_id;
  if (act.called && !doctorId && ctx.session.doctor_id) doctorId = ctx.session.doctor_id;
  await run(ctx.env, 'UPDATE visits SET queue_status = ?, status = ?, doctor_id = ?, called_at = CASE WHEN ? THEN ? ELSE called_at END, updated_at = ? WHERE id = ?', set.queue_status, set.status, doctorId, act.called ? 1 : 0, now, now, v.id);
  if (ctx.params.action === 'cancel' && v.appointment_id) await run(ctx.env, "UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id = ?", now, v.appointment_id);
  const snap = await refreshQueue(ctx.env, v.branch_id, v.date);
  if (act.called) {
    const bundle = await getBundle(ctx.env);
    const p = await q1(ctx.env, 'SELECT phone FROM patients WHERE id = ?', v.patient_id);
    ctx.waitUntil(notify(ctx.env, { template: 'queue_called', data: { queue_no: v.queue_no, poli: tr(byId(bundle.polis, v.poli_id)?.name) }, patientId: v.patient_id, channels: ['inapp'], ref: v.visit_no, phone: p?.phone }).catch(() => {}));
  }
  audit(ctx, `queue_${ctx.params.action}`, 'visits', v.id, v.queue_no);
  return json({ ok: true, snapshot: snap });
}

/** Call the next waiting patient for a poli (optionally a doctor). */
export async function queueNext(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'queue:call', 'visits:update')) throw forbidden();
  const b = await readJSON(ctx.req);
  const branch = branchOf(ctx, b.branch_id);
  const params = [branch, localDate(), b.poli_id];
  let extra = '';
  if (b.doctor_id) {
    extra = ' AND (doctor_id = ? OR doctor_id IS NULL)';
    params.push(b.doctor_id);
  }
  const v = await q1(ctx.env, `SELECT id FROM visits WHERE branch_id = ? AND date = ? AND poli_id = ? AND queue_status = 'waiting'${extra} ORDER BY queue_seq LIMIT 1`, ...params);
  if (!v) return json({ ok: false, message: 'Tidak ada antrian menunggu' });
  ctx.params = { id: v.id, action: 'call' };
  return queueAction(ctx);
}

export async function queueSnapshot(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, ctx.url.searchParams.get('branch')) || active(bundle.branches)[0]?.id;
  return json(await getQueue(ctx.env, branch));
}

// ---------------------------------------------------------------- visit detail & examination
export async function visitDetail(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'visits:view', 'clinic:examine', 'clinic:triage')) throw forbidden();
  const v = await loadVisit(ctx, ctx.params.id);
  const env = ctx.env;
  const [patient, record, rx, labs, invoice, docs, history] = await Promise.all([
    q1(env, 'SELECT * FROM patients WHERE id = ?', v.patient_id),
    q1(env, 'SELECT * FROM medical_records WHERE visit_id = ?', v.id),
    q(env, 'SELECT * FROM prescriptions WHERE visit_id = ? ORDER BY id', v.id),
    q(env, 'SELECT * FROM lab_orders WHERE visit_id = ? ORDER BY id', v.id),
    q1(env, 'SELECT * FROM invoices WHERE visit_id = ? ORDER BY id DESC LIMIT 1', v.id),
    q(env, 'SELECT id, title, category, file, created_at FROM documents WHERE patient_id = ? ORDER BY id DESC LIMIT 30', v.patient_id),
    q(env, 'SELECT r.id, r.visit_id, r.date, r.doctor_id, r.diagnoses, r.assessment, r.therapy, r.vitals, v.poli_id, v.visit_no FROM medical_records r JOIN visits v ON v.id = r.visit_id WHERE r.patient_id = ? AND r.visit_id != ? ORDER BY r.date DESC, r.id DESC LIMIT 15', v.patient_id, v.id),
  ]);
  audit(ctx, 'view', 'medical_records', v.id, `visit ${v.visit_no}`);
  return json({
    visit: v,
    patient: decode(E('patients'), patient),
    record: record ? decode(E('medical_records'), record) : null,
    prescriptions: rx.map((r) => decode(E('prescriptions'), r)),
    labs: labs.map((r) => decode(E('lab_orders'), r)),
    invoice: invoice ? decode(E('invoices'), invoice) : null,
    documents: docs,
    history: history.map((h) => ({ ...h, diagnoses: parseJSON(h.diagnoses, []), vitals: parseJSON(h.vitals, null) })),
  });
}

const NURSE_FIELDS = ['vitals', 'anamnesis', 'subjective', 'allergies'];
const RECORD_FIELDS = ['vitals', 'anamnesis', 'subjective', 'physical_exam', 'objective', 'assessment', 'plan', 'diagnoses', 'procedures', 'therapy', 'notes', 'attachments'];

export async function saveRecord(ctx) {
  requireStaff(ctx);
  const isDoctor = can(ctx.perms, 'clinic:examine');
  if (!isDoctor && !can(ctx.perms, 'clinic:triage')) throw forbidden();
  const v = await loadVisit(ctx, ctx.params.id);
  if (v.status === 'cancelled') throw badRequest('Kunjungan dibatalkan');
  const b = await readJSON(ctx.req);
  const allowed = isDoctor ? RECORD_FIELDS : NURSE_FIELDS;
  const data = {};
  for (const k of allowed) if (b[k] !== undefined) data[k] = b[k];
  if (data.vitals && typeof data.vitals === 'object') {
    const vt = { ...data.vitals };
    const w = Number(vt.weight), h = Number(vt.height);
    if (w && h) vt.bmi = Math.round((w / (h / 100) ** 2) * 10) / 10;
    data.vitals = vt;
  }
  if (data.diagnoses) data.diagnoses = (Array.isArray(data.diagnoses) ? data.diagnoses : []).filter((d) => d && (d.code || d.name)).slice(0, 20).map((d) => ({ code: String(d.code || '').slice(0, 12), name: String(d.name || '').slice(0, 200), primary: !!d.primary }));
  if (data.procedures) {
    const bundle = await getBundle(ctx.env);
    data.procedures = (Array.isArray(data.procedures) ? data.procedures : []).filter((p) => p && (p.procedure_id || p.name)).slice(0, 50).map((p) => {
      const m = byId(bundle.procedures, p.procedure_id);
      return { procedure_id: p.procedure_id || '', name: String(p.name || m?.name || ''), qty: Number(p.qty) || 1, price: p.price !== undefined && p.price !== '' ? Number(p.price) : undefined, by: p.by || ctx.session.name };
    });
  }
  const e = E('medical_records');
  const existing = await q1(ctx.env, 'SELECT id, status FROM medical_records WHERE visit_id = ?', v.id);
  if (existing?.status === 'final' && !b.reopen) throw badRequest('Rekam medis sudah final. Gunakan "Buka kembali" bila perlu koreksi.');
  if (b.allergies !== undefined) await run(ctx.env, 'UPDATE patients SET allergies = ?, updated_at = ? WHERE id = ?', String(b.allergies).slice(0, 1000), nowISO(), v.patient_id);
  delete data.allergies;
  const finalize = isDoctor && !!b.finalize;
  if (finalize) {
    data.status = 'final';
    data.signed_at = nowISO();
  } else if (b.reopen && isDoctor) data.status = 'draft';
  const doctorId = isDoctor ? ctx.session.doctor_id || v.doctor_id : v.doctor_id;
  if (existing) await updateStmt(ctx.env, e, existing.id, { ...data, ...(isDoctor && doctorId ? { doctor_id: doctorId } : {}) }).run();
  else await d1Insert(ctx.env, e, { ...data, visit_id: v.id, patient_id: v.patient_id, doctor_id: doctorId, branch_id: v.branch_id, date: v.date, status: data.status || 'draft' }, ctx.session.uid);

  const nextStatus = finalize ? await afterExamStatus(ctx, v.id) : isDoctor ? 'examining' : v.status === 'registered' ? 'triage' : v.status;
  await run(ctx.env, 'UPDATE visits SET status = ?, doctor_id = COALESCE(doctor_id, ?), queue_status = CASE WHEN ? THEN \'done\' ELSE queue_status END, finished_at = CASE WHEN ? THEN ? ELSE finished_at END, updated_at = ? WHERE id = ?', nextStatus, doctorId, finalize ? 1 : 0, finalize ? 1 : 0, nowISO(), nowISO(), v.id);
  let invoice = null;
  if (finalize) {
    invoice = await buildVisitInvoice(ctx, v.id);
    if (v.appointment_id) await run(ctx.env, "UPDATE appointments SET status = 'completed', updated_at = ? WHERE id = ?", nowISO(), v.appointment_id);
    ctx.waitUntil(refreshQueue(ctx.env, v.branch_id, v.date).catch(() => {}));
    ctx.waitUntil(queueResource(ctx.env, 'Encounter', v.id).catch(() => {}));
  }
  audit(ctx, finalize ? 'finalize' : 'update', 'medical_records', v.id, Object.keys(data).join(','));
  return json({ ok: true, status: nextStatus, invoice });
}

async function afterExamStatus(ctx, visitId) {
  const [rx, lab] = await Promise.all([
    q1(ctx.env, "SELECT id FROM prescriptions WHERE visit_id = ? AND status IN ('new','prepared') LIMIT 1", visitId),
    q1(ctx.env, "SELECT id FROM lab_orders WHERE visit_id = ? AND status IN ('requested','sampled') LIMIT 1", visitId),
  ]);
  return lab ? 'lab' : rx ? 'pharmacy' : 'billing';
}

export async function savePrescription(ctx) {
  requirePerm(ctx, 'clinic:examine');
  const v = await loadVisit(ctx, ctx.params.id);
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const ids = (b.items || []).map((i) => Number(i.medicine_id)).filter(Boolean);
  const meds = ids.length ? await q(ctx.env, `SELECT id, name, strength, unit, price_sell FROM medicines WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
  const items = (b.items || []).filter((i) => i && (i.medicine_id || i.name)).slice(0, 40).map((i) => {
    const m = meds.find((x) => x.id === Number(i.medicine_id));
    return {
      medicine_id: m ? m.id : null,
      name: String(i.name || (m ? `${m.name}${m.strength ? ' ' + m.strength : ''}` : '')).slice(0, 200),
      qty: Math.max(0, Number(i.qty) || 1),
      unit: String(i.unit || byId(bundle.units, m?.unit)?.name || m?.unit || '').slice(0, 40),
      dose: String(i.dose || '').slice(0, 200),
      price: m ? Number(m.price_sell) || 0 : Number(i.price) || 0,
    };
  });
  const e = E('prescriptions');
  const existing = await q1(ctx.env, "SELECT id, status FROM prescriptions WHERE visit_id = ? AND status IN ('new','prepared') ORDER BY id DESC LIMIT 1", v.id);
  let id;
  if (!items.length) {
    if (existing) await run(ctx.env, "UPDATE prescriptions SET status = 'cancelled', updated_at = ? WHERE id = ?", nowISO(), existing.id);
    return json({ ok: true, prescription: null });
  }
  if (existing) {
    await updateStmt(ctx.env, e, existing.id, { items, notes: b.notes ?? '' }).run();
    id = existing.id;
  } else {
    id = await d1Insert(ctx.env, e, { rx_no: await makeNumber(ctx.env, 'rx', branchCode(bundle, v.branch_id)), date: localDate(), patient_id: v.patient_id, visit_id: v.id, doctor_id: ctx.session.doctor_id || v.doctor_id, branch_id: v.branch_id, items, status: 'new', notes: b.notes || '' }, ctx.session.uid);
    bumpStats(ctx, v.branch_id, { rx: 1 });
  }
  audit(ctx, 'save', 'prescriptions', id, `visit ${v.visit_no}`);
  const row = await q1(ctx.env, 'SELECT * FROM prescriptions WHERE id = ?', id);
  const inv = await q1(ctx.env, "SELECT id FROM invoices WHERE visit_id = ? AND status IN ('unpaid','draft','partial')", v.id);
  if (inv) await buildVisitInvoice(ctx, v.id);
  return json({ ok: true, prescription: decode(e, row) });
}

export async function orderLab(ctx) {
  if (!canAny(ctx, 'clinic:examine', 'lab_orders:create')) throw forbidden();
  const v = await loadVisit(ctx, ctx.params.id);
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const tests = (b.tests || []).map((tid) => byId(bundle.lab_tests, tid)).filter(Boolean).map((m) => labFlag(bundle, { test_id: m.id, name: m.name, result: '', flag: '' }));
  if (!tests.length) throw badRequest('Pilih minimal satu pemeriksaan');
  const lab_no = await makeNumber(ctx.env, 'lab', branchCode(bundle, v.branch_id));
  const id = await d1Insert(ctx.env, E('lab_orders'), { lab_no, date: localDate(), patient_id: v.patient_id, visit_id: v.id, doctor_id: ctx.session.doctor_id || v.doctor_id, branch_id: v.branch_id, tests, status: 'requested', notes: String(b.notes || '').slice(0, 1000) }, ctx.session.uid);
  bumpStats(ctx, v.branch_id, { lab: 1 });
  audit(ctx, 'create', 'lab_orders', id, lab_no);
  const inv = await q1(ctx.env, "SELECT id FROM invoices WHERE visit_id = ? AND status IN ('unpaid','draft','partial')", v.id);
  if (inv) await buildVisitInvoice(ctx, v.id);
  return json({ ok: true, id, lab_no }, 201);
}

export async function finishVisit(ctx) {
  if (!canAny(ctx, 'clinic:examine', 'visits:update')) throw forbidden();
  const v = await loadVisit(ctx, ctx.params.id);
  const invoice = await buildVisitInvoice(ctx, v.id);
  const status = await afterExamStatus(ctx, v.id);
  await run(ctx.env, "UPDATE visits SET status = ?, queue_status = 'done', finished_at = COALESCE(finished_at, ?), updated_at = ? WHERE id = ?", invoice.status === 'paid' && status === 'billing' ? 'done' : status, nowISO(), nowISO(), v.id);
  ctx.waitUntil(refreshQueue(ctx.env, v.branch_id, v.date).catch(() => {}));
  return json({ ok: true, invoice });
}

// ---------------------------------------------------------------- patient history
export async function patientHistory(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'patients:view', 'clinic:examine')) throw forbidden();
  const id = Number(ctx.params.id);
  const env = ctx.env;
  const [patient, visits, records, rx, labs, invoices, docs, appts, points] = await Promise.all([
    q1(env, 'SELECT * FROM patients WHERE id = ?', id),
    q(env, 'SELECT * FROM visits WHERE patient_id = ? ORDER BY id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM medical_records WHERE patient_id = ? ORDER BY date DESC, id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM lab_orders WHERE patient_id = ? ORDER BY id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM invoices WHERE patient_id = ? ORDER BY id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM documents WHERE patient_id = ? ORDER BY id DESC LIMIT 50', id),
    q(env, 'SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC LIMIT 30', id),
    q(env, 'SELECT * FROM loyalty_ledger WHERE patient_id = ? ORDER BY id DESC LIMIT 30', id),
  ]);
  if (!patient) throw notFound('Pasien tidak ditemukan');
  audit(ctx, 'view', 'patients', id, 'riwayat lengkap');
  return json({
    patient: decode(E('patients'), patient),
    visits,
    records: records.map((r) => decode(E('medical_records'), r)),
    prescriptions: rx.map((r) => decode(E('prescriptions'), r)),
    labs: labs.map((r) => decode(E('lab_orders'), r)),
    invoices: invoices.map((r) => decode(E('invoices'), r)),
    documents: docs,
    appointments: appts,
    points,
  });
}

export async function searchPatients(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'patients:view', 'clinic:register')) throw forbidden();
  const qs = String(ctx.url.searchParams.get('q') || '').trim();
  if (qs.length < 2) return json({ rows: [] });
  const like = `%${qs}%`;
  const rows = await q(ctx.env, 'SELECT id, mrn, name, gender, birth_date, phone, nik, bpjs_no, payer_type, insurer_id, allergies, member_tier, points FROM patients WHERE mrn = ? OR nik = ? OR bpjs_no = ? OR name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 15', qs.toUpperCase(), qs, qs, like, like);
  return json({ rows });
}

// ---------------------------------------------------------------- lab workbench
export async function labList(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'lab:process', 'lab_orders:view')) throw forbidden();
  const u = ctx.url.searchParams;
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, u.get('branch')) || active(bundle.branches)[0]?.id;
  const status = u.get('status') || 'open';
  const where = ['l.branch_id = ?'];
  const params = [branch];
  if (status === 'open') where.push("l.status IN ('requested','sampled','completed')");
  else if (status !== 'all') {
    where.push('l.status = ?');
    params.push(status);
  }
  const rows = await q(ctx.env, `SELECT l.*, p.name AS patient_name, p.mrn, p.gender, p.birth_date FROM lab_orders l JOIN patients p ON p.id = l.patient_id WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT 100`, ...params);
  return json({ rows: rows.map((r) => ({ ...decode(E('lab_orders'), r), patient_name: r.patient_name, mrn: r.mrn, gender: r.gender, birth_date: r.birth_date })) });
}

export async function labSave(ctx) {
  requirePerm(ctx, 'lab:process');
  const id = Number(ctx.params.id);
  const order = await q1(ctx.env, 'SELECT * FROM lab_orders WHERE id = ?', id);
  if (!order) throw notFound();
  branchOf(ctx, order.branch_id);
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const tests = (b.tests || parseJSON(order.tests, [])).map((t) => labFlag(bundle, t));
  const status = ['requested', 'sampled', 'completed', 'validated', 'cancelled'].includes(b.status) ? b.status : order.status;
  const data = { tests, status, notes: b.notes ?? order.notes };
  if ((status === 'completed' || status === 'validated') && !order.result_at) data.result_at = nowISO();
  if (status === 'validated') data.validated_by = ctx.session.name;
  await updateStmt(ctx.env, E('lab_orders'), id, data).run();
  if (status === 'validated' && order.status !== 'validated') {
    ctx.waitUntil(notify(ctx.env, { template: 'lab_ready', data: { lab_no: order.lab_no, link: `${ctx.site}/app/#/portal/visits` }, patientId: order.patient_id, channels: ['inapp'], ref: order.lab_no }).catch(() => {}));
    if (order.visit_id) {
      const pending = await q1(ctx.env, "SELECT id FROM lab_orders WHERE visit_id = ? AND id != ? AND status IN ('requested','sampled')", order.visit_id, id);
      if (!pending) {
        const rx = await q1(ctx.env, "SELECT id FROM prescriptions WHERE visit_id = ? AND status IN ('new','prepared')", order.visit_id);
        await run(ctx.env, "UPDATE visits SET status = CASE WHEN status = 'lab' THEN ? ELSE status END, updated_at = ? WHERE id = ?", rx ? 'pharmacy' : 'billing', nowISO(), order.visit_id);
      }
    }
    ctx.waitUntil(queueResource(ctx.env, 'DiagnosticReport', id).catch(() => {}));
  }
  audit(ctx, 'update', 'lab_orders', id, status);
  return json({ ok: true });
}

// ---------------------------------------------------------------- doctor worklist
export async function doctorToday(ctx) {
  requireStaff(ctx);
  const u = ctx.url.searchParams;
  const doctorId = u.get('doctor') || ctx.session.doctor_id;
  const date = isDate(u.get('date')) ? u.get('date') : localDate();
  const bundle = await getBundle(ctx.env);
  const b = userBranch(ctx);
  const [visits, appts] = await Promise.all([
    q(ctx.env, `SELECT v.*, p.name AS patient_name, p.mrn, p.gender, p.birth_date, p.allergies, (SELECT vitals FROM medical_records r WHERE r.visit_id = v.id) AS vitals, (SELECT status FROM medical_records r WHERE r.visit_id = v.id) AS record_status FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.date = ? AND (v.doctor_id = ? OR (v.doctor_id IS NULL AND v.poli_id = ?))${b ? ' AND v.branch_id = ?' : ''} AND v.status != 'cancelled' ORDER BY v.queue_seq LIMIT 200`, date, doctorId, byId(bundle.doctors, doctorId)?.poli_id || '', ...(b ? [b] : [])),
    q(ctx.env, "SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status NOT IN ('cancelled') ORDER BY time LIMIT 200", doctorId, date),
  ]);
  const schedule = active(bundle.schedules).filter((s) => s.doctor_id === doctorId);
  return json({ doctor: byId(bundle.doctors, doctorId) || null, date, visits: visits.map((v) => ({ ...v, vitals: parseJSON(v.vitals, null) })), appointments: appts, schedule });
}
