// Creates the initial accounts with strong random passwords and prints:
//   1) SQL (INSERT OR IGNORE) with PBKDF2 hashes — apply to D1; never commit plaintext passwords
//   2) the credential list to hand over privately to the owner
// Usage: node scripts/seed-users.mjs <out-dir>
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../src/lib/crypto.js';

const outDir = process.argv[2] || '.';
const words = ['Sehat', 'Prima', 'Bugar', 'Medika', 'Tangguh', 'Cemerlang', 'Harmoni', 'Sentosa', 'Mulia', 'Sejahtera', 'Bahagia'];
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const sym = ['#', '@', '!', '$', '%'];
const mkPass = (i) => `${words[i % words.length]}${sym[rand(sym.length)]}${1000 + rand(9000)}Gk`;

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
  const pw = mkPass(i);
  const hash = await hashPassword(pw);
  sql.push(`INSERT OR IGNORE INTO users (username, name, email, role, branch_id, doctor_id, patient_id, status, totp_enabled, password_hash, created_at, updated_at) VALUES (${[username, name, email, role, branch, doctor, patient, 'active', 0, hash, now, now].map(q).join(', ')});`);
  creds.push([username, pw, role, name]);
}
writeFileSync(`${outDir}/users.sql`, sql.join('\n') + '\n');
writeFileSync(`${outDir}/credentials.txt`, creds.map((c) => c.join('\t')).join('\n') + '\n');
console.log(creds.map(([u, p, r]) => `${u.padEnd(12)} ${p.padEnd(18)} ${r}`).join('\n'));
