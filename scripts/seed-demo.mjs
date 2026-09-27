// Generates seed/demo.sql — realistic demo data (patients, medicines & stock, 14 days of visits, invoices,
// payments, today's queue, upcoming bookings) so dashboards and reports look alive for a showcase.
// Usage: node scripts/seed-demo.mjs   → then apply with wrangler d1 execute (local or --remote).
import { writeFileSync } from 'node:fs';

let seed = 20260927;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const J = (o) => q(JSON.stringify(o));
const out = [];
const ins = (t, o) => out.push(`INSERT INTO ${t} (${Object.keys(o).join(',')}) VALUES (${Object.values(o).map(q).join(',')});`);

const WIB = 7 * 3600e3;
const today = new Date(Date.now() + WIB).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ts = (d, hm) => new Date(new Date(`${d}T${hm}:00Z`).getTime() - WIB).toISOString().slice(0, 19) + 'Z';
const counters = {};
const bump = (k, n = 1) => (counters[k] = (counters[k] || 0) + n);
const stat = (d, br, m, v) => bump(`stat:${d}:${br}:${m}`, Math.round(v));

const BR = { jkt: 'JKT', bdg: 'BDG', sby: 'SBY' };
const DOCS = {
  jkt: [['dr-andini', 'umum', 150000], ['dr-rizky', 'gigi', 250000], ['dr-sekar', 'anak', 250000], ['dr-hendra', 'dalam', 300000], ['dr-maya', 'kia', 350000], ['dr-nadia', 'kulit', 300000]],
  bdg: [['dr-bayu', 'umum', 125000], ['dr-rizky', 'gigi', 250000], ['dr-sekar', 'anak', 250000]],
  sby: [['dr-larasati', 'umum', 125000], ['dr-hendra', 'dalam', 300000], ['dr-maya', 'kia', 350000]],
};
const POLI_CODE = { umum: 'A', gigi: 'B', anak: 'C', kia: 'D', dalam: 'E', kulit: 'F' };
const DX = {
  umum: [['J06.9', 'Infeksi saluran pernapasan atas akut (ISPA)'], ['A09', 'Diare dan gastroenteritis infeksi'], ['K29.7', 'Gastritis'], ['R50.9', 'Demam'], ['J02.9', 'Faringitis akut'], ['M79.1', 'Mialgia'], ['G44.2', 'Sakit kepala tipe tegang (tension headache)'], ['Z00.0', 'Pemeriksaan kesehatan umum (medical check-up)']],
  gigi: [['K02.9', 'Karies gigi'], ['K04.0', 'Pulpitis'], ['K03.6', 'Deposit pada gigi (karang gigi)'], ['K05.1', 'Gingivitis kronis']],
  anak: [['J06.9', 'Infeksi saluran pernapasan atas akut (ISPA)'], ['Z23', 'Imunisasi'], ['A09', 'Diare dan gastroenteritis infeksi'], ['Z00.1', 'Pemeriksaan kesehatan rutin anak']],
  kia: [['Z34.9', 'Pengawasan kehamilan normal (ANC)'], ['O21.0', 'Hiperemesis gravidarum ringan'], ['N94.6', 'Dismenore']],
  dalam: [['I10', 'Hipertensi esensial (primer)'], ['E11.9', 'Diabetes melitus tipe 2 tanpa komplikasi'], ['E78.5', 'Hiperlipidemia / dislipidemia'], ['M10.9', 'Gout (asam urat)']],
  kulit: [['L70.0', 'Akne vulgaris'], ['L20.9', 'Dermatitis atopik'], ['B35.4', 'Tinea korporis'], ['L50.9', 'Urtikaria']],
};
const PROC = { gigi: [['pr-scaling', 'Scaling & polishing', 350000], ['pr-tambal', 'Tambal komposit', 400000], ['pr-cabut', 'Cabut gigi permanen', 450000]], umum: [['pr-nebu', 'Nebulizer', 85000], ['pr-luka', 'Perawatan luka / ganti balutan', 75000]], kia: [['pr-usg', 'USG kehamilan 2D', 250000]], anak: [['pr-imun', 'Imunisasi (jasa, belum termasuk vaksin)', 100000]], kulit: [['pr-peeling', 'Chemical peeling', 550000]], dalam: [['pr-ekg', 'Elektrokardiografi (EKG)', 150000]] };

