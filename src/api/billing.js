// Billing & payments: cashier workbench, invoice edits, payments (multi-method), confirmation, refunds, claims,
// Midtrans Snap payment gateway (VA, e-wallet, QRIS, card) with signed webhook.
import { can, canAny, requirePerm, requireStaff, userBranch } from '../lib/auth.js';
import { active, getBundle } from '../lib/cms.js';
import { branchCode, computeTotals, couponDiscount, invoiceStatus } from '../lib/clinic.js';
import { b64, sha512hex } from '../lib/crypto.js';
import { audit, d1Entity, d1Insert, decode, makeNumber, q, q1, run, updateStmt } from '../lib/db.js';
import { badRequest, forbidden, json, localDate, notFound, nowISO, readJSON, unauthorized } from '../lib/util.js';
import { processRefund } from './crud.js';
import { buildVisitInvoice, recordPayment, settleInvoice } from './shared.js';

const INV = () => d1Entity('invoices');
const PAY = () => d1Entity('payments');

async function loadInvoice(ctx, id) {
  const inv = await q1(ctx.env, 'SELECT * FROM invoices WHERE id = ?', Number(id));
  if (!inv) throw notFound('Invoice tidak ditemukan');
  const b = userBranch(ctx);
  if (ctx.session?.role !== 'patient' && b && inv.branch_id !== b) throw forbidden();
  return decode(INV(), inv);
}

export async function cashierList(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'billing:cashier', 'invoices:view')) throw forbidden();
  const u = ctx.url.searchParams;
  const bundle = await getBundle(ctx.env);
  const branch = userBranch(ctx) || u.get('branch') || active(bundle.branches)[0]?.id;
  const status = u.get('status') || 'open';
  const where = ['i.branch_id = ?'];
  const params = [branch];
  if (status === 'open') where.push("i.status IN ('unpaid','partial','draft')");
  else if (status === 'today') {
    where.push('i.date = ?');
    params.push(localDate());
  } else if (status !== 'all') {
    where.push('i.status = ?');
    params.push(status);
  }
  if (u.get('q')) {
    where.push('(i.invoice_no LIKE ? OR p.name LIKE ? OR p.mrn = ? OR i.customer_name LIKE ?)');
    const l = `%${u.get('q')}%`;
    params.push(l, l, u.get('q').toUpperCase(), l);
  }
  const rows = await q(ctx.env, `SELECT i.*, p.name AS patient_name, p.mrn, v.queue_no, v.status AS visit_status FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id LEFT JOIN visits v ON v.id = i.visit_id WHERE ${where.join(' AND ')} ORDER BY i.id DESC LIMIT 100`, ...params);
  const pending = await q(ctx.env, "SELECT py.*, i.invoice_no, p.name AS patient_name FROM payments py JOIN invoices i ON i.id = py.invoice_id LEFT JOIN patients p ON p.id = py.patient_id WHERE py.branch_id = ? AND py.status = 'pending' ORDER BY py.id DESC LIMIT 50", branch);
  const today = await q1(ctx.env, "SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM payments WHERE branch_id = ? AND date = ? AND status IN ('confirmed','refunded')", branch, localDate());
  const byMethod = await q(ctx.env, "SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM payments WHERE branch_id = ? AND date = ? AND status IN ('confirmed','refunded') GROUP BY method", branch, localDate());
  return json({ branch, rows: rows.map((r) => ({ ...decode(INV(), r), patient_name: r.patient_name, mrn: r.mrn, queue_no: r.queue_no, visit_status: r.visit_status })), pending, today, byMethod });
}

export async function invoiceDetail(ctx) {
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (ctx.session?.role === 'patient') {
    if (inv.patient_id !== ctx.session.patient_id) throw forbidden();
  } else if (!canAny(ctx, 'invoices:view', 'billing:cashier')) throw forbidden();
  const [payments, refunds, patient, claims] = await Promise.all([
    q(ctx.env, 'SELECT * FROM payments WHERE invoice_id = ? ORDER BY id', inv.id),
    q(ctx.env, 'SELECT * FROM refunds WHERE invoice_id = ? ORDER BY id', inv.id),
    inv.patient_id ? q1(ctx.env, 'SELECT id, mrn, name, phone, email, address, payer_type, insurer_id, insurance_no, bpjs_no, points, member_tier FROM patients WHERE id = ?', inv.patient_id) : null,
    q(ctx.env, 'SELECT * FROM claims WHERE invoice_id = ? ORDER BY id', inv.id),
  ]);
  return json({ invoice: inv, payments, refunds, patient, claims });
}

