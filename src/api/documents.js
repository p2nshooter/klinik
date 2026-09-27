// PDF downloads. Each document is generated once and cached in R2 (pdf/<type>/<id>.pdf);
// the cache is keyed by the record's updated_at + content version so edits regenerate automatically.
import { canAny } from '../lib/auth.js';
import { byId, getBundle } from '../lib/cms.js';
import { decode, d1Entity, q, q1 } from '../lib/db.js';
import { audit } from '../lib/db.js';
import * as D from '../lib/docs.js';
import { forbidden, notFound, unauthorized } from '../lib/util.js';
import { samePhone } from './shared.js';

async function cached(ctx, key, ver, filename, build) {
  const u = ctx.url.searchParams;
  const disposition = `${u.get('download') === '1' ? 'attachment' : 'inline'}; filename="${filename.replace(/[^\w.-]+/g, '-')}"`;
  const headers = { 'content-type': 'application/pdf', 'content-disposition': disposition, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  const head = await ctx.env.R2.head(key);
  if (head && head.customMetadata?.ver === ver) {
    const obj = await ctx.env.R2.get(key);
    if (obj) return new Response(obj.body, { headers: { ...headers, 'x-cache': 'R2' } });
  }
  const bytes = await build();
  ctx.waitUntil(ctx.env.R2.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { ver } }));
  return new Response(bytes, { headers: { ...headers, 'x-cache': 'MISS' } });
}

function assertAccess(ctx, patientId, perms) {
  if (!ctx.session) throw unauthorized();
  if (ctx.session.role === 'patient') {
    if (!patientId || ctx.session.patient_id !== patientId) throw forbidden();
    return;
  }
  if (!canAny(ctx, ...perms)) throw forbidden();
  if (ctx.session.branch_id && ctx._branch && ctx._branch !== ctx.session.branch_id) throw forbidden();
}

export async function invoice(ctx) {
  const inv = await q1(ctx.env, 'SELECT * FROM invoices WHERE id = ?', Number(ctx.params.id));
  if (!inv) throw notFound();
  ctx._branch = inv.branch_id;
  assertAccess(ctx, inv.patient_id, ['invoices:view', 'billing:cashier']);
  const bundle = await getBundle(ctx.env);
  const data = decode(d1Entity('invoices'), inv);
  audit(ctx, 'download', 'invoices', inv.id, 'pdf');
  return cached(ctx, `pdf/invoice/${inv.id}.pdf`, `${inv.updated_at}|${bundle.ver}`, `Invoice-${inv.invoice_no}.pdf`, async () => {
    const [patient, payments, visit] = await Promise.all([
      inv.patient_id ? q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', inv.patient_id) : null,
      q(ctx.env, "SELECT * FROM payments WHERE invoice_id = ? AND status IN ('confirmed','refunded') ORDER BY id", inv.id),
      inv.visit_id ? q1(ctx.env, 'SELECT visit_no FROM visits WHERE id = ?', inv.visit_id) : null,
    ]);
    return D.invoicePdf({ inv: data, patient, branch: byId(bundle.branches, inv.branch_id), settings: bundle.settings, payments, visit });
  });
}

export async function receipt(ctx) {
  const pay = await q1(ctx.env, 'SELECT * FROM payments WHERE id = ?', Number(ctx.params.id));
  if (!pay) throw notFound();
  ctx._branch = pay.branch_id;
  assertAccess(ctx, pay.patient_id, ['payments:view', 'billing:cashier']);
  const bundle = await getBundle(ctx.env);
  audit(ctx, 'download', 'payments', pay.id, 'kwitansi');
  return cached(ctx, `pdf/receipt/${pay.id}.pdf`, `${pay.updated_at}|${bundle.ver}`, `Kwitansi-${pay.payment_no}.pdf`, async () => {
    const inv = await q1(ctx.env, 'SELECT * FROM invoices WHERE id = ?', pay.invoice_id);
    const patient = pay.patient_id ? await q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', pay.patient_id) : null;
    return D.receiptPdf({ pay, inv: decode(d1Entity('invoices'), inv), patient, branch: byId(bundle.branches, pay.branch_id), settings: bundle.settings });
  });
}

export async function lab(ctx) {
  const order = await q1(ctx.env, 'SELECT * FROM lab_orders WHERE id = ?', Number(ctx.params.id));
  if (!order) throw notFound();
  ctx._branch = order.branch_id;
  assertAccess(ctx, order.patient_id, ['lab_orders:view', 'lab:process', 'clinic:examine']);
  if (ctx.session.role === 'patient' && !['completed', 'validated'].includes(order.status)) throw forbidden('Hasil belum tersedia');
  const bundle = await getBundle(ctx.env);
  audit(ctx, 'download', 'lab_orders', order.id, 'pdf');
  return cached(ctx, `pdf/lab/${order.id}.pdf`, `${order.updated_at}|${bundle.ver}`, `Hasil-Lab-${order.lab_no}.pdf`, async () => {
    const patient = await q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', order.patient_id);
    return D.labPdf({ order: decode(d1Entity('lab_orders'), order), patient, doctor: byId(bundle.doctors, order.doctor_id), branch: byId(bundle.branches, order.branch_id), settings: bundle.settings });
  });
}