// ---------------------------------------------------------------- master: suppliers, coupons, corporates
[['PT Kimia Farma Trading & Distribution', 'Bpk. Hendro', '021-4211111'], ['PT Anugrah Argon Medica', 'Ibu Lestari', '021-5301234'], ['PT Enseval Putera Megatrading', 'Bpk. Rudi', '021-4600123']].forEach(([name, contact, phone], i) =>
  ins('suppliers', { id: i + 1, name, contact, phone, email: `order${i + 1}@supplier.example`, address: 'Jakarta', terms: 'NET 30', active: 1, created_at: ts(today, '08:00'), updated_at: ts(today, '08:00') }));
[['SEHAT25', 'Diskon 25% Medical Check-up', 'percent', 25, 0], ['GIGI249', 'Scaling hemat', 'fixed', 101000, 300000], ['TELEFREE', 'Telemedicine pertama gratis', 'fixed', 100000, 0]].forEach(([code, description, type, value, min], i) =>
  ins('coupons', { id: i + 1, code, description, type, value, min_amount: min, max_uses: 0, used: int(3, 20), start_date: '2026-01-01', end_date: '2027-12-31', active: 1, created_at: ts(today, '08:00'), updated_at: ts(today, '08:00') }));
[['PT Nusantara Digital', 'Andi Wijaya', 10], ['PT Samudra Logistik', 'Maria Tan', 7]].forEach(([name, contact, d], i) =>
  ins('corporates', { id: i + 1, name, contact, phone: '021-5550' + (i + 1), email: `hr@corp${i + 1}.example`, address: 'Jakarta', discount_pct: d, contract_until: '2027-06-30', active: 1, created_at: ts(today, '08:00'), updated_at: ts(today, '08:00') }));

