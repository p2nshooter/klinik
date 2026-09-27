// Creates the initial accounts with random 4-digit PINs (the owner's choice; changeable per user in Admin -> Pengguna) and prints:
//   1) SQL (INSERT OR IGNORE) with PBKDF2 hashes — apply to D1; never commit plaintext passwords
//   2) the credential list to hand over privately to the owner
// Usage: node scripts/seed-users.mjs <out-dir>
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../src/lib/crypto.js';

const outDir = process.argv[2] || '.';
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
// Skip guessable PINs: repeated digits (1111), runs (1234/4321), pairs (1212), years (19xx/20xx).
const weak = (p) => /^(\d)\1+$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p) || p.slice(0, 2) === p.slice(2) || /^(19|20)\d\d$/.test(p);
const used = new Set();
const mkPass = () => {
  let p;
  do p = String(rand(10000)).padStart(4, '0');
  while (weak(p) || used.has(p));
  used.add(p);
  return p;
};

const USERS = [
  ['superadmin', 'Super Admin', 'superadmin', null, null, null, 'superadmin@globalklinik.id'],
  ['admin', 'Admin Klinik', 'admin', null, null, null, 'admin@globalklinik.id'],
  ['manajemen', 'Direktur Klinik', 'manager', null, null, null, 'manajemen@globalklinik.id'],
  ['dokter', 'dr. Andini Pratama', 'doctor', 'jkt', 'dr-andini', null, 'andini@globalklinik.id'],
  ['perawat', 'Ns. Rina Kartika, S.Kep', 'nurse', 'jkt', null, null, 'perawat@globalklinik.id'],
  ['apoteker', 'apt. Dimas Prasetyo, S.Farm', 'pharmacist', 'jkt', null, null, 'apotek@globalklinik.id'],
  ['kasir', 'Siti Rahma', 'cashier', 'jkt', null, null, 'kasir@globalklinik.id'],
  ['pendaftaran', 'Wulan Sari', 'registration', 'jkt', null, null, 'pendaftaran@globalklinik.id'],
  ['lab', 'Agus Setiawan, A.Md.AK', 'lab', 'jkt', null, null, 'lab@globalklinik.id'],
  ['marketing', 'Nadia Putri', 'marketing', null, null, null, 'marketing@globalklinik.id'],
  ['pasien', 'Budi Santoso', 'patient', null, null, 1, 'budi.santoso@example.com'],
];

const now = new Date().toISOString().slice(0, 19) + 'Z';
const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`);
const sql = [];
const creds = [];
for (const [i, [username, name, role, branch, doctor, patient, email]] of USERS.entries()) {
  const pw = mkPass();
  const hash = await hashPassword(pw);
  sql.push(`INSERT OR IGNORE INTO users (username, name, email, role, branch_id, doctor_id, patient_id, status, totp_enabled, password_hash, created_at, updated_at) VALUES (${[username, name, email, role, branch, doctor, patient, 'active', 0, hash, now, now].map(q).join(', ')});`);
  creds.push([username, pw, role, name]);
}
writeFileSync(`${outDir}/users.sql`, sql.join('\n') + '\n');
writeFileSync(`${outDir}/credentials.txt`, creds.map((c) => c.join('\t')).join('\n') + '\n');
console.log(creds.map(([u, p, r]) => `${u.padEnd(12)} ${p.padEnd(18)} ${r}`).join('\n'));