export async function invoiceEdit(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'billing:cashier', 'invoices:update')) throw forbidden();
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (['paid', 'refunded', 'void'].includes(inv.status)) throw badRequest('Invoice sudah lunas/batal');
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const items = (Array.isArray(b.items) ? b.items : inv.items).slice(0, 200).map((i) => ({ kind: i.kind || 'other', name: String(i.name || '').slice(0, 200), qty: Number(i.qty) || 1, price: Number(i.price) || 0, discount: Number(i.discount) || 0, auto: !!i.auto, ref: i.ref }));
  let discount = b.discount !== undefined ? Number(b.discount) || 0 : inv.discount;
  let coupon = inv.coupon;
  const notes = [];
  if (b.coupon !== undefined && b.coupon !== inv.coupon) {
    const c = await couponDiscount(ctx.env, b.coupon, computeTotals(items).subtotal);
    if (b.coupon && !c.discount) throw badRequest(c.error || 'Kupon tidak valid');
    coupon = b.coupon ? String(b.coupon).toUpperCase() : '';
    discount = (b.discount !== undefined ? Number(b.discount) || 0 : 0) + (c.discount || 0);
    if (coupon) notes.push(`Kupon ${coupon}`);
  }
  const t = computeTotals(items, discount, bundle.settings?.tax_percent);
  const data = { items, ...t, coupon, status: t.total <= 0 ? 'paid' : invoiceStatus(t.total, inv.paid) };
  if (b.payer_type) data.payer_type = b.payer_type;
  if (b.insurer_id !== undefined) data.insurer_id = b.insurer_id || null;
  if (b.notes !== undefined || notes.length) data.notes = [b.notes ?? inv.notes, ...notes].filter(Boolean).join(' · ');
  await updateStmt(ctx.env, INV(), inv.id, data).run();
  audit(ctx, 'update', 'invoices', inv.id, 'edit kasir');
  return json({ ok: true, invoice: { ...inv, ...data } });
}

export async function rebuild(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'billing:cashier', 'invoices:update')) throw forbidden();
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (!inv.visit_id) throw badRequest('Invoice ini bukan invoice kunjungan');
  return json({ invoice: await buildVisitInvoice(ctx, inv.visit_id) });
}

export async function pay(ctx) {
  requirePerm(ctx, 'billing:cashier');
  const inv = await loadInvoice(ctx, ctx.params.id);
  const b = await readJSON(ctx.req);
  const methods = ['cash', 'transfer', 'qris', 'va', 'ewallet', 'card', 'insurance'];
  if (!methods.includes(b.method)) throw badRequest('Metode pembayaran tidak valid');
  const payment = await recordPayment(ctx, inv, { method: b.method, amount: b.amount, reference: String(b.reference || '').slice(0, 100), notes: String(b.notes || '').slice(0, 500) });
  if (b.method === 'insurance' && inv.insurer_id) {
    const bundle = await getBundle(ctx.env);
    await d1Insert(ctx.env, d1Entity('claims'), { claim_no: await makeNumber(ctx.env, 'claim', branchCode(bundle, inv.branch_id)), date: localDate(), invoice_id: inv.id, patient_id: inv.patient_id, insurer_id: inv.insurer_id, branch_id: inv.branch_id, amount: payment.amount, status: 'draft', notes: 'Otomatis dari pembayaran asuransi' }, ctx.session.uid);
  }
  return json({ ok: true, payment }, 201);
}

export async function confirmPayment(ctx) {
  requirePerm(ctx, 'billing:cashier');
  const p = await q1(ctx.env, 'SELECT * FROM payments WHERE id = ?', Number(ctx.params.id));
  if (!p) throw notFound();
  if (p.status !== 'pending') throw badRequest('Pembayaran bukan status menunggu');
  const b = await readJSON(ctx.req);
  const approve = b.approve !== false;
  await run(ctx.env, 'UPDATE payments SET status = ?, confirmed_by = ?, notes = TRIM(COALESCE(notes,\'\') || \' \' || ?), updated_at = ? WHERE id = ?', approve ? 'confirmed' : 'failed', ctx.session.name, b.notes || '', nowISO(), p.id);
  if (approve) await settleInvoice(ctx, p.invoice_id, { ...p, status: 'confirmed' });
  audit(ctx, approve ? 'payment_confirm' : 'payment_reject', 'payments', p.id);
  return json({ ok: true });
}

export async function refund(ctx) {
  requirePerm(ctx, 'billing:refund');
  const b = await readJSON(ctx.req);
  return json({ ok: true, refund: await processRefund(ctx, Number(ctx.params.id), b.amount, b.reason) }, 201);
}

export async function voidInvoice(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'billing:cashier', 'invoices:update')) throw forbidden();
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (inv.paid > 0) throw badRequest('Invoice memiliki pembayaran. Refund terlebih dahulu.');
  const b = await readJSON(ctx.req);
  await run(ctx.env, "UPDATE invoices SET status = 'void', notes = TRIM(COALESCE(notes,'') || ' [VOID: ' || ? || ']'), updated_at = ? WHERE id = ?", String(b.reason || '-').slice(0, 200), nowISO(), inv.id);
  audit(ctx, 'void', 'invoices', inv.id, b.reason);
  return json({ ok: true });
}

