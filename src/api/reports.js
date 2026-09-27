// Reports & dashboard. Dashboard KPIs come from daily stat counters (a handful of rows) instead of scanning tables.
import { canAny, requirePerm, requireStaff, userBranch } from '../lib/auth.js';
import { active, byId, getBundle } from '../lib/cms.js';
import { getQueue, readStats } from '../lib/clinic.js';
import { q, q1 } from '../lib/db.js';
import { reportPdf } from '../lib/docs.js';
import { addDays, badRequest, forbidden, isDate, json, localDate, tr } from '../lib/util.js';

const memDash = new Map();

export async function dashboard(ctx) {
  requireStaff(ctx);
  if (!canAny(ctx, 'dashboard:view')) throw forbidden();
  const u = ctx.url.searchParams;
  const branch = userBranch(ctx) || u.get('branch') || '';
  const key = `${branch}|${ctx.session.role}`;
  const hit = memDash.get(key);
  if (hit && Date.now() - hit.at < 20_000) return json(hit.data);
  const env = ctx.env;
  const bundle = await getBundle(env);
  const today = localDate();
  const from = addDays(today, 13);
  const start = addDays(today, -13);
  const bw = branch ? ' AND branch_id = ?' : '';
  const bp = branch ? [branch] : [];
  const [stats, apptsToday, unpaid, upcoming, mrn, lowStock, expiring, pendingPay, labOpen, rxOpen] = await Promise.all([
    readStats(env, start, today, branch || null),
    q(env, `SELECT status, COUNT(*) AS n FROM appointments WHERE date = ?${bw} GROUP BY status`, today, ...bp),
    q1(env, `SELECT COUNT(*) AS n, COALESCE(SUM(total - paid),0) AS amount FROM invoices WHERE status IN ('unpaid','partial')${bw}`, ...bp),
    q(env, `SELECT id, booking_no, name, time, date, doctor_id, poli_id, status, type FROM appointments WHERE date >= ? AND status IN ('confirmed','pending')${bw} ORDER BY date, time LIMIT 8`, today, ...bp),
    q1(env, "SELECT value FROM counters WHERE key = 'mrn'"),
    q1(env, `SELECT COUNT(*) AS n FROM (SELECT m.id FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id = m.id${branch ? ' AND b.branch_id = ?' : ''} WHERE m.is_active = 1 GROUP BY m.id HAVING COALESCE(SUM(b.qty),0) <= m.min_stock)`, ...bp),
    q1(env, `SELECT COUNT(*) AS n FROM stock_batches WHERE qty > 0 AND expired_at >= ? AND expired_at <= ?${bw}`, today, addDays(today, 90), ...bp),
    q1(env, `SELECT COUNT(*) AS n FROM payments WHERE status = 'pending'${bw}`, ...bp),
    q1(env, `SELECT COUNT(*) AS n FROM lab_orders WHERE status IN ('requested','sampled')${bw}`, ...bp),
    q1(env, `SELECT COUNT(*) AS n FROM prescriptions WHERE status IN ('new','prepared')${bw}`, ...bp),
  ]);
  const days = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push({ date: d, ...(stats[d] || {}) });
  const t = stats[today] || {};
  const queues = branch ? [await getQueue(env, branch, today)] : await Promise.all(active(bundle.branches).map((b) => getQueue(env, b.id, today)));
  const data = {
    today,
    branch,
    kpi: {
      patients_total: mrn?.value || 0,
      patients_new: t.new_patients || 0,
      visits: t.visits || 0,
      bookings: t.bookings || 0,
      revenue: t.revenue || 0,
      appointments: apptsToday.reduce((a, r) => a + (['cancelled'].includes(r.status) ? 0 : r.n), 0),
      unpaid_count: unpaid?.n || 0,
      unpaid_amount: unpaid?.amount || 0,
      low_stock: lowStock?.n || 0,
      expiring: expiring?.n || 0,
      pending_payments: pendingPay?.n || 0,
      lab_open: labOpen?.n || 0,
      rx_open: rxOpen?.n || 0,
      queue_waiting: queues.reduce((a, qq) => a + (qq.polis || []).reduce((x, p) => x + p.waiting, 0), 0),
    },
    series: days,
    apptStatus: apptsToday,
    upcoming: upcoming.map((a) => ({ ...a, doctor: byId(bundle.doctors, a.doctor_id)?.name, poli: tr(byId(bundle.polis, a.poli_id)?.name) })),
    queues: queues.map((qq) => ({ ...qq, branch: byId(bundle.branches, qq.branch_id)?.name })),
  };
  memDash.set(key, { at: Date.now(), data });
  return json(data);
}

