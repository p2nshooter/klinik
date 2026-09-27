// Printable/downloadable documents rendered with the in-house PDF writer.
import { PDF, textWidth, wrapText } from './pdf.js';
import { age, fmtDate, fmtDateTime, money, tr } from './util.js';

const C = { teal: '#0F766E', tealDark: '#0B4F4A', navy: '#0B1F33', gold: '#B8893B', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', soft: '#F1F5F9', mint: '#ECFDF5', red: '#B91C1C', green: '#15803D', blue: '#1D4ED8' };
const A4 = [595.28, 841.89];
const M = 40;

function ellipse(p, cx, cy, rx, ry, width = 1) {
  const kx = 0.5523 * rx, ky = 0.5523 * ry, X = cx, Y = p.Y(cy);
  const f = (v) => (Math.round(v * 100) / 100).toString();
  p.raw(`1 1 1 RG ${f(width)} w [] 0 d ${f(X + rx)} ${f(Y)} m ${f(X + rx)} ${f(Y + ky)} ${f(X + kx)} ${f(Y + ry)} ${f(X)} ${f(Y + ry)} c ${f(X - kx)} ${f(Y + ry)} ${f(X - rx)} ${f(Y + ky)} ${f(X - rx)} ${f(Y)} c ${f(X - rx)} ${f(Y - ky)} ${f(X - kx)} ${f(Y - ry)} ${f(X)} ${f(Y - ry)} c ${f(X + kx)} ${f(Y - ry)} ${f(X + rx)} ${f(Y - ky)} ${f(X + rx)} ${f(Y)} c h S`);
}

/** Vector Global Klinik emblem: teal globe with gold ring and rounded medical cross. */
export function drawLogo(p, x, y, s) {
  const r = s / 2, cx = x + r, cy = y + r;
  p.circle(cx, cy, r, { fill: C.teal });
  p.circle(cx, cy, r - s * 0.045, { stroke: C.gold, width: s * 0.035 });
  ellipse(p, cx, cy, r * 0.42, r * 0.8, s * 0.018);
  p.line(cx - r * 0.8, cy, cx + r * 0.8, cy, { color: '#5EEAD4', width: s * 0.018 });
  const a = s * 0.09, b = s * 0.5;
  p.rect(cx - a, cy - b / 2, a * 2, b, { fill: '#FFFFFF', radius: a * 0.6 });
  p.rect(cx - b / 2, cy - a, b, a * 2, { fill: '#FFFFFF', radius: a * 0.6 });
}

export function terbilang(num) {
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = (n) => {
    n = Math.floor(n);
    if (n < 12) return s[n];
    if (n < 20) return f(n - 10) + ' belas';
    if (n < 100) return f(n / 10) + ' puluh ' + f(n % 10);
    if (n < 200) return 'seratus ' + f(n - 100);
    if (n < 1000) return f(n / 100) + ' ratus ' + f(n % 100);
    if (n < 2000) return 'seribu ' + f(n - 1000);
    if (n < 1e6) return f(n / 1000) + ' ribu ' + f(n % 1000);
    if (n < 1e9) return f(n / 1e6) + ' juta ' + f(n % 1e6);
    if (n < 1e12) return f(n / 1e9) + ' miliar ' + f(n % 1e9);
    return f(n / 1e12) + ' triliun ' + f(n % 1e12);
  };
  const t = Math.abs(Math.round(num || 0)) === 0 ? 'nol' : f(Math.abs(Math.round(num)));
  const out = t.replace(/\s+/g, ' ').trim() + ' rupiah';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function clinicInfo(settings, branch) {
  return {
    name: settings.clinic_name || 'Global Klinik',
    branch: branch?.name || '',
    address: branch?.address || settings.address || '',
    contact: [branch?.phone || settings.phone, branch?.email || settings.email].filter(Boolean).join('  ·  '),
  };
}

function header(p, info, title, meta = []) {
  p.rect(0, 0, p.w, 6, { fill: C.teal });
  p.rect(0, 6, p.w, 2, { fill: C.gold });
  drawLogo(p, M, 28, 44);
  p.text(M + 56, 46, info.name, { size: 16, bold: true, color: C.navy });
  if (info.branch) p.text(M + 56, 60, info.branch, { size: 9, bold: true, color: C.teal });
  p.text(M + 56, info.branch ? 72 : 60, info.address, { size: 8, color: C.muted, maxWidth: 270 });
  p.text(M + 56, info.branch ? 83 : 71, info.contact, { size: 8, color: C.muted, maxWidth: 270 });
  const R = p.w - M;
  p.text(R, 48, title, { size: 20, bold: true, color: C.teal, align: 'right' });
  let y = 64;
  for (const [k, v] of meta) {
    p.text(R - textWidth(v, 8.5, true) - 10, y, k, { size: 8.5, color: C.muted, align: 'right' });
    p.text(R, y, v, { size: 8.5, bold: true, color: C.ink, align: 'right' });
    y += 12;
  }
  p.line(M, 104, R, 104, { color: C.line, width: 0.8 });
  return 118;
}

function footer(p, pageNo, pages, note) {
  const y = p.h - 28;
  p.line(M, y - 12, p.w - M, y - 12, { color: C.line });
  p.text(M, y, note || 'Dokumen ini dibuat secara elektronik oleh sistem Global Klinik dan sah tanpa tanda tangan basah.', { size: 7, color: C.muted, maxWidth: p.w - 2 * M - 80 });
  p.text(p.w - M, y, `Hal. ${pageNo}/${pages}`, { size: 7, color: C.muted, align: 'right' });
}

function labelValue(p, x, y, label, value, w = 240) {
  p.text(x, y, label, { size: 7.5, color: C.muted });
  p.text(x, y + 12, value || '-', { size: 10, bold: true, color: C.ink, maxWidth: w });
}

/**
 * Generic table with auto page breaks.
 * cols: [{ label, w, align, bold, key|get }]
 */
function table(doc, pageRef, x, y, cols, rows, o = {}) {
  let p = pageRef.p;
  const width = cols.reduce((a, c) => a + c.w, 0);
  const size = o.size || 8.5;
  const bottom = p.h - 70;
  const drawHead = () => {
    p.rect(x, y, width, 20, { fill: C.navy, radius: 3 });
    let cx = x;
    for (const c of cols) {
      const tx = c.align === 'right' ? cx + c.w - 6 : c.align === 'center' ? cx + c.w / 2 : cx + 6;
      p.text(tx, y + 13.5, c.label, { size: 7.5, bold: true, color: '#FFFFFF', align: c.align });
      cx += c.w;
    }
    y += 20;
  };
  drawHead();
  rows.forEach((r, i) => {
    const cells = cols.map((c) => String(c.get ? c.get(r, i) : r[c.key] ?? ''));
    const wrapped = cells.map((v, j) => (cols[j].wrap ? wrapText(v, cols[j].w - 12, size) : [v]));
    const h = Math.max(18, ...wrapped.map((l) => l.length * (size + 3) + 7));
    if (y + h > bottom) {
      p = doc.addPage(p.w, p.h);
      pageRef.p = p;
      y = o.topOnNewPage || 50;
      drawHead();
    }
    if (i % 2 === 1) p.rect(x, y, width, h, { fill: '#F8FAFC' });
    let cx = x;
    cols.forEach((c, j) => {
      const tx = c.align === 'right' ? cx + c.w - 6 : c.align === 'center' ? cx + c.w / 2 : cx + 6;
      const style = typeof c.style === 'function' ? c.style(r) : {};
      wrapped[j].forEach((line, li) => p.text(tx, y + 12 + li * (size + 3), line, { size, align: c.align, bold: c.bold, color: C.ink, maxWidth: c.wrap ? undefined : c.w - 10, ...style }));
      cx += c.w;
    });
    p.line(x, y + h, x + width, y + h, { color: C.line, width: 0.5 });
    y += h;
  });
  return y;
}

function finish(doc, note) {
  doc.pages.forEach((p, i) => footer(p, i + 1, doc.pages.length, note));
  return doc.toBytes();
}

// ------------------------------------------------------------------ INVOICE
export function invoicePdf({ inv, patient, branch, settings, payments = [], visit }) {
  const doc = new PDF({ title: `Invoice ${inv.invoice_no}` });
  const ref = { p: doc.addPage(...A4) };
  let p = ref.p;
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'INVOICE', [['No. Invoice', inv.invoice_no], ['Tanggal', fmtDate(inv.date)], ['Status', statusLabel(inv.status)]]);

  p.rect(M, y, 250, 86, { fill: C.soft, radius: 8 });
  p.text(M + 14, y + 18, 'DITAGIHKAN KEPADA', { size: 7.5, bold: true, color: C.teal });
  p.text(M + 14, y + 34, patient?.name || inv.customer_name || 'Pelanggan umum', { size: 11.5, bold: true, color: C.ink, maxWidth: 222 });
  if (patient?.mrn) p.text(M + 14, y + 48, `No. RM ${patient.mrn}`, { size: 8.5, color: C.muted });
  if (patient?.phone) p.text(M + 14, y + 60, patient.phone, { size: 8.5, color: C.muted });
  if (patient?.address) p.text(M + 14, y + 72, patient.address, { size: 8, color: C.muted, maxWidth: 222 });

  const bx = p.w - M - 245;
  p.rect(bx, y, 245, 86, { stroke: C.line, radius: 8 });
  labelValue(p, bx + 14, y + 16, 'Penjamin', payerLabel(inv.payer_type), 110);
  labelValue(p, bx + 130, y + 16, 'Jenis', { visit: 'Kunjungan', pharmacy: 'Penjualan obat', other: 'Lainnya' }[inv.type] || 'Kunjungan', 100);
  labelValue(p, bx + 14, y + 50, 'No. Kunjungan', visit?.visit_no || '-', 110);
  labelValue(p, bx + 130, y + 50, 'Sisa tagihan', money(Math.max(0, inv.total - inv.paid)), 100);
  y += 104;

  const items = inv.items || [];
  y = table(doc, ref, M, y, [
    { label: 'NO', w: 30, align: 'center', get: (_, i) => i + 1 },
    { label: 'DESKRIPSI', w: 225, wrap: true, get: (r) => r.name },
    { label: 'QTY', w: 45, align: 'right', get: (r) => fmtNum(r.qty) },
    { label: 'HARGA', w: 80, align: 'right', get: (r) => money(r.price) },
    { label: 'DISKON', w: 65, align: 'right', get: (r) => (Number(r.discount) ? money(r.discount) : '-') },
    { label: 'JUMLAH', w: 70.28, align: 'right', bold: true, get: (r) => money(lineTotal(r)) },
  ], items, { topOnNewPage: 50 });
  p = ref.p;

  if (y > p.h - 250) {
    p = ref.p = doc.addPage(...A4);
    y = 50;
  }
  y += 14;
  const tx = p.w - M - 230;
  const rows = [['Subtotal', money(inv.subtotal)], ['Diskon', inv.discount ? '- ' + money(inv.discount) : '-'], [`Pajak`, inv.tax ? money(inv.tax) : '-']];
  rows.forEach(([k, v]) => {
    p.text(tx, y, k, { size: 9, color: C.muted });
    p.text(p.w - M, y, v, { size: 9, align: 'right', color: C.ink });
    y += 15;
  });
  p.rect(tx - 10, y - 4, 240, 30, { fill: C.teal, radius: 6 });
  p.text(tx, y + 15, 'TOTAL', { size: 10, bold: true, color: '#FFFFFF' });
  p.text(p.w - M - 8, y + 15, money(inv.total), { size: 13, bold: true, color: '#FFFFFF', align: 'right' });
  y += 42;
  p.text(tx, y, 'Terbayar', { size: 9, color: C.muted });
  p.text(p.w - M, y, money(inv.paid), { size: 9, align: 'right', bold: true, color: C.green });
  y += 15;
  p.text(tx, y, 'Sisa', { size: 9, color: C.muted });
  p.text(p.w - M, y, money(Math.max(0, inv.total - inv.paid)), { size: 9, align: 'right', bold: true, color: inv.total - inv.paid > 0 ? C.red : C.ink });

  // left column: terbilang + payment info
  let ly = y - 72;
  p.text(M, ly, 'Terbilang', { size: 7.5, color: C.muted });
  ly = p.para(M, ly + 12, terbilang(inv.total), 260, { size: 9, bold: true, color: C.navy });
  if (payments.length) {
    ly += 6;
    p.text(M, ly, 'Riwayat pembayaran', { size: 7.5, color: C.muted });
    ly += 12;
    for (const pay of payments.slice(0, 6)) {
      p.text(M, ly, `${fmtDate(pay.date)} · ${methodLabel(pay.method)} · ${pay.payment_no}`, { size: 8, color: C.ink, maxWidth: 190 });
      p.text(M + 260, ly, money(pay.amount), { size: 8, bold: true, align: 'right', color: pay.status === 'confirmed' ? C.green : C.muted });
      ly += 12;
    }
  }
  const stamped = inv.status === 'paid' || inv.status === 'void';
  if (inv.status === 'paid') stamp(p, M + 40, ly - 8, 'LUNAS', C.green);
  else if (inv.status === 'void') stamp(p, M + 40, ly - 8, 'BATAL', C.red);
  y = Math.max(y + 30, ly + (stamped ? 76 : 16));

  const banks = settings.bank_accounts || [];
  if (inv.status !== 'paid' && banks.length) {
    if (y > p.h - 140) {
      p = ref.p = doc.addPage(...A4);
      y = 50;
    }
    p.rect(M, y, p.w - 2 * M, 22 + banks.length * 14, { fill: C.mint, radius: 8 });
    p.text(M + 14, y + 16, 'Pembayaran dapat ditransfer ke:', { size: 8.5, bold: true, color: C.tealDark });
    banks.forEach((b, i) => p.text(M + 14, y + 30 + i * 14, `${b.bank} · ${b.number} · a.n. ${b.holder}`, { size: 8.5, color: C.ink }));
    y += 32 + banks.length * 14;
  }
  if (inv.notes || settings.invoice_note) {
    y += 6;
    p.para(M, y, inv.notes || settings.invoice_note, p.w - 2 * M, { size: 8, color: C.muted });
  }
  return finish(doc);
}

function stamp(p, x, y, text, color, size = 38) {
  p.text(x, y + 60, text, { size, bold: true, color, rotate: 14 });
}

const lineTotal = (r) => Math.max(0, (Number(r.qty) || 0) * (Number(r.price) || 0) - (Number(r.discount) || 0));
const fmtNum = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : String(v ?? ''));
export const statusLabel = (s) => ({ draft: 'Draf', unpaid: 'Belum bayar', partial: 'Dibayar sebagian', paid: 'Lunas', refunded: 'Refund', void: 'Batal' })[s] || s || '-';
export const methodLabel = (m) => ({ cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS', va: 'Virtual Account', ewallet: 'E-wallet', card: 'Kartu', insurance: 'Asuransi/BPJS', gateway: 'Payment gateway' })[m] || m || '-';
export const payerLabel = (p) => ({ umum: 'Umum / Pribadi', bpjs: 'BPJS Kesehatan', asuransi: 'Asuransi', korporat: 'Korporat' })[p] || p || 'Umum';

// ------------------------------------------------------------------ RECEIPT (KWITANSI)
export function receiptPdf({ pay, inv, patient, branch, settings, cashier }) {
  const doc = new PDF({ title: `Kwitansi ${pay.payment_no}`, width: 595.28, height: 420 });
  const p = doc.addPage(595.28, 420);
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'KWITANSI', [['No.', pay.payment_no], ['Tanggal', fmtDate(pay.date)], ['Invoice', inv?.invoice_no || '-']]);
  const row = (label, value, bold) => {
    p.text(M, y, label, { size: 9, color: C.muted });
    p.text(M + 120, y, ':', { size: 9, color: C.muted });
    y = p.para(M + 130, y, value, p.w - 2 * M - 130, { size: 10, bold, color: C.ink, lineHeight: 13 }) + 6;
  };
  row('Telah terima dari', patient?.name || inv?.customer_name || '-', true);
  row('Uang sejumlah', terbilang(pay.amount), true);
  row('Untuk pembayaran', `${inv?.invoice_no || ''} — ${(inv?.items || []).slice(0, 4).map((i) => i.name).join(', ')}${(inv?.items || []).length > 4 ? ', dll.' : ''}`);
  row('Metode', `${methodLabel(pay.method)}${pay.reference ? ' · Ref ' + pay.reference : ''}`);
  y += 8;
  p.rect(M, y, 220, 40, { fill: C.teal, radius: 8 });
  p.text(M + 16, y + 26, money(pay.amount), { size: 18, bold: true, color: '#FFFFFF' });
  const sx = p.w - M - 170;
  p.text(sx, y + 4, `${branch?.city || ''}${branch?.city ? ', ' : ''}${fmtDate(pay.date)}`, { size: 9, color: C.ink });
  p.text(sx, y + 18, 'Kasir,', { size: 9, color: C.muted });
  p.line(sx, y + 62, sx + 150, y + 62, { color: C.ink, width: 0.6 });
  p.text(sx, y + 74, cashier || pay.confirmed_by || 'Kasir', { size: 9, bold: true, color: C.ink });
  if (pay.status === 'confirmed') stamp(p, M + 238, y - 18, 'LUNAS', C.green, 28);
  return finish(doc);
}

// ------------------------------------------------------------------ LAB RESULT
export function labPdf({ order, patient, doctor, branch, settings }) {
  const doc = new PDF({ title: `Hasil Lab ${order.lab_no}` });
  const ref = { p: doc.addPage(...A4) };
  const p = ref.p;
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'HASIL LABORATORIUM', [['No. Lab', order.lab_no], ['Tanggal', fmtDate(order.date)], ['Status', order.status === 'validated' ? 'Tervalidasi' : order.status === 'completed' ? 'Selesai' : 'Proses']]);
  p.rect(M, y, p.w - 2 * M, 60, { fill: C.soft, radius: 8 });
  labelValue(p, M + 14, y + 14, 'Nama pasien', patient?.name, 170);
  labelValue(p, M + 200, y + 14, 'No. RM', patient?.mrn, 100);
  labelValue(p, M + 320, y + 14, 'Umur / JK', `${age(patient?.birth_date)} th / ${patient?.gender === 'P' ? 'Perempuan' : patient?.gender === 'L' ? 'Laki-laki' : '-'}`, 90);
  labelValue(p, M + 420, y + 14, 'Dokter pengirim', doctor?.name || '-', 95);
  y += 78;
  const tests = order.tests || [];
  y = table(doc, ref, M, y, [
    { label: 'PEMERIKSAAN', w: 190, wrap: true, get: (r) => r.name },
    { label: 'HASIL', w: 80, align: 'center', bold: true, get: (r) => r.result || '-', style: (r) => ({ color: r.flag === 'H' ? C.red : r.flag === 'L' ? C.blue : r.flag === 'A' ? C.red : C.ink }) },
    { label: 'FLAG', w: 45, align: 'center', get: (r) => r.flag || '', style: (r) => ({ color: C.red, bold: true }) },
    { label: 'SATUAN', w: 70, align: 'center', get: (r) => r.unit || '' },
    { label: 'NILAI RUJUKAN', w: 130.28, align: 'center', get: (r) => r.ref || '' },
  ], tests);
  let q = ref.p;
  y += 18;
  if (order.notes) y = q.para(M, y, 'Catatan: ' + order.notes, q.w - 2 * M, { size: 8.5, color: C.muted }) + 8;
  q.text(M, y, 'H = di atas nilai rujukan · L = di bawah nilai rujukan · A = abnormal', { size: 7.5, color: C.muted });
  const sx = q.w - M - 170;
  q.text(sx, y + 20, 'Divalidasi oleh,', { size: 9, color: C.muted });
  q.line(sx, y + 64, sx + 150, y + 64, { color: C.ink, width: 0.6 });
  q.text(sx, y + 76, order.validated_by || 'Penanggung jawab lab', { size: 9, bold: true, color: C.ink });
  if (order.result_at) q.text(sx, y + 88, fmtDateTime(order.result_at), { size: 7.5, color: C.muted });
  return finish(doc);
}