// ---------------------------------------------------------------- medicines + stock
const MEDS = [
  ['Paracetamol', 'Paracetamol', 'cat-analgesik', 'Tablet', '500 mg', 'u-tablet', 250, 1500, 40], ['Ibuprofen', 'Ibuprofen', 'cat-analgesik', 'Tablet', '400 mg', 'u-tablet', 400, 2000, 30], ['Asam Mefenamat', 'Mefenamic acid', 'cat-analgesik', 'Kaplet', '500 mg', 'u-tablet', 450, 2500, 30],
  ['Amoxicillin', 'Amoxicillin', 'cat-antibiotik', 'Kapsul', '500 mg', 'u-kapsul', 600, 3000, 40], ['Cefadroxil', 'Cefadroxil', 'cat-antibiotik', 'Kapsul', '500 mg', 'u-kapsul', 1500, 5000, 20], ['Azithromycin', 'Azithromycin', 'cat-antibiotik', 'Tablet', '500 mg', 'u-tablet', 5000, 12000, 15],
  ['Cetirizine', 'Cetirizine', 'cat-antihistamin', 'Tablet', '10 mg', 'u-tablet', 300, 2000, 30], ['Loratadine', 'Loratadine', 'cat-antihistamin', 'Tablet', '10 mg', 'u-tablet', 500, 2500, 20],
  ['Omeprazole', 'Omeprazole', 'cat-gastro', 'Kapsul', '20 mg', 'u-kapsul', 700, 3500, 30], ['Antasida Doen', 'Aluminium hidroksida', 'cat-gastro', 'Tablet kunyah', '', 'u-tablet', 150, 1000, 50], ['Domperidone', 'Domperidone', 'cat-gastro', 'Tablet', '10 mg', 'u-tablet', 350, 2000, 20], ['Oralit', 'Oral rehydration salts', 'cat-gastro', 'Serbuk', '200 ml', 'u-sachet', 800, 2500, 40],
  ['Amlodipine', 'Amlodipine', 'cat-kardio', 'Tablet', '5 mg', 'u-tablet', 250, 2000, 50], ['Captopril', 'Captopril', 'cat-kardio', 'Tablet', '25 mg', 'u-tablet', 150, 1000, 30],
  ['Metformin', 'Metformin', 'cat-diabetes', 'Tablet', '500 mg', 'u-tablet', 200, 1500, 50], ['Glimepiride', 'Glimepiride', 'cat-diabetes', 'Tablet', '2 mg', 'u-tablet', 900, 3500, 20],
  ['Vitamin C', 'Ascorbic acid', 'cat-vitamin', 'Tablet', '500 mg', 'u-tablet', 300, 1500, 50], ['Vitamin B Kompleks', 'Vitamin B complex', 'cat-vitamin', 'Tablet', '', 'u-tablet', 150, 1000, 50],
  ['Salep Hidrokortison', 'Hydrocortisone', 'cat-topikal', 'Krim', '1% 10 g', 'u-tube', 6000, 15000, 10], ['Ambroxol Sirup', 'Ambroxol', 'cat-analgesik', 'Sirup', '15 mg/5 ml 60 ml', 'u-botol', 7000, 18000, 10],
];
let batchId = 0;
MEDS.forEach(([name, generic, cat, form, strength, unit, buy, sell, min], i) => {
  const id = i + 1;
  ins('medicines', { id, code: 'OBT-' + String(id).padStart(5, '0'), name, generic_name: generic, category: cat, form, strength, unit, manufacturer: pick(['Kimia Farma', 'Kalbe', 'Sanbe', 'Dexa Medica', 'Hexpharm']), price_buy: buy, price_sell: sell, min_stock: min, requires_rx: cat === 'cat-antibiotik' ? 1 : 0, is_active: 1, created_at: ts(today, '07:00'), updated_at: ts(today, '07:00') });
  for (const br of Object.keys(BR)) {
    const nb = br === 'jkt' ? 2 : 1;
    for (let b = 0; b < nb; b++) {
      let qty = int(br === 'jkt' ? 120 : 40, br === 'jkt' ? 400 : 160);
      let exp = addDays(today, int(200, 720));
      if (i === 2 && br === 'jkt' && b === 0) exp = addDays(today, 45); // near expiry demo
      if (i === 5 && br === 'jkt') qty = int(4, 9); // low stock demo
      if (i === 18 && br === 'bdg') { exp = addDays(today, -10); qty = 6; } // expired demo
      batchId++;
      ins('stock_batches', { id: batchId, medicine_id: id, branch_id: br, batch_no: `${BR[br]}${String(id).padStart(2, '0')}${String.fromCharCode(65 + b)}${int(100, 999)}`, expired_at: exp, qty, cost: buy, supplier_id: int(1, 3), created_at: ts(addDays(today, -20), '09:00'), updated_at: ts(addDays(today, -20), '09:00') });
      ins('stock_moves', { date: addDays(today, -20), medicine_id: id, branch_id: br, batch_id: batchId, type: 'in', qty, balance: qty, ref: 'STOK-AWAL', note: 'Saldo awal', user_name: 'Sistem', created_at: ts(addDays(today, -20), '09:00'), updated_at: ts(addDays(today, -20), '09:00') });
    }
  }
});
counters.medicine = MEDS.length;