export async function prescription(ctx) {
  const rx = await q1(ctx.env, 'SELECT * FROM prescriptions WHERE id = ?', Number(ctx.params.id));
  if (!rx) throw notFound();
  ctx._branch = rx.branch_id;
  assertAccess(ctx, rx.patient_id, ['prescriptions:view', 'pharmacy:dispense', 'clinic:examine']);
  const bundle = await getBundle(ctx.env);
  audit(ctx, 'download', 'prescriptions', rx.id, 'pdf');
  return cached(ctx, `pdf/rx/${rx.id}.pdf`, `${rx.updated_at}|${bundle.ver}`, `Resep-${rx.rx_no}.pdf`, async () => {
    const patient = await q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', rx.patient_id);
    return D.prescriptionPdf({ rx: decode(d1Entity('prescriptions'), rx), patient, doctor: byId(bundle.doctors, rx.doctor_id), branch: byId(bundle.branches, rx.branch_id), settings: bundle.settings });
  });
}

export async function patientCard(ctx) {
  const p = await q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', Number(ctx.params.id));
  if (!p) throw notFound();
  assertAccess(ctx, p.id, ['patients:view', 'clinic:register']);
  const bundle = await getBundle(ctx.env);
  return cached(ctx, `pdf/card/${p.id}.pdf`, `${p.updated_at}|${bundle.ver}`, `Kartu-Pasien-${p.mrn}.pdf`, async () => D.patientCardPdf({ patient: p, settings: bundle.settings, siteUrl: ctx.site }));
}

export async function visitSlip(ctx) {
  const v = await q1(ctx.env, 'SELECT * FROM visits WHERE id = ?', Number(ctx.params.id));
  if (!v) throw notFound();
  ctx._branch = v.branch_id;
  assertAccess(ctx, v.patient_id, ['visits:view', 'clinic:register']);
  const bundle = await getBundle(ctx.env);
  return cached(ctx, `pdf/slip/${v.id}.pdf`, `${v.updated_at}|${bundle.ver}`, `Bukti-Daftar-${v.visit_no}.pdf`, async () => {
    const patient = await q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', v.patient_id);
    return D.visitSlipPdf({ visit: v, patient, poli: byId(bundle.polis, v.poli_id), doctor: byId(bundle.doctors, v.doctor_id), branch: byId(bundle.branches, v.branch_id), settings: bundle.settings, siteUrl: ctx.site });
  });
}

export async function record(ctx) {
  const v = await q1(ctx.env, 'SELECT * FROM visits WHERE id = ?', Number(ctx.params.id));
  if (!v) throw notFound();
  ctx._branch = v.branch_id;
  assertAccess(ctx, v.patient_id, ['medical_records:view', 'clinic:examine']);
  const rec = await q1(ctx.env, 'SELECT * FROM medical_records WHERE visit_id = ?', v.id);
  if (ctx.session.role === 'patient' && rec?.status !== 'final') throw forbidden('Resume medis belum final');
  const bundle = await getBundle(ctx.env);
  audit(ctx, 'download', 'medical_records', v.id, 'resume');
  return cached(ctx, `pdf/record/${v.id}.pdf`, `${rec?.updated_at || v.updated_at}|${bundle.ver}`, `Resume-Medis-${v.visit_no}.pdf`, async () => {
    const [patient, rx, labs] = await Promise.all([
      q1(ctx.env, 'SELECT * FROM patients WHERE id = ?', v.patient_id),
      q(ctx.env, "SELECT * FROM prescriptions WHERE visit_id = ? AND status != 'cancelled'", v.id),
      q(ctx.env, "SELECT * FROM lab_orders WHERE visit_id = ? AND status IN ('completed','validated')", v.id),
    ]);
    return D.recordPdf({ visit: v, record: rec ? decode(d1Entity('medical_records'), rec) : null, patient, doctor: byId(bundle.doctors, v.doctor_id), poli: byId(bundle.polis, v.poli_id), branch: byId(bundle.branches, v.branch_id), settings: bundle.settings, rx: rx.map((r) => decode(d1Entity('prescriptions'), r)), labs: labs.map((r) => decode(d1Entity('lab_orders'), r)) });
  });
}

export async function booking(ctx) {
  const no = String(ctx.params.no || '').toUpperCase();
  const a = await q1(ctx.env, 'SELECT * FROM appointments WHERE booking_no = ?', no);
  if (!a) throw notFound();
  const phone = ctx.url.searchParams.get('phone');
  const staff = ctx.session && ctx.session.role !== 'patient' && canAny(ctx, 'appointments:view');
  const owner = ctx.session?.role === 'patient' && ctx.session.patient_id && a.patient_id === ctx.session.patient_id;
  if (!staff && !owner && !samePhone(phone, a.phone)) throw forbidden();
  const bundle = await getBundle(ctx.env);
  return cached(ctx, `pdf/booking/${a.id}.pdf`, `${a.updated_at}|${bundle.ver}`, `Booking-${a.booking_no}.pdf`, async () =>
    D.bookingPdf({ appt: a, poli: byId(bundle.polis, a.poli_id), doctor: byId(bundle.doctors, a.doctor_id), service: byId(bundle.services, a.service_id), branch: byId(bundle.branches, a.branch_id), settings: bundle.settings, siteUrl: ctx.site })
  );
}