export async function createClaim(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'claims:create', 'billing:cashier')) throw forbidden();
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (!inv.insurer_id) throw badRequest('Invoice belum memiliki penjamin/asuransi');
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const p = inv.patient_id ? await q1(ctx.env, 'SELECT insurance_no, bpjs_no FROM patients WHERE id = ?', inv.patient_id) : null;
  const id = await d1Insert(ctx.env, d1Entity('claims'), { claim_no: await makeNumber(ctx.env, 'claim', branchCode(bundle, inv.branch_id)), date: localDate(), invoice_id: inv.id, patient_id: inv.patient_id, insurer_id: inv.insurer_id, branch_id: inv.branch_id, member_no: p?.bpjs_no || p?.insurance_no || '', sep_no: b.sep_no || '', amount: Number(b.amount) || Math.max(0, inv.total - inv.paid) || inv.total, status: 'draft', notes: b.notes || '' }, ctx.session.uid);
  audit(ctx, 'create', 'claims', id, inv.invoice_no);
  return json({ ok: true, id }, 201);
}

// ---------------------------------------------------------------- Midtrans Snap
const snapBase = (env) => (env.MIDTRANS_IS_PRODUCTION === 'true' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');

export async function gateway(ctx) {
  if (!ctx.session) throw unauthorized();
  const inv = await loadInvoice(ctx, ctx.params.id);
  if (ctx.session.role === 'patient' ? inv.patient_id !== ctx.session.patient_id : !can(ctx.perms, 'billing:cashier')) throw forbidden();
  if (!ctx.env.MIDTRANS_SERVER_KEY) throw badRequest('Payment gateway belum diaktifkan (MIDTRANS_SERVER_KEY belum diisi). Gunakan transfer bank / QRIS.');
  const due = Math.round(inv.total - inv.paid);
  if (due <= 0) throw badRequest('Invoice sudah lunas');
  const orderId = `${inv.invoice_no.replace(/\//g, '-')}-${Date.now().toString(36)}`;
  const p = inv.patient_id ? await q1(ctx.env, 'SELECT name, phone, email FROM patients WHERE id = ?', inv.patient_id) : null;
  const r = await fetch(`${snapBase(ctx.env)}/snap/v1/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', Authorization: 'Basic ' + b64(new TextEncoder().encode(ctx.env.MIDTRANS_SERVER_KEY + ':')) },
    body: JSON.stringify({ transaction_details: { order_id: orderId, gross_amount: due }, customer_details: { first_name: p?.name || inv.customer_name || 'Pasien', phone: p?.phone || '', email: p?.email || '' }, callbacks: { finish: `${ctx.site}/app/#/portal/invoices` } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.redirect_url) throw badRequest('Gagal membuat transaksi gateway: ' + (d.error_messages || []).join(', '));
  await d1Insert(ctx.env, PAY(), { payment_no: await makeNumber(ctx.env, 'payment', branchCode(await getBundle(ctx.env), inv.branch_id)), date: localDate(), invoice_id: inv.id, patient_id: inv.patient_id, branch_id: inv.branch_id, method: 'gateway', amount: due, status: 'pending', gateway_ref: orderId, reference: 'Midtrans Snap' }, ctx.session.uid);
  return json({ redirect_url: d.redirect_url, token: d.token });
}

export async function midtransWebhook(ctx) {
  const b = await readJSON(ctx.req, 50000);
  const key = ctx.env.MIDTRANS_SERVER_KEY;
  if (!key) throw forbidden();
  const sig = await sha512hex(`${b.order_id}${b.status_code}${b.gross_amount}${key}`);
  if (sig !== b.signature_key) throw forbidden('Signature tidak valid');
  const p = await q1(ctx.env, 'SELECT * FROM payments WHERE gateway_ref = ?', String(b.order_id));
  if (!p) return json({ ok: true });
  const st = b.transaction_status;
  const ok = (st === 'capture' && b.fraud_status !== 'deny') || st === 'settlement';
  const fail = ['deny', 'cancel', 'expire', 'failure'].includes(st);
  if (ok && p.status !== 'confirmed') {
    await run(ctx.env, "UPDATE payments SET status = 'confirmed', method = 'gateway', reference = ?, confirmed_by = 'Midtrans', updated_at = ? WHERE id = ?", `${b.payment_type || ''} ${b.transaction_id || ''}`.trim(), nowISO(), p.id);
    await settleInvoice(ctx, p.invoice_id, { ...p, status: 'confirmed' });
  } else if (fail && p.status === 'pending') await run(ctx.env, "UPDATE payments SET status = 'failed', updated_at = ? WHERE id = ?", nowISO(), p.id);
  ctx.session = { username: 'midtrans', role: 'system' };
  audit(ctx, 'gateway_webhook', 'payments', p.id, st);
  return json({ ok: true });
}