// ---------------------------------------------------------------- patients
const FIRST = ['Budi', 'Siti', 'Agus', 'Dewi', 'Rizal', 'Putri', 'Hendra', 'Lestari', 'Fajar', 'Anisa', 'Yoga', 'Maya', 'Rudi', 'Intan', 'Bayu', 'Citra', 'Dimas', 'Rina', 'Eko', 'Nurul', 'Galih', 'Wulan', 'Arif', 'Sari'];
const LAST = ['Santoso', 'Rahmawati', 'Wijaya', 'Kusuma', 'Pratama', 'Hidayat', 'Saputra', 'Permata', 'Nugroho', 'Maharani', 'Setiawan', 'Anggraini', 'Gunawan', 'Lestari', 'Firmansyah', 'Utami'];
const CITY = { jkt: 'Jakarta Selatan', bdg: 'Bandung', sby: 'Surabaya' };
const patients = [];
const NP = 64;
for (let i = 1; i <= NP; i++) {
  const br = i <= 36 ? 'jkt' : i <= 50 ? 'bdg' : 'sby';
  const first = i === 1 ? 'Budi' : pick(FIRST);
  const last = i === 1 ? 'Santoso' : pick(LAST);
  const gender = i === 1 ? 'L' : ['Siti', 'Dewi', 'Putri', 'Lestari', 'Anisa', 'Maya', 'Intan', 'Citra', 'Rina', 'Nurul', 'Wulan', 'Sari'].includes(first) ? 'P' : 'L';
  const regDay = addDays(today, -int(0, 13));
  const p = {
    id: i, mrn: 'RM-' + String(i).padStart(6, '0'), name: `${first} ${last}`, nik: `3174${String(int(10, 99))}${String(int(100000, 999999))}${String(int(1000, 9999))}`, gender,
    birth_date: `${int(1956, 2021)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`, birth_place: CITY[br].split(' ')[0],
    phone: i === 1 ? '081234567890' : `08${int(11, 59)}${int(1000000, 9999999)}`, email: i === 1 ? 'budi.santoso@example.com' : null, address: `Jl. ${pick(['Melati', 'Mawar', 'Kenanga', 'Anggrek', 'Cempaka', 'Dahlia'])} No. ${int(1, 120)}`, city: CITY[br],
    blood_type: pick(['A', 'B', 'AB', 'O']), allergies: i === 1 ? 'Amoksisilin' : rnd() < 0.12 ? pick(['Seafood', 'Debu', 'Sulfa', 'Penisilin']) : null,
    payer_type: rnd() < 0.2 ? 'bpjs' : rnd() < 0.15 ? 'asuransi' : 'umum', bpjs_no: null, insurer_id: null, member_tier: 'tier-silver', points: int(0, 180), referral_code: 'R' + String(1000 + i * 7).slice(-4) + pick(['A', 'K', 'M', 'Q']) + pick(['X', 'Z', 'P']),
    branch_id: br, created_at: ts(regDay, `${String(int(8, 16)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`),
  };
  if (p.payer_type === 'bpjs') { p.bpjs_no = '000' + int(1000000000, 9999999999); p.insurer_id = 'ins-bpjs'; }
  if (p.payer_type === 'asuransi') { p.insurer_id = pick(['ins-mitra', 'ins-nusa']); p.insurance_no = 'POL-' + int(100000, 999999); }
  if (p.points >= 100) p.member_tier = p.points >= 300 ? 'tier-platinum' : 'tier-gold';
  if (i === 1) { p.points = 145; p.member_tier = 'tier-gold'; p.payer_type = 'umum'; p.insurer_id = null; p.bpjs_no = null; }
  p.updated_at = p.created_at;
  patients.push(p);
  ins('patients', p);
  stat(regDay, br, 'new_patients', 1);
}
counters.mrn = NP;

// ---------------------------------------------------------------- visits over last 14 days (+ today)
let vid = 0, rid = 0, rxid = 0, labid = 0, invid = 0, payid = 0;
const seqCounter = (k) => bump(k);
const mk = (kind, bc, d) => {
  const [y, m] = d.split('-');
  const k = { inv: `inv:${bc}:${y}${m}`, pay: `pay:${bc}:${y}${m}`, rx: `rx:${bc}:${y}${m}`, lab: `lab:${bc}:${y}${m}` }[kind];
  const n = seqCounter(k);
  return kind === 'inv' ? `INV/${bc}/${y}/${m}/${String(n).padStart(5, '0')}` : `${kind.toUpperCase()}-${bc}-${y.slice(2)}${m}-${String(n).padStart(5, '0')}`;
};
const METHODS = ['cash', 'cash', 'cash', 'qris', 'qris', 'transfer', 'card', 'ewallet'];