// ---------------------------------------------------------------- reports
const money = (key, label) => ({ key, label, type: 'money' });
const num = (key, label) => ({ key, label, type: 'number' });
const txt = (key, label) => ({ key, label });

const REPORTS = {
  visits: {
    title: 'Laporan Kunjungan',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT v.date, v.visit_no, v.queue_no, p.mrn, p.name, v.poli_id, v.doctor_id, v.payer_type, v.status, v.branch_id FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.date BETWEEN ? AND ?${f.bw('v')} ORDER BY v.date, v.id LIMIT 5000`, f.from, f.to, ...f.bp);
      return { columns: [txt('date', 'Tanggal'), txt('visit_no', 'No. Kunjungan'), txt('mrn', 'No. RM'), txt('name', 'Pasien'), txt('poli', 'Poli'), txt('doctor', 'Dokter'), txt('payer_type', 'Penjamin'), txt('status', 'Status')], rows: rows.map((r) => ({ ...r, poli: tr(byId(bundle.polis, r.poli_id)?.name), doctor: byId(bundle.doctors, r.doctor_id)?.name || '-' })), chartBy: 'date' };
    },
  },
  patients: {
    title: 'Laporan Pasien Baru',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT substr(created_at,1,10) AS date, mrn, name, gender, birth_date, phone, payer_type, city, branch_id FROM patients WHERE created_at BETWEEN ? AND ?${f.bw()} ORDER BY id LIMIT 5000`, f.from, f.to + 'T23:59:59Z', ...f.bp);
      return { columns: [txt('date', 'Terdaftar'), txt('mrn', 'No. RM'), txt('name', 'Nama'), txt('gender', 'JK'), txt('birth_date', 'Tgl lahir'), txt('phone', 'HP'), txt('payer_type', 'Penjamin'), txt('branch', 'Cabang')], rows: rows.map((r) => ({ ...r, branch: byId(bundle.branches, r.branch_id)?.name || '-' })), chartBy: 'date' };
    },
  },
  doctors: {
    title: 'Laporan Kinerja Dokter',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT v.doctor_id, COUNT(*) AS visits, COUNT(DISTINCT v.patient_id) AS patients, SUM(CASE WHEN v.status = 'done' THEN 1 ELSE 0 END) AS done FROM visits v WHERE v.date BETWEEN ? AND ?${f.bw('v')} GROUP BY v.doctor_id ORDER BY visits DESC`, f.from, f.to, ...f.bp);
      return { columns: [txt('doctor', 'Dokter'), num('visits', 'Kunjungan'), num('patients', 'Pasien unik'), num('done', 'Selesai')], rows: rows.map((r) => ({ ...r, doctor: byId(bundle.doctors, r.doctor_id)?.name || 'Belum ditentukan' })), chart: { label: 'doctor', value: 'visits' } };
    },
  },
  polis: {
    title: 'Laporan per Poli',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT v.poli_id, COUNT(*) AS visits, COUNT(DISTINCT v.patient_id) AS patients FROM visits v WHERE v.date BETWEEN ? AND ?${f.bw('v')} GROUP BY v.poli_id ORDER BY visits DESC`, f.from, f.to, ...f.bp);
      return { columns: [txt('poli', 'Poli'), num('visits', 'Kunjungan'), num('patients', 'Pasien unik')], rows: rows.map((r) => ({ ...r, poli: tr(byId(bundle.polis, r.poli_id)?.name) || r.poli_id })), chart: { label: 'poli', value: 'visits' } };
    },
  },
  diagnoses: {
    title: 'Laporan 50 Diagnosis Terbanyak (ICD-10)',
    async run(env, f) {
      const rows = await q(env, `SELECT json_extract(d.value,'$.code') AS code, json_extract(d.value,'$.name') AS name, COUNT(*) AS total FROM medical_records r, json_each(r.diagnoses) d WHERE r.date BETWEEN ? AND ?${f.bw('r')} GROUP BY code, name ORDER BY total DESC LIMIT 50`, f.from, f.to, ...f.bp);
      return { columns: [txt('code', 'Kode ICD-10'), txt('name', 'Diagnosis'), num('total', 'Jumlah')], rows, chart: { label: 'code', value: 'total' } };
    },
  },
  procedures: {
    title: 'Laporan Tindakan',
    async run(env, f) {
      const rows = await q(env, `SELECT json_extract(d.value,'$.name') AS name, SUM(COALESCE(json_extract(d.value,'$.qty'),1)) AS total, SUM(COALESCE(json_extract(d.value,'$.qty'),1) * COALESCE(json_extract(d.value,'$.price'),0)) AS amount FROM medical_records r, json_each(r.procedures) d WHERE r.date BETWEEN ? AND ?${f.bw('r')} GROUP BY name ORDER BY total DESC LIMIT 100`, f.from, f.to, ...f.bp);
      return { columns: [txt('name', 'Tindakan'), num('total', 'Jumlah'), money('amount', 'Nilai')], rows, chart: { label: 'name', value: 'total' } };
    },
  },
  medicines: {
    title: 'Laporan Penggunaan Obat',
    async run(env, f) {
      const rows = await q(env, `SELECT m.code, m.name, m.strength, -SUM(s.qty) AS used, COUNT(*) AS moves FROM stock_moves s JOIN medicines m ON m.id = s.medicine_id WHERE s.type IN ('dispense','sale') AND s.date BETWEEN ? AND ?${f.bw('s')} GROUP BY s.medicine_id ORDER BY used DESC LIMIT 200`, f.from, f.to, ...f.bp);
      return { columns: [txt('code', 'Kode'), txt('name', 'Obat'), txt('strength', 'Kekuatan'), num('used', 'Terpakai'), num('moves', 'Transaksi')], rows, chart: { label: 'name', value: 'used' } };
    },
  },
  stock: {
    title: 'Laporan Stok Obat',
    async run(env, f) {
      const br = f.branch;
      const rows = await q(env, `SELECT m.code, m.name, m.strength, m.min_stock, m.price_buy, COALESCE(SUM(b.qty),0) AS stock, COALESCE(SUM(b.qty * COALESCE(NULLIF(b.cost,0), m.price_buy)),0) AS value, MIN(CASE WHEN b.qty > 0 THEN b.expired_at END) AS nearest_exp FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id = m.id${br ? ' AND b.branch_id = ?' : ''} WHERE m.is_active = 1 GROUP BY m.id ORDER BY m.name LIMIT 5000`, ...(br ? [br] : []));
      return { columns: [txt('code', 'Kode'), txt('name', 'Obat'), txt('strength', 'Kekuatan'), num('stock', 'Stok'), num('min_stock', 'Min.'), txt('nearest_exp', 'Exp. terdekat'), money('value', 'Nilai persediaan')], rows, totals: { value: rows.reduce((a, r) => a + r.value, 0), stock: rows.reduce((a, r) => a + r.stock, 0) } };
    },
  },
  inventory: {
    title: 'Laporan Mutasi Inventory',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT s.date, m.name, s.type, s.qty, s.balance, s.ref, s.note, s.user_name, s.branch_id FROM stock_moves s JOIN medicines m ON m.id = s.medicine_id WHERE s.date BETWEEN ? AND ?${f.bw('s')} ORDER BY s.id LIMIT 5000`, f.from, f.to, ...f.bp);
      return { columns: [txt('date', 'Tanggal'), txt('name', 'Obat'), txt('type', 'Jenis'), num('qty', 'Qty'), num('balance', 'Saldo batch'), txt('ref', 'Referensi'), txt('user_name', 'Petugas'), txt('branch', 'Cabang')], rows: rows.map((r) => ({ ...r, branch: byId(bundle.branches, r.branch_id)?.name })) };
    },
  },
  sales: {
    title: 'Laporan Penjualan Obat',
    async run(env, f) {
      const rows = await q(env, `SELECT i.date, i.invoice_no, COALESCE(p.name, i.customer_name, 'Umum') AS customer, i.total, i.paid, i.status FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id WHERE i.type = 'pharmacy' AND i.date BETWEEN ? AND ?${f.bw('i')} ORDER BY i.id LIMIT 5000`, f.from, f.to, ...f.bp);
      return { columns: [txt('date', 'Tanggal'), txt('invoice_no', 'No. Invoice'), txt('customer', 'Pelanggan'), money('total', 'Total'), money('paid', 'Dibayar'), txt('status', 'Status')], rows, totals: { total: rows.reduce((a, r) => a + r.total, 0), paid: rows.reduce((a, r) => a + r.paid, 0) }, chartBy: 'date', chartValue: 'total' };
    },
  },
  payments: {
    title: 'Laporan Pembayaran',
    async run(env, f) {
      const rows = await q(env, `SELECT py.date, py.payment_no, i.invoice_no, COALESCE(p.name, i.customer_name) AS customer, py.method, py.amount, py.status, py.confirmed_by FROM payments py JOIN invoices i ON i.id = py.invoice_id LEFT JOIN patients p ON p.id = py.patient_id WHERE py.date BETWEEN ? AND ?${f.bw('py')} ORDER BY py.id LIMIT 5000`, f.from, f.to, ...f.bp);
      const ok = rows.filter((r) => r.status === 'confirmed' || r.status === 'refunded');
      return { columns: [txt('date', 'Tanggal'), txt('payment_no', 'No. Bayar'), txt('invoice_no', 'Invoice'), txt('customer', 'Pasien'), txt('method', 'Metode'), money('amount', 'Jumlah'), txt('status', 'Status'), txt('confirmed_by', 'Kasir')], rows, totals: { amount: ok.reduce((a, r) => a + r.amount, 0) }, chart: { label: 'method', value: 'amount', group: true } };
    },
  },
  revenue: {
    title: 'Laporan Pendapatan',
    async run(env, f) {
      const rows = await q(env, `SELECT py.date, COUNT(*) AS trx, SUM(CASE WHEN py.method = 'cash' THEN py.amount ELSE 0 END) AS cash, SUM(CASE WHEN py.method IN ('transfer','va') THEN py.amount ELSE 0 END) AS transfer, SUM(CASE WHEN py.method IN ('qris','ewallet','gateway') THEN py.amount ELSE 0 END) AS digital, SUM(CASE WHEN py.method = 'card' THEN py.amount ELSE 0 END) AS card, SUM(CASE WHEN py.method = 'insurance' THEN py.amount ELSE 0 END) AS insurance, SUM(py.amount) AS total FROM payments py WHERE py.status IN ('confirmed','refunded') AND py.date BETWEEN ? AND ?${f.bw('py')} GROUP BY py.date ORDER BY py.date`, f.from, f.to, ...f.bp);
      const refunds = await q1(env, `SELECT COALESCE(SUM(amount),0) AS s FROM refunds WHERE status = 'processed' AND date BETWEEN ? AND ?${f.bw()}`, f.from, f.to, ...f.bp);
      const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
      return { columns: [txt('date', 'Tanggal'), num('trx', 'Transaksi'), money('cash', 'Tunai'), money('transfer', 'Transfer/VA'), money('digital', 'QRIS/E-wallet'), money('card', 'Kartu'), money('insurance', 'Asuransi'), money('total', 'Total')], rows, totals: { trx: sum('trx'), cash: sum('cash'), transfer: sum('transfer'), digital: sum('digital'), card: sum('card'), insurance: sum('insurance'), total: sum('total') - refunds.s }, note: refunds.s ? `Total sudah dikurangi refund ${refunds.s}` : '', chart: { label: 'date', value: 'total' } };
    },
  },
  lab: {
    title: 'Laporan Laboratorium',
    async run(env, f) {
      const rows = await q(env, `SELECT json_extract(t.value,'$.name') AS name, COUNT(*) AS total, SUM(CASE WHEN json_extract(t.value,'$.flag') IN ('H','L','A') THEN 1 ELSE 0 END) AS abnormal, SUM(COALESCE(json_extract(t.value,'$.price'),0)) AS amount FROM lab_orders l, json_each(l.tests) t WHERE l.date BETWEEN ? AND ? AND l.status != 'cancelled'${f.bw('l')} GROUP BY name ORDER BY total DESC LIMIT 200`, f.from, f.to, ...f.bp);
      return { columns: [txt('name', 'Pemeriksaan'), num('total', 'Jumlah'), num('abnormal', 'Abnormal'), money('amount', 'Nilai')], rows, chart: { label: 'name', value: 'total' } };
    },
  },
  appointments: {
    title: 'Laporan Booking / Appointment',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT date, time, booking_no, name, phone, doctor_id, type, status, source FROM appointments WHERE date BETWEEN ? AND ?${f.bw()} ORDER BY date, time LIMIT 5000`, f.from, f.to, ...f.bp);
      return { columns: [txt('date', 'Tanggal'), txt('time', 'Jam'), txt('booking_no', 'No. Booking'), txt('name', 'Pasien'), txt('doctor', 'Dokter'), txt('type', 'Jenis'), txt('status', 'Status'), txt('source', 'Sumber')], rows: rows.map((r) => ({ ...r, doctor: byId(bundle.doctors, r.doctor_id)?.name })), chart: { label: 'status', value: 'count', group: true } };
    },
  },
  claims: {
    title: 'Laporan Klaim BPJS / Asuransi',
    async run(env, f, bundle) {
      const rows = await q(env, `SELECT c.date, c.claim_no, c.insurer_id, p.name, c.sep_no, c.amount, c.approved_amount, c.status FROM claims c LEFT JOIN patients p ON p.id = c.patient_id WHERE c.date BETWEEN ? AND ?${f.bw('c')} ORDER BY c.id LIMIT 5000`, f.from, f.to, ...f.bp);
      return { columns: [txt('date', 'Tanggal'), txt('claim_no', 'No. Klaim'), txt('insurer', 'Penjamin'), txt('name', 'Pasien'), txt('sep_no', 'SEP/GL'), money('amount', 'Diajukan'), money('approved_amount', 'Disetujui'), txt('status', 'Status')], rows: rows.map((r) => ({ ...r, insurer: byId(bundle.insurers, r.insurer_id)?.name })), totals: { amount: rows.reduce((a, r) => a + (r.amount || 0), 0), approved_amount: rows.reduce((a, r) => a + (r.approved_amount || 0), 0) } };
    },
  },
};