// ------------------------------------------------------------------ PRESCRIPTION
export function prescriptionPdf({ rx, patient, doctor, branch, settings }) {
  const doc = new PDF({ title: `Resep ${rx.rx_no}`, width: 420, height: 595.28 });
  const p = doc.addPage(420, 595.28);
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'RESEP', [['No.', rx.rx_no], ['Tanggal', fmtDate(rx.date)]]);
  labelValue(p, M, y, 'Pasien', `${patient?.name || '-'}${patient?.mrn ? '  (' + patient.mrn + ')' : ''}`, 220);
  labelValue(p, M + 250, y, 'Umur', `${age(patient?.birth_date)} th`, 80);
  y += 32;
  if (patient?.allergies) {
    p.rect(M, y, p.w - 2 * M, 20, { fill: '#FEF2F2', radius: 4 });
    p.text(M + 8, y + 13, `Alergi: ${patient.allergies}`, { size: 8.5, bold: true, color: C.red, maxWidth: p.w - 2 * M - 16 });
    y += 30;
  }
  for (const it of rx.items || []) {
    p.text(M, y + 4, 'R/', { size: 14, bold: true, color: C.teal });
    p.text(M + 28, y, `${it.name || ''}`, { size: 10.5, bold: true, color: C.ink, maxWidth: p.w - 2 * M - 90 });
    p.text(p.w - M, y, `No. ${fmtNum(it.qty)} ${it.unit || ''}`, { size: 9.5, bold: true, color: C.ink, align: 'right' });
    y = p.para(M + 28, y + 14, `S. ${it.dose || '-'}`, p.w - 2 * M - 30, { size: 9, color: C.muted, lineHeight: 12 }) + 10;
    p.line(M + 28, y - 4, p.w - M, y - 4, { color: C.line, dash: true });
    if (y > p.h - 150) break;
  }
  if (rx.notes) y = p.para(M, y + 4, 'Catatan: ' + rx.notes, p.w - 2 * M, { size: 8.5, color: C.muted }) + 6;
  const sx = p.w - M - 160;
  y = Math.max(y + 10, p.h - 150);
  p.text(sx, y, 'Dokter,', { size: 9, color: C.muted });
  p.line(sx, y + 44, sx + 160, y + 44, { color: C.ink, width: 0.6 });
  p.text(sx, y + 56, doctor?.name || '-', { size: 9, bold: true, color: C.ink, maxWidth: 160 });
  if (doctor?.sip_no) p.text(sx, y + 68, `SIP: ${doctor.sip_no}`, { size: 7.5, color: C.muted });
  p.qr(M, y - 6, 70, `RX:${rx.rx_no}`);
  return finish(doc, 'Resep elektronik Global Klinik. Verifikasi keaslian dengan memindai kode QR.');
}