function visit({ d, br, p, doc, poli, fee, time, qstatus, status, finalize, pay, rxNew, labReq }) {
  vid++;
  const bc = BR[br];
  const seq = seqCounter(`q:${br}:${poli}:${d}`);
  const vseq = seqCounter(`visit:${bc}:${d}`);
  const created = ts(d, time);
  const v = { id: vid, visit_no: `KJ-${bc}-${d.slice(2).replace(/-/g, '')}-${String(vseq).padStart(3, '0')}`, queue_no: `${POLI_CODE[poli]}-${String(seq).padStart(3, '0')}`, queue_seq: seq, date: d, patient_id: p.id, branch_id: br, poli_id: poli, doctor_id: doc, queue_status: qstatus, status, payer_type: p.payer_type, insurer_id: p.insurer_id, complaint: pick(['Demam 2 hari', 'Batuk pilek', 'Kontrol rutin', 'Sakit gigi', 'Nyeri ulu hati', 'Pusing', 'Gatal-gatal', 'Periksa kehamilan', 'Imunisasi anak', 'Kontrol gula darah']), called_at: qstatus !== 'waiting' ? created : null, finished_at: finalize ? ts(d, time.slice(0, 3) + '45') : null, created_at: created, updated_at: created };
  ins('visits', v);
  stat(d, br, 'visits', 1);
  if (!finalize && !['called', 'serving', 'triage'].includes(status) && qstatus === 'waiting') return v;
  const vitals = { bp: `${int(105, 150)}/${int(65, 95)}`, hr: int(68, 102), rr: int(16, 22), temp: +(36 + rnd() * 2.2).toFixed(1), spo2: int(95, 99), weight: int(12, 92), height: int(95, 182) };
  const dx = [pick(DX[poli])];
  const procs = rnd() < (poli === 'gigi' ? 0.9 : 0.35) && PROC[poli] ? [pick(PROC[poli])].map(([pid, name, price]) => ({ procedure_id: pid, name, qty: 1, price, by: 'Dokter' })) : [];
  rid++;
  ins('medical_records', { id: rid, visit_id: v.id, patient_id: p.id, doctor_id: doc, branch_id: br, date: d, vitals: JSON.stringify(vitals), anamnesis: v.complaint, subjective: v.complaint + ', keluhan dirasakan sejak beberapa hari.', physical_exam: 'Keadaan umum baik, kesadaran compos mentis.', objective: `TD ${vitals.bp}, N ${vitals.hr}x/m, S ${vitals.temp}°C`, assessment: dx[0][1], plan: 'Terapi simptomatik, edukasi, kontrol bila keluhan menetap.', diagnoses: JSON.stringify(dx.map(([code, name]) => ({ code, name, primary: true }))), procedures: JSON.stringify(procs), therapy: 'Istirahat cukup, minum air putih, obat sesuai resep.', status: finalize ? 'final' : 'draft', signed_at: finalize ? v.finished_at : null, created_at: created, updated_at: created });
  if (!finalize) return v;
  const items = [{ kind: 'consult', name: `Konsultasi dokter`, qty: 1, price: fee, discount: 0, auto: true }];
  procs.forEach((x) => items.push({ kind: 'procedure', name: x.name, qty: 1, price: x.price, discount: 0, auto: true }));
  let rx = null;
  if (poli !== 'gigi' || rnd() < 0.4) {
    const meds = [pick(MEDS.map((m, i) => [i + 1, m])), pick(MEDS.map((m, i) => [i + 1, m]))].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i);
    const rxItems = meds.map(([mid, m]) => ({ medicine_id: mid, name: `${m[0]} ${m[4]}`.trim(), qty: m[5] === 'u-botol' || m[5] === 'u-tube' ? 1 : pick([6, 10, 15]), unit: m[3], dose: pick(['3 x 1 sesudah makan', '2 x 1 sesudah makan', '1 x 1 malam']), price: m[7] }));
    rxid++;
    rx = { id: rxid, rx_no: mk('rx', bc, d), date: d, patient_id: p.id, visit_id: v.id, doctor_id: doc, branch_id: br, items: JSON.stringify(rxItems), status: rxNew ? 'new' : 'dispensed', dispensed_by: rxNew ? null : 'apt. Dimas Prasetyo', dispensed_at: rxNew ? null : v.finished_at, created_at: created, updated_at: created };
    ins('prescriptions', rx);
    stat(d, br, 'rx', 1);
    rxItems.forEach((it) => items.push({ kind: 'medicine', name: it.name, qty: it.qty, price: it.price, discount: 0, auto: true, ref: `rx:${rxid}` }));
    if (!rxNew) rxItems.forEach((it) => ins('stock_moves', { date: d, medicine_id: it.medicine_id, branch_id: br, type: 'dispense', qty: -it.qty, ref: rx.rx_no, note: 'Dispensing resep', user_name: 'apt. Dimas Prasetyo', created_at: v.finished_at, updated_at: v.finished_at }));
  }
  if (labReq || (poli === 'dalam' && rnd() < 0.7) || rnd() < 0.12) {
    labid++;
    const tests = poli === 'dalam' ? [['lab-gdp', 'Gula darah puasa', 'mg/dL', '70 – 100', 35000, int(88, 168)], ['lab-chol', 'Kolesterol total', 'mg/dL', '< 200', 45000, int(160, 260)]] : [['lab-hb', 'Hemoglobin', 'g/dL', '12 – 17,5', 35000, +(10.5 + rnd() * 5).toFixed(1)], ['lab-leu', 'Leukosit', '10³/µL', '4 – 11', 30000, +(4 + rnd() * 9).toFixed(1)]];
    const t = tests.map(([test_id, name, unit, ref, price, val]) => ({ test_id, name, unit, ref, price, result: labReq ? '' : String(val), flag: labReq ? '' : (test_id === 'lab-gdp' && val > 100) || (test_id === 'lab-chol' && val > 200) || (test_id === 'lab-leu' && val > 11) ? 'H' : test_id === 'lab-hb' && val < 12 ? 'L' : '' }));
    ins('lab_orders', { id: labid, lab_no: mk('lab', bc, d), date: d, patient_id: p.id, visit_id: v.id, doctor_id: doc, branch_id: br, tests: JSON.stringify(t), status: labReq ? 'requested' : 'validated', validated_by: labReq ? null : 'Agus Setiawan, A.Md.AK', result_at: labReq ? null : v.finished_at, created_at: created, updated_at: created });
    stat(d, br, 'lab', 1);
    t.forEach((x) => items.push({ kind: 'lab', name: `Lab: ${x.name}`, qty: 1, price: x.price, discount: 0, auto: true, ref: `lab:${labid}` }));
  }
  items.push({ kind: 'admin', name: 'Biaya administrasi', qty: 1, price: 10000, discount: 0, auto: true });
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const discount = p.member_tier === 'tier-gold' ? Math.round(subtotal * 0.05) : p.member_tier === 'tier-platinum' ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;
  invid++;
  const paid = pay ? total : 0;
  ins('invoices', { id: invid, invoice_no: mk('inv', bc, d), date: d, patient_id: p.id, visit_id: v.id, branch_id: br, type: 'visit', items: JSON.stringify(items), subtotal, discount, tax: 0, total, paid, status: pay ? 'paid' : 'unpaid', payer_type: p.payer_type, insurer_id: p.insurer_id, coupon: '', notes: discount ? 'Diskon member' : '', created_at: created, updated_at: v.finished_at });
  if (pay) {
    payid++;
    const method = p.payer_type === 'bpjs' ? 'insurance' : pick(METHODS);
    ins('payments', { id: payid, payment_no: mk('pay', bc, d), date: d, invoice_id: invid, patient_id: p.id, branch_id: br, method, amount: total, status: 'confirmed', reference: method === 'cash' ? '' : 'REF' + int(100000, 999999), confirmed_by: 'Siti Rahma', created_at: v.finished_at, updated_at: v.finished_at });
    stat(d, br, 'revenue', total);
    stat(d, br, 'payments', 1);
  }
  return { ...v, invoice_id: invid, total };
}