export function reportList() {
  return Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title }));
}

function chartFrom(res) {
  const rows = res.rows || [];
  if (res.chartBy) {
    const m = new Map();
    for (const r of rows) m.set(r[res.chartBy], (m.get(r[res.chartBy]) || 0) + (res.chartValue ? Number(r[res.chartValue]) || 0 : 1));
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }
  if (res.chart?.group) {
    const m = new Map();
    for (const r of rows) m.set(r[res.chart.label], (m.get(r[res.chart.label]) || 0) + (res.chart.value === 'count' ? 1 : Number(r[res.chart.value]) || 0));
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }
  if (res.chart) return rows.slice(0, 15).map((r) => ({ label: String(r[res.chart.label] ?? '-'), value: Number(r[res.chart.value]) || 0 }));
  return null;
}

export async function report(ctx) {
  requirePerm(ctx, 'reports:view');
  const r = REPORTS[ctx.params.type];
  if (!r) throw badRequest('Jenis laporan tidak dikenal');
  const u = ctx.url.searchParams;
  const to = isDate(u.get('to')) ? u.get('to') : localDate();
  const from = isDate(u.get('from')) ? u.get('from') : addDays(to, -29);
  const branch = userBranch(ctx) || u.get('branch') || '';
  const f = { from, to, branch, bp: branch ? [branch] : [], bw: (a) => (branch ? ` AND ${a ? a + '.' : ''}branch_id = ?` : '') };
  const bundle = await getBundle(ctx.env);
  const res = await r.run(ctx.env, f, bundle);
  const out = { id: ctx.params.type, title: r.title, from, to, branch, ...res, chart: chartFrom(res) };
  if (u.get('format') === 'pdf') {
    requirePerm(ctx, 'reports:export');
    const bytes = reportPdf({ title: r.title, subtitle: `Periode ${from} s/d ${to}${branch ? ' · ' + (byId(bundle.branches, branch)?.name || branch) : ' · Semua cabang'}`, columns: res.columns, rows: res.rows, totals: res.totals, settings: bundle.settings });
    return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${ctx.params.type}-${from}-${to}.pdf"` } });
  }
  return json(out);
}
