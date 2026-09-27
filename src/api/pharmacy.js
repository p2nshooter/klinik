// Pharmacy & inventory: FEFO dispensing, OTC sales, stock in/out, opname, transfers, returns, PO receiving, alerts.
import { canAny, requirePerm, requireStaff, userBranch } from '../lib/auth.js';
import { active, byId, getBundle } from '../lib/cms.js';
import { addDays, badRequest, conflict, forbidden, json, localDate, notFound, nowISO, parseJSON, readJSON } from '../lib/util.js';
import { branchCode, bumpStats, computeTotals } from '../lib/clinic.js';
import { audit, batch, d1Entity, d1Insert, decode, makeNumber, q, q1, run } from '../lib/db.js';
import { recordPayment } from './shared.js';

function branchOf(ctx, requested, bundle) {
  const b = userBranch(ctx);
  if (b && requested && requested !== b) throw forbidden('Anda hanya dapat mengakses cabang Anda');
  return b || requested || active(bundle.branches)[0]?.id;
}

const moveStmt = (env, m) =>
  env.DB.prepare('INSERT INTO stock_moves (date, medicine_id, branch_id, batch_id, type, qty, balance, ref, note, user_name, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
    localDate(), m.medicine_id, m.branch_id, m.batch_id ?? null, m.type, m.qty, m.balance ?? null, m.ref || '', m.note || '', m.user || '', nowISO(), nowISO(), m.uid ?? null
  );

/** Allocate quantity from batches using FEFO (first-expired-first-out). Returns statements + allocations. */
async function fefoOut(ctx, medicineId, branchId, qty, type, ref, note) {
  const env = ctx.env;
  const batches = await q(env, "SELECT id, qty, batch_no, expired_at FROM stock_batches WHERE medicine_id = ? AND branch_id = ? AND qty > 0 AND (expired_at IS NULL OR expired_at = '' OR expired_at >= ?) ORDER BY CASE WHEN expired_at IS NULL OR expired_at = '' THEN 1 ELSE 0 END, expired_at, id", medicineId, branchId, localDate());
  const available = batches.reduce((a, b) => a + b.qty, 0);
  if (available < qty) return { error: available };
  const stmts = [];
  const alloc = [];
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    left -= take;
    stmts.push(env.DB.prepare('UPDATE stock_batches SET qty = qty - ?, updated_at = ? WHERE id = ?').bind(take, nowISO(), b.id));
    stmts.push(moveStmt(env, { medicine_id: medicineId, branch_id: branchId, batch_id: b.id, type, qty: -take, balance: b.qty - take, ref, note, user: ctx.session.name, uid: ctx.session.uid }));
    alloc.push({ batch_id: b.id, batch_no: b.batch_no, expired_at: b.expired_at, qty: take });
  }
  return { stmts, alloc };
}

async function stockIn(ctx, { medicine_id, branch_id, batch_no, expired_at, qty, cost, supplier_id }, type = 'in', ref = '', note = '') {
  const env = ctx.env;
  qty = Number(qty);
  if (!medicine_id || !(qty > 0)) throw badRequest('Obat dan jumlah wajib diisi');
  const bn = String(batch_no || 'NOBATCH').trim().slice(0, 60);
  const existing = await q1(env, 'SELECT id, qty FROM stock_batches WHERE medicine_id = ? AND branch_id = ? AND batch_no = ?', Number(medicine_id), branch_id, bn);
  let batchId = existing?.id;
  const stmts = [];
  if (existing) stmts.push(env.DB.prepare('UPDATE stock_batches SET qty = qty + ?, expired_at = COALESCE(?, expired_at), cost = COALESCE(?, cost), updated_at = ? WHERE id = ?').bind(qty, expired_at || null, cost ?? null, nowISO(), existing.id));
  else {
    const r = await q1(env, 'INSERT INTO stock_batches (medicine_id, branch_id, batch_no, expired_at, qty, cost, supplier_id, created_at, updated_at, created_by) VALUES (?,?,?,?,0,?,?,?,?,?) RETURNING id', Number(medicine_id), branch_id, bn, expired_at || null, Number(cost) || 0, supplier_id ? Number(supplier_id) : null, nowISO(), nowISO(), ctx.session.uid);
    batchId = r.id;
    stmts.push(env.DB.prepare('UPDATE stock_batches SET qty = qty + ? WHERE id = ?').bind(qty, batchId));
  }
  stmts.push(moveStmt(env, { medicine_id: Number(medicine_id), branch_id, batch_id: batchId, type, qty, balance: (existing?.qty || 0) + qty, ref, note, user: ctx.session.name, uid: ctx.session.uid }));
  return { stmts, batchId };
}