for (let back = 13; back >= 1; back--) {
  const d = addDays(today, -back);
  const dow = new Date(d + 'T00:00:00Z').getUTCDay();
  for (const br of Object.keys(BR)) {
    const n = br === 'jkt' ? int(dow === 0 ? 4 : 9, dow === 0 ? 7 : 16) : int(dow === 0 ? 1 : 3, dow === 0 ? 3 : 7);
    for (let k = 0; k < n; k++) {
      const [doc, poli, fee] = pick(DOCS[br]);
      const pp = patients.filter((x) => x.branch_id === br);
      const hm = `${String(int(8, 19)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`;
      visit({ d, br, p: pick(pp), doc, poli, fee, time: hm, qstatus: 'done', status: 'done', finalize: true, pay: true });
    }
    stat(d, br, 'bookings', int(2, 9));
  }
}

// today at JKT: a live queue
const P = (id) => patients.find((x) => x.id === id);
const T0 = [
  [P(2), 'dr-andini', 'umum', 150000, '07:40', 'done', 'done', true, true],
  [P(3), 'dr-andini', 'umum', 150000, '07:55', 'done', 'billing', true, false],
  [P(4), 'dr-rizky', 'gigi', 250000, '08:10', 'done', 'pharmacy', true, false, { rxNew: true }],
  [P(5), 'dr-andini', 'umum', 150000, '08:20', 'serving', 'examining', false, false],
  [P(6), 'dr-hendra', 'dalam', 300000, '08:35', 'done', 'lab', true, false, { labReq: true }],
  [P(7), 'dr-andini', 'umum', 150000, '08:50', 'waiting', 'triage', false, false],
  [P(8), 'dr-andini', 'umum', 150000, '09:05', 'waiting', 'registered', false, false],
  [P(9), 'dr-rizky', 'gigi', 250000, '09:10', 'waiting', 'registered', false, false],
  [P(10), 'dr-sekar', 'anak', 250000, '09:15', 'called', 'registered', false, false],
];
const todayRes = T0.map(([p, doc, poli, fee, time, qs, st, fin, pay, extra = {}]) => visit({ d: today, br: 'jkt', p, doc, poli, fee, time, qstatus: qs, status: st, finalize: fin, pay, ...extra }));
stat(today, 'jkt', 'bookings', 6);