// ------------------------------------------------------------------ PATIENT CARD (CR80)
export function patientCardPdf({ patient, settings, siteUrl }) {
  const W = 242.65, H = 153.07;
  const doc = new PDF({ title: `Kartu Pasien ${patient.mrn}`, width: W, height: H });
  const p = doc.addPage(W, H);
  p.rect(0, 0, W, H, { fill: C.navy });
  p.rect(0, H - 34, W, 34, { fill: C.teal });
  p.rect(0, H - 36, W, 2, { fill: C.gold });
  drawLogo(p, 14, 12, 26);
  p.text(46, 24, settings.clinic_name || 'Global Klinik', { size: 10, bold: true, color: '#FFFFFF' });
  p.text(46, 34, 'KARTU PASIEN', { size: 6.5, bold: true, color: '#E7C98A' });
  p.text(14, 62, patient.name, { size: 11, bold: true, color: '#FFFFFF', maxWidth: 150 });
  p.text(14, 76, `Lahir: ${fmtDate(patient.birth_date) || '-'}`, { size: 7, color: '#CBD5E1' });
  p.text(14, 86, `${patient.gender === 'P' ? 'Perempuan' : patient.gender === 'L' ? 'Laki-laki' : ''}${patient.blood_type ? ' · Gol. darah ' + patient.blood_type : ''}`, { size: 7, color: '#CBD5E1' });
  p.text(14, H - 20, 'No. Rekam Medis', { size: 6, color: '#D1FAE5' });
  p.text(14, H - 8, patient.mrn || '-', { size: 12, bold: true, color: '#FFFFFF' });
  p.qr(W - 78, 44, 66, `${siteUrl || ''}/app/#/portal?mrn=${patient.mrn}`);
  // back side
  const b = doc.addPage(W, H);
  b.rect(0, 0, W, H, { fill: '#FFFFFF' });
  b.rect(0, 0, W, 6, { fill: C.teal });
  b.text(14, 26, 'Bawa kartu ini setiap berkunjung.', { size: 8, bold: true, color: C.navy });
  b.para(14, 40, 'Tunjukkan QR di kartu untuk check-in cepat di meja pendaftaran. Kartu ini bukan kartu asuransi.', W - 28, { size: 7, color: C.muted, lineHeight: 9.5 });
  b.text(14, 84, settings.phone || '', { size: 7.5, bold: true, color: C.ink });
  b.text(14, 95, settings.email || '', { size: 7.5, color: C.ink });
  b.text(14, 106, (siteUrl || '').replace(/^https?:\/\//, ''), { size: 7.5, color: C.teal, bold: true });
  b.text(14, H - 14, 'Darurat: ' + (settings.emergency || '119'), { size: 7, bold: true, color: C.red });
  return doc.toBytes();
}

// ------------------------------------------------------------------ VISIT SLIP / QUEUE TICKET
export function visitSlipPdf({ visit, patient, poli, doctor, branch, settings, siteUrl }) {
  const W = 298, H = 420;
  const doc = new PDF({ title: `Bukti Pendaftaran ${visit.visit_no}`, width: W, height: H });
  const p = doc.addPage(W, H);
  p.rect(0, 0, W, 6, { fill: C.teal });
  drawLogo(p, W / 2 - 16, 20, 32);
  p.text(W / 2, 70, settings.clinic_name || 'Global Klinik', { size: 12, bold: true, color: C.navy, align: 'center' });
  p.text(W / 2, 82, branch?.name || '', { size: 8, color: C.muted, align: 'center' });
  p.text(W / 2, 108, 'BUKTI PENDAFTARAN', { size: 9, bold: true, color: C.teal, align: 'center' });
  p.rect(40, 118, W - 80, 86, { fill: C.soft, radius: 10 });
  p.text(W / 2, 136, 'NOMOR ANTRIAN', { size: 7.5, color: C.muted, align: 'center' });
  p.text(W / 2, 182, visit.queue_no || '-', { size: 44, bold: true, color: C.navy, align: 'center' });
  p.text(W / 2, 198, tr(poli?.name) || '', { size: 9, bold: true, color: C.teal, align: 'center' });
  let y = 226;
  const row = (k, v) => {
    p.text(34, y, k, { size: 8, color: C.muted });
    p.text(W - 34, y, v || '-', { size: 8.5, bold: true, color: C.ink, align: 'right', maxWidth: 150 });
    y += 15;
  };
  row('Pasien', patient?.name);
  row('No. RM', patient?.mrn);
  row('Dokter', doctor?.name);
  row('Tanggal', fmtDate(visit.date));
  row('No. kunjungan', visit.visit_no);
  p.qr(W / 2 - 40, y + 2, 80, visit.visit_no);
  p.text(W / 2, y + 96, `Pantau antrian: ${(siteUrl || '').replace(/^https?:\/\//, '')}/antrian`, { size: 7, color: C.muted, align: 'center' });
  return doc.toBytes();
}

// ------------------------------------------------------------------ BOOKING SLIP
export function bookingPdf({ appt, poli, doctor, service, branch, settings, siteUrl }) {
  const doc = new PDF({ title: `Booking ${appt.booking_no}` });
  const p = doc.addPage(...A4);
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'BUKTI BOOKING', [['No. Booking', appt.booking_no], ['Dibuat', fmtDate(String(appt.created_at || '').slice(0, 10))]]);
  p.rect(M, y, p.w - 2 * M, 150, { fill: C.soft, radius: 12 });
  p.text(M + 20, y + 26, 'JADWAL ANDA', { size: 8, bold: true, color: C.teal });
  p.text(M + 20, y + 54, `${fmtDate(appt.date)} · ${appt.time} WIB`, { size: 20, bold: true, color: C.navy });
  p.text(M + 20, y + 76, `${doctor?.name || 'Dokter jaga'} — ${tr(poli?.name) || ''}`, { size: 11, color: C.ink, maxWidth: 330 });
  p.text(M + 20, y + 94, tr(service?.name) || '', { size: 9.5, color: C.muted, maxWidth: 330 });
  p.text(M + 20, y + 118, appt.type === 'telemedicine' ? 'Telemedicine (video call)' : `${branch?.name || ''}`, { size: 9.5, bold: true, color: C.tealDark, maxWidth: 330 });
  p.text(M + 20, y + 132, appt.type === 'telemedicine' ? appt.meet_url || '' : branch?.address || '', { size: 8, color: C.muted, maxWidth: 330 });
  p.qr(p.w - M - 130, y + 10, 120, `${siteUrl}/cek-booking?no=${appt.booking_no}`);
  y += 174;
  labelValue(p, M, y, 'Nama pasien', appt.name, 220);
  labelValue(p, M + 250, y, 'No. HP', appt.phone, 200);
  y += 40;
  labelValue(p, M, y, 'Status', ({ pending: 'Menunggu konfirmasi', confirmed: 'Terkonfirmasi', waitlist: 'Daftar tunggu', cancelled: 'Dibatalkan', checked_in: 'Sudah check-in', completed: 'Selesai' })[appt.status] || appt.status, 220);
  labelValue(p, M + 250, y, 'Keluhan', appt.complaint || '-', 250);
  y += 50;
  p.rect(M, y, p.w - 2 * M, 84, { fill: C.mint, radius: 10 });
  p.text(M + 16, y + 20, 'Petunjuk', { size: 9, bold: true, color: C.tealDark });
  p.para(M + 16, y + 36, 'Datang 15 menit sebelum jadwal dan tunjukkan QR ini untuk check-in. Reschedule atau pembatalan dapat dilakukan melalui menu Cek Booking dengan nomor booking dan nomor HP Anda.', p.w - 2 * M - 32, { size: 8.5, color: C.ink });
  return finish(doc);
}

// ------------------------------------------------------------------ MEDICAL SUMMARY
export function recordPdf({ visit, record, patient, doctor, poli, branch, settings, rx, labs }) {
  const doc = new PDF({ title: `Resume Medis ${visit.visit_no}` });
  const ref = { p: doc.addPage(...A4) };
  let p = ref.p;
  const info = clinicInfo(settings, branch);
  let y = header(p, info, 'RESUME MEDIS', [['No. Kunjungan', visit.visit_no], ['Tanggal', fmtDate(visit.date)]]);
  p.rect(M, y, p.w - 2 * M, 60, { fill: C.soft, radius: 8 });
  labelValue(p, M + 14, y + 14, 'Pasien', patient?.name, 160);
  labelValue(p, M + 190, y + 14, 'No. RM', patient?.mrn, 90);
  labelValue(p, M + 290, y + 14, 'Umur / JK', `${age(patient?.birth_date)} th / ${patient?.gender || '-'}`, 80);
  labelValue(p, M + 380, y + 14, 'Dokter / Poli', `${doctor?.name || '-'}`, 130);
  y += 76;
  const v = record?.vitals || {};
  const vit = [['TD', v.bp ? v.bp + ' mmHg' : '-'], ['Nadi', v.hr ? v.hr + ' x/m' : '-'], ['RR', v.rr ? v.rr + ' x/m' : '-'], ['Suhu', v.temp ? v.temp + ' °C' : '-'], ['SpO2', v.spo2 ? v.spo2 + ' %' : '-'], ['BB/TB', `${v.weight || '-'} kg / ${v.height || '-'} cm`]];
  const cw = (p.w - 2 * M) / vit.length;
  vit.forEach(([k, val], i) => {
    p.rect(M + i * cw + 2, y, cw - 4, 38, { stroke: C.line, radius: 6 });
    p.text(M + i * cw + cw / 2, y + 14, k, { size: 7, color: C.muted, align: 'center' });
    p.text(M + i * cw + cw / 2, y + 29, val, { size: 9, bold: true, color: C.ink, align: 'center' });
  });
  y += 54;
  const section = (title, text) => {
    if (!text) return;
    if (y > p.h - 120) {
      p = ref.p = doc.addPage(...A4);
      y = 50;
    }
    p.text(M, y, title, { size: 8.5, bold: true, color: C.teal });
    y = p.para(M, y + 13, text, p.w - 2 * M, { size: 9, color: C.ink, lineHeight: 12.5 }) + 8;
  };
  section('ANAMNESIS / SUBJEKTIF', [record?.anamnesis, record?.subjective].filter(Boolean).join('\n'));
  section('PEMERIKSAAN FISIK / OBJEKTIF', [record?.physical_exam, record?.objective].filter(Boolean).join('\n'));
  section('DIAGNOSIS', (record?.diagnoses || []).map((d) => `${d.code ? d.code + ' — ' : ''}${d.name}${d.primary ? ' (utama)' : ''}`).join('\n') || record?.assessment);
  section('ASESMEN', (record?.diagnoses || []).length ? record?.assessment : '');
  section('TINDAKAN', (record?.procedures || []).map((d) => `${d.name}${d.qty > 1 ? ' x' + d.qty : ''}`).join('\n'));
  section('RENCANA / TERAPI', [record?.plan, record?.therapy].filter(Boolean).join('\n'));
  section('RESEP', (rx || []).flatMap((r) => (r.items || []).map((i) => `${i.name} — ${fmtNum(i.qty)} ${i.unit || ''} — ${i.dose || ''}`)).join('\n'));
  section('HASIL LAB', (labs || []).flatMap((l) => (l.tests || []).map((t) => `${t.name}: ${t.result || '-'} ${t.unit || ''} ${t.flag ? '(' + t.flag + ')' : ''}`)).join('\n'));
  section('CATATAN DOKTER', record?.notes);
  if (y > p.h - 120) {
    p = ref.p = doc.addPage(...A4);
    y = 50;
  }
  const sx = p.w - M - 170;
  p.text(sx, y + 10, 'Dokter pemeriksa,', { size: 9, color: C.muted });
  p.line(sx, y + 54, sx + 160, y + 54, { color: C.ink, width: 0.6 });
  p.text(sx, y + 66, doctor?.name || '-', { size: 9, bold: true, color: C.ink, maxWidth: 160 });
  return finish(doc, 'Dokumen rahasia medis. Hanya untuk pasien yang bersangkutan dan tenaga kesehatan yang berwenang.');
}

// ------------------------------------------------------------------ GENERIC TABLE REPORT
export function reportPdf({ title, subtitle, columns, rows, totals, settings }) {
  const W = 841.89, H = 595.28;
  const doc = new PDF({ title, width: W, height: H });
  const ref = { p: doc.addPage(W, H) };
  const p = ref.p;
  const info = clinicInfo(settings, null);
  let y = header(p, info, 'LAPORAN', [['Dicetak', fmtDateTime(new Date().toISOString())]]);
  p.text(M, y + 4, title, { size: 14, bold: true, color: C.navy });
  if (subtitle) p.text(M, y + 20, subtitle, { size: 9, color: C.muted });
  y += 34;
  const avail = W - 2 * M;
  const weights = columns.map((c) => c.weight || (c.type === 'money' ? 1.2 : c.type === 'number' ? 0.8 : 1.6));
  const sum = weights.reduce((a, b) => a + b, 0);
  const cols = columns.map((c, i) => ({
    label: String(c.label).toUpperCase(),
    w: (avail * weights[i]) / sum,
    align: c.type === 'money' || c.type === 'number' ? 'right' : 'left',
    get: (r) => (c.type === 'money' ? money(r[c.key]) : r[c.key] ?? ''),
  }));
  y = table(doc, ref, M, y, cols, rows.slice(0, 3000), { size: 8 });
  if (totals) {
    const q = ref.p;
    y += 10;
    let tx = M;
    cols.forEach((c, i) => {
      const k = columns[i].key;
      if (totals[k] !== undefined) q.text(c.align === 'right' ? tx + c.w - 6 : tx + 6, y, columns[i].type === 'money' ? money(totals[k]) : String(totals[k]), { size: 8.5, bold: true, align: c.align, color: C.navy });
      tx += c.w;
    });
  }
  return finish(doc);
}

export { textWidth };