// ---------------------------------------------------------------- queries
export async function stockList(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const u = ctx.url.searchParams;
  const branch = branchOf(ctx, u.get('branch'), bundle);
  const where = ['m.is_active = 1'];
  const params = [branch];
  if (u.get('q')) {
    where.push('(m.name LIKE ? OR m.code LIKE ? OR m.generic_name LIKE ?)');
    const l = `%${u.get('q')}%`;
    params.push(l, l, l);
  }
  if (u.get('category')) {
    where.push('m.category = ?');
    params.push(u.get('category'));
  }
  const limit = Math.min(200, Number(u.get('limit')) || 50);
  const page = Math.max(1, Number(u.get('page')) || 1);
  const having = u.get('low') === '1' ? 'HAVING stock <= m.min_stock' : '';
  const rows = await q(
    ctx.env,
    `SELECT m.id, m.code, m.name, m.generic_name, m.strength, m.form, m.unit, m.category, m.price_sell, m.price_buy, m.min_stock, m.requires_rx,
            COALESCE(SUM(b.qty), 0) AS stock, MIN(CASE WHEN b.qty > 0 THEN b.expired_at END) AS nearest_exp, COUNT(CASE WHEN b.qty > 0 THEN 1 END) AS batches
       FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id = m.id AND b.branch_id = ?
      WHERE ${where.join(' AND ')} GROUP BY m.id ${having} ORDER BY m.name LIMIT ? OFFSET ?`,
    ...params, limit + 1, (page - 1) * limit
  );
  return json({ branch, rows: rows.slice(0, limit).map((r) => ({ ...r, unit_name: byId(bundle.units, r.unit)?.name || r.unit, category_name: byId(bundle.medicine_categories, r.category)?.name || r.category })), hasMore: rows.length > limit, page });
}

export async function batches(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, ctx.url.searchParams.get('branch'), bundle);
  const rows = await q(ctx.env, 'SELECT * FROM stock_batches WHERE medicine_id = ? AND branch_id = ? ORDER BY expired_at, id', Number(ctx.params.id), branch);
  const moves = await q(ctx.env, 'SELECT * FROM stock_moves WHERE medicine_id = ? AND branch_id = ? ORDER BY id DESC LIMIT 50', Number(ctx.params.id), branch);
  return json({ batches: rows, moves });
}

export async function search(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, ctx.url.searchParams.get('branch'), bundle);
  const s = `%${ctx.url.searchParams.get('q') || ''}%`;
  const rows = await q(ctx.env, `SELECT m.id, m.name, m.strength, m.unit, m.price_sell, m.requires_rx, COALESCE((SELECT SUM(qty) FROM stock_batches b WHERE b.medicine_id = m.id AND b.branch_id = ?), 0) AS stock FROM medicines m WHERE m.is_active = 1 AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.code LIKE ?) ORDER BY m.name LIMIT 20`, branch, s, s, s);
  return json({ rows: rows.map((r) => ({ ...r, unit_name: byId(bundle.units, r.unit)?.name || r.unit })) });
}

export async function alerts(ctx) {
  requireStaff(ctx);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, ctx.url.searchParams.get('branch'), bundle);
  const [low, expiring, expired] = await Promise.all([
    q(ctx.env, 'SELECT m.id, m.name, m.strength, m.min_stock, COALESCE(SUM(b.qty),0) AS stock FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id = m.id AND b.branch_id = ? WHERE m.is_active = 1 GROUP BY m.id HAVING stock <= m.min_stock ORDER BY stock LIMIT 100', branch),
    q(ctx.env, 'SELECT b.*, m.name, m.strength FROM stock_batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.branch_id = ? AND b.qty > 0 AND b.expired_at >= ? AND b.expired_at <= ? ORDER BY b.expired_at LIMIT 100', branch, localDate(), addDays(localDate(), 90)),
    q(ctx.env, 'SELECT b.*, m.name, m.strength FROM stock_batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.branch_id = ? AND b.qty > 0 AND b.expired_at < ? ORDER BY b.expired_at LIMIT 100', branch, localDate()),
  ]);
  return json({ branch, low, expiring, expired });
}