// pending transfer payment on patient 3's unpaid invoice (awaiting cashier confirmation)
const v3 = todayRes[1];
if (v3?.invoice_id) {
  payid++;
  ins('payments', { id: payid, payment_no: mk('pay', 'JKT', today), date: today, invoice_id: v3.invoice_id, patient_id: 3, branch_id: 'jkt', method: 'transfer', amount: v3.total, status: 'pending', reference: 'BCA-TRF-88213', notes: 'Upload bukti dari portal pasien', created_at: ts(today, '09:20'), updated_at: ts(today, '09:20') });
}

// ---------------------------------------------------------------- appointments: today (not yet checked in) + upcoming
let aid = 0;
const appt = (d, time, p, doc, poli, br, status = 'confirmed', type = 'offline', src = 'web') => {
  aid++;
  const no = `GK${d.slice(2).replace(/-/g, '')}-${['7KQ2', 'M4TX', 'P9RB', 'H2LW', 'C8ND', 'V5JE', 'Q3ZA', 'X6FU', 'R7GH', 'T2PK', 'W9MB', 'A4CS', 'N8YD', 'E5UR'][aid % 14]}${aid}`.slice(0, 16);
  ins('appointments', { id: aid, booking_no: no, patient_id: p.id, name: p.name, phone: p.phone, email: p.email, birth_date: p.birth_date, gender: p.gender, branch_id: br, poli_id: poli, service_id: null, doctor_id: doc, date: d, time, type, status, complaint: pick(['Kontrol rutin', 'Demam', 'Konsultasi', 'Sakit gigi', 'Cek gula darah']), source: src, meet_url: type === 'telemedicine' ? `https://meet.jit.si/GlobalKlinik-${no}-demo${aid}` : null, reminded: 0, created_at: ts(addDays(d, -2), '10:00'), updated_at: ts(addDays(d, -2), '10:00') });
};
appt(today, '10:20', P(11), 'dr-andini', 'umum', 'jkt');
appt(today, '10:40', P(12), 'dr-andini', 'umum', 'jkt');
appt(today, '11:00', P(13), 'dr-nadia', 'kulit', 'jkt', 'confirmed', 'telemedicine');
appt(today, '15:20', P(14), 'dr-sekar', 'anak', 'jkt');
appt(addDays(today, 1), '09:00', P(1), 'dr-hendra', 'dalam', 'jkt', 'confirmed', 'offline', 'portal');
appt(addDays(today, 1), '09:20', P(15), 'dr-hendra', 'dalam', 'jkt');
appt(addDays(today, 1), '10:00', P(16), 'dr-rizky', 'gigi', 'jkt');
appt(addDays(today, 2), '08:40', P(40), 'dr-bayu', 'umum', 'bdg');
appt(addDays(today, 2), '16:20', P(17), 'dr-maya', 'kia', 'jkt');
appt(addDays(today, 3), '09:40', P(55), 'dr-larasati', 'umum', 'sby');
appt(addDays(today, 3), '11:20', P(18), 'dr-nadia', 'kulit', 'jkt', 'confirmed', 'telemedicine');
appt(addDays(today, 1), '09:00', P(19), 'dr-hendra', 'dalam', 'jkt', 'waitlist');

// leads & newsletter
[['Rahmat Hidayat', '081399887766', 'MCU karyawan 50 orang', 'Kerja sama korporat'], ['Lina Marlina', '081277665544', 'Tanya jadwal dokter anak hari Sabtu', 'Booking / jadwal'], ['Doni Pratama', '085611223344', 'Apakah menerima asuransi Nusantara Life?', 'Asuransi / BPJS'], ['Yuni Astuti', '087812341234', 'Paket USG 4D berapa?', 'Pertanyaan umum']].forEach(([name, phone, message, interest], i) =>
  ins('leads', { date: addDays(today, -i), name, phone, email: null, source: 'website', interest, message, status: i === 0 ? 'contacted' : 'new', created_at: ts(addDays(today, -i), '10:00'), updated_at: ts(addDays(today, -i), '10:00') }));
['andi@example.com', 'ratna@example.com', 'yoga@example.com'].forEach((email, i) => ins('newsletter', { email, name: email.split('@')[0], status: 'subscribed', created_at: ts(addDays(today, -i), '11:00'), updated_at: ts(addDays(today, -i), '11:00') }));

// counters
for (const [key, value] of Object.entries(counters)) out.push(`INSERT INTO counters (key, value) VALUES (${q(key)}, ${value}) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);

writeFileSync(new URL('../seed/demo.sql', import.meta.url), `-- Demo data generated ${new Date().toISOString()} for ${today}\n` + out.join('\n') + '\n');
console.log(`seed/demo.sql: ${out.length} statements · ${vid} visits · ${invid} invoices · ${NP} patients · today=${today}`);