export async function rxQueue(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'pharmacy:dispense', 'prescriptions:view')) throw forbidden();
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, ctx.url.searchParams.get('branch'), bundle);
  const status = ctx.url.searchParams.get('status') || 'open';
  const rows = await q(
    ctx.env,
    `SELECT r.*, p.name AS patient_name, p.mrn, p.allergies, v.queue_no, (SELECT status FROM invoices i WHERE i.visit_id = r.visit_id ORDER BY i.id DESC LIMIT 1) AS invoice_status
       FROM prescriptions r JOIN patients p ON p.id = r.patient_id LEFT JOIN visits v ON v.id = r.visit_id
      WHERE r.branch_id = ? AND ${status === 'open' ? "r.status IN ('new','prepared')" : status === 'all' ? '1=1' : 'r.status = ?'} ORDER BY r.id DESC LIMIT 100`,
    ...(status === 'open' || status === 'all' ? [branch] : [branch, status])
  );
  return json({ rows: rows.map((r) => ({ ...decode(d1Entity('prescriptions'), r), patient_name: r.patient_name, mrn: r.mrn, allergies: r.allergies, queue_no: r.queue_no, invoice_status: r.invoice_status })) });
}

// ---------------------------------------------------------------- mutations
export async function dispense(ctx) {
  requirePerm(ctx, 'pharmacy:dispense');
  const rx = await q1(ctx.env, 'SELECT * FROM prescriptions WHERE id = ?', Number(ctx.params.id));
  if (!rx) throw notFound('Resep tidak ditemukan');
  const bundle = await getBundle(ctx.env);
  branchOf(ctx, rx.branch_id, bundle);
  if (!['new', 'prepared'].includes(rx.status)) throw badRequest('Resep sudah diproses');
  const items = parseJSON(rx.items, []);
  const stmts = [];
  const shortages = [];
  for (const it of items) {
    if (!it.medicine_id || !(Number(it.qty) > 0)) continue;
    const r = await fefoOut(ctx, it.medicine_id, rx.branch_id, Number(it.qty), 'dispense', rx.rx_no, 'Dispensing resep');
    if (r.error !== undefined) shortages.push(`${it.name} (tersedia ${r.error})`);
    else stmts.push(...r.stmts);
  }
  if (shortages.length) throw conflict('Stok tidak cukup: ' + shortages.join(', '));
  stmts.push(ctx.env.DB.prepare("UPDATE prescriptions SET status = 'dispensed', dispensed_by = ?, dispensed_at = ?, updated_at = ? WHERE id = ?").bind(ctx.session.name, nowISO(), nowISO(), rx.id));
  if (rx.visit_id) stmts.push(ctx.env.DB.prepare("UPDATE visits SET status = CASE WHEN status = 'pharmacy' THEN (CASE WHEN EXISTS (SELECT 1 FROM invoices WHERE visit_id = ? AND status = 'paid') THEN 'done' ELSE 'billing' END) ELSE status END, updated_at = ? WHERE id = ?").bind(rx.visit_id, nowISO(), rx.visit_id));
  await batch(ctx.env, stmts);
  audit(ctx, 'dispense', 'prescriptions', rx.id, rx.rx_no);
  return json({ ok: true });
}

export async function sale(ctx) {
  requirePerm(ctx, 'pharmacy:sale');
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, b.branch_id, bundle);
  const ids = (b.items || []).map((i) => Number(i.medicine_id)).filter(Boolean);
  if (!ids.length) throw badRequest('Keranjang kosong');
  const meds = await q(ctx.env, `SELECT id, name, strength, price_sell, requires_rx FROM medicines WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const items = [];
  const stmts = [];
  const shortages = [];
  const ref = `SALE-${Date.now().toString(36).toUpperCase()}`;
  for (const i of b.items) {
    const m = meds.find((x) => x.id === Number(i.medicine_id));
    const qty = Number(i.qty);
    if (!m || !(qty > 0)) continue;
    const r = await fefoOut(ctx, m.id, branch, qty, 'sale', ref, 'Penjualan obat');
    if (r.error !== undefined) shortages.push(`${m.name} (tersedia ${r.error})`);
    else stmts.push(...r.stmts);
    items.push({ kind: 'medicine', name: `${m.name}${m.strength ? ' ' + m.strength : ''}`, qty, price: Number(m.price_sell) || 0, discount: Number(i.discount) || 0, auto: false });
  }
  if (shortages.length) throw conflict('Stok tidak cukup: ' + shortages.join(', '));
  const t = computeTotals(items, b.discount || 0, bundle.settings?.tax_percent);
  await batch(ctx.env, stmts);
  const inv = { invoice_no: await makeNumber(ctx.env, 'invoice', branchCode(bundle, branch)), date: localDate(), patient_id: b.patient_id ? Number(b.patient_id) : null, customer_name: String(b.customer_name || '').slice(0, 120), branch_id: branch, type: 'pharmacy', items, ...t, paid: 0, status: 'unpaid', payer_type: 'umum', notes: `Ref stok ${ref}` };
  const id = await d1Insert(ctx.env, d1Entity('invoices'), inv, ctx.session.uid);
  let payment = null;
  if (b.method && t.total > 0) payment = await recordPayment(ctx, { id, ...inv }, { method: b.method, amount: b.amount_paid || t.total, reference: b.reference || '' });
  bumpStats(ctx, branch, { sales: t.total });
  audit(ctx, 'sale', 'invoices', id, inv.invoice_no);
  return json({ ok: true, invoice_id: id, invoice_no: inv.invoice_no, total: t.total, payment }, 201);
}

export async function receive(ctx) {
  requirePerm(ctx, 'pharmacy:stock');
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const branch = branchOf(ctx, b.branch_id, bundle);
  const { stmts } = await stockIn(ctx, { ...b, branch_id: branch }, 'in', b.ref || 'Penerimaan', b.note || '');
  await batch(ctx.env, stmts);
  audit(ctx, 'stock_in', 'stock_batches', b.medicine_id, `${b.qty} ${b.batch_no || ''}`);
  return json({ ok: true }, 201);
}

export async function adjust(ctx) {
  requirePerm(ctx, 'pharmacy:stock');
  const b = await readJSON(ctx.req);
  const batchRow = await q1(ctx.env, 'SELECT * FROM stock_batches WHERE id = ?', Number(b.batch_id));
  if (!batchRow) throw notFound('Batch tidak ditemukan');
  const bundle = await getBundle(ctx.env);
  branchOf(ctx, batchRow.branch_id, bundle);
  const newQty = b.new_qty !== undefined ? Number(b.new_qty) : batchRow.qty + Number(b.delta || 0);
  if (!Number.isFinite(newQty) || newQty < 0) throw badRequest('Jumlah tidak valid');
  if (!b.reason) throw badRequest('Alasan penyesuaian wajib diisi');
  const delta = newQty - batchRow.qty;
  const type = ['adjust', 'expired', 'return', 'opname', 'out'].includes(b.type) ? b.type : 'adjust';
  await batch(ctx.env, [
    ctx.env.DB.prepare('UPDATE stock_batches SET qty = ?, updated_at = ? WHERE id = ?').bind(newQty, nowISO(), batchRow.id),
    moveStmt(ctx.env, { medicine_id: batchRow.medicine_id, branch_id: batchRow.branch_id, batch_id: batchRow.id, type, qty: delta, balance: newQty, ref: b.ref || '', note: String(b.reason).slice(0, 300), user: ctx.session.name, uid: ctx.session.uid }),
  ]);
  audit(ctx, `stock_${type}`, 'stock_batches', batchRow.id, { delta, reason: b.reason });
  return json({ ok: true });
}

export async function opname(ctx) {
  requirePerm(ctx, 'pharmacy:stock');
  const b = await readJSON(ctx.req);
  const items = (b.items || []).filter((i) => i.batch_id && i.counted !== '' && i.counted !== undefined);
  if (!items.length) throw badRequest('Tidak ada item opname');
  const rows = await q(ctx.env, `SELECT * FROM stock_batches WHERE id IN (${items.map(() => '?').join(',')})`, ...items.map((i) => Number(i.batch_id)));
  const bundle = await getBundle(ctx.env);
  const ref = `OPN-${localDate().replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const stmts = [];
  for (const it of items) {
    const r = rows.find((x) => x.id === Number(it.batch_id));
    if (!r) continue;
    branchOf(ctx, r.branch_id, bundle);
    const counted = Math.max(0, Number(it.counted));
    if (counted === r.qty) continue;
    stmts.push(ctx.env.DB.prepare('UPDATE stock_batches SET qty = ?, updated_at = ? WHERE id = ?').bind(counted, nowISO(), r.id));
    stmts.push(moveStmt(ctx.env, { medicine_id: r.medicine_id, branch_id: r.branch_id, batch_id: r.id, type: 'opname', qty: counted - r.qty, balance: counted, ref, note: b.note || 'Stock opname', user: ctx.session.name, uid: ctx.session.uid }));
  }
  if (stmts.length) await batch(ctx.env, stmts);
  audit(ctx, 'stock_opname', 'stock_batches', null, { ref, changed: stmts.length / 2 });
  return json({ ok: true, ref, changed: stmts.length / 2 });
}

export async function transfer(ctx) {
  requirePerm(ctx, 'pharmacy:stock');
  const b = await readJSON(ctx.req);
  const bundle = await getBundle(ctx.env);
  const from = branchOf(ctx, b.from_branch, bundle);
  const to = String(b.to_branch || '');
  if (!byId(bundle.branches, to) || to === from) throw badRequest('Cabang tujuan tidak valid');
  const qty = Number(b.qty);
  if (!(qty > 0)) throw badRequest('Jumlah tidak valid');
  const ref = `TRF-${Date.now().toString(36).toUpperCase()}`;
  const out = await fefoOut(ctx, Number(b.medicine_id), from, qty, 'transfer_out', ref, `Mutasi ke ${byId(bundle.branches, to).name}`);
  if (out.error !== undefined) throw conflict(`Stok tidak cukup (tersedia ${out.error})`);
  const stmts = [...out.stmts];
  for (const a of out.alloc) {
    const r = await stockIn(ctx, { medicine_id: b.medicine_id, branch_id: to, batch_no: a.batch_no, expired_at: a.expired_at, qty: a.qty }, 'transfer_in', ref, `Mutasi dari ${byId(bundle.branches, from).name}`);
    stmts.push(...r.stmts);
  }
  await batch(ctx.env, stmts);
  audit(ctx, 'stock_transfer', 'stock_batches', b.medicine_id, { from, to, qty });
  return json({ ok: true, ref });
}

export async function receivePO(ctx) {
  requirePerm(ctx, 'pharmacy:stock');
  const po = await q1(ctx.env, 'SELECT * FROM purchase_orders WHERE id = ?', Number(ctx.params.id));
  if (!po) throw notFound('PO tidak ditemukan');
  const bundle = await getBundle(ctx.env);
  branchOf(ctx, po.branch_id, bundle);
  if (po.status === 'received') throw badRequest('PO sudah diterima');
  if (po.status === 'cancelled') throw badRequest('PO dibatalkan');
  const b = await readJSON(ctx.req);
  const items = (b.items && b.items.length ? b.items : parseJSON(po.items, [])).filter((i) => i.medicine_id && Number(i.qty) > 0);
  if (!items.length) throw badRequest('PO tidak memiliki item');
  const stmts = [];
  for (const it of items) {
    const r = await stockIn(ctx, { medicine_id: it.medicine_id, branch_id: po.branch_id, batch_no: it.batch_no, expired_at: it.expired_at, qty: it.qty, cost: it.cost, supplier_id: po.supplier_id }, 'in', po.po_no, 'Penerimaan PO');
    stmts.push(...r.stmts);
    if (Number(it.cost) > 0) stmts.push(ctx.env.DB.prepare('UPDATE medicines SET price_buy = ?, updated_at = ? WHERE id = ?').bind(Number(it.cost), nowISO(), Number(it.medicine_id)));
  }
  stmts.push(ctx.env.DB.prepare("UPDATE purchase_orders SET status = 'received', items = ?, received_at = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(items), nowISO(), nowISO(), po.id));
  await batch(ctx.env, stmts);
  audit(ctx, 'po_receive', 'purchase_orders', po.id, po.po_no);
  return json({ ok: true });
}
