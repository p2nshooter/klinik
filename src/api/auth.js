// Authentication: login (+TOTP 2FA), logout, profile, patient self-registration, password & 2FA management, first-run setup.
import { clearCookie, createSession, destroySession, destroyUserSessions, rateCheck, rateClear, rateHit, requireUser, rolePerms, sessionCookie, updateSession } from '../lib/auth.js';
import { byId, getBundle } from '../lib/cms.js';
import { hashPassword, newTotpSecret, passwordProblems, totpUri, verifyPassword, verifyTotp } from '../lib/crypto.js';
import { audit, d1Entity, d1Insert, q1, run } from '../lib/db.js';
import { badRequest, conflict, forbidden, json, normPhone, nowISO, readJSON, unauthorized } from '../lib/util.js';
import { createPatient, findPatient, phoneVariants } from './shared.js';

async function findUser(env, login) {
  const l = String(login || '').trim().toLowerCase();
  if (!l) return null;
  let u = await q1(env, 'SELECT * FROM users WHERE username = ?', l);
  if (!u && l.includes('@')) u = await q1(env, 'SELECT * FROM users WHERE lower(email) = ? LIMIT 1', l);
  if (!u && /^[+\d][\d\s-]{7,}$/.test(l)) {
    const v = phoneVariants(l);
    u = await q1(env, `SELECT * FROM users WHERE phone IN (${v.map(() => '?').join(',')}) OR username IN (${v.map(() => '?').join(',')}) LIMIT 1`, ...v, ...v);
  }
  return u;
}

export function publicUser(u, bundle) {
  const perms = rolePerms(bundle, u.role);
  const role = (bundle.roles || []).find((r) => r.id === u.role);
  return {
    id: u.id ?? u.uid, username: u.username, name: u.name, role: u.role, role_name: role?.name || u.role, home: role?.home || (u.role === 'patient' ? 'portal' : 'dashboard'),
    branch_id: u.branch_id || null, doctor_id: u.doctor_id || null, patient_id: u.patient_id || null, perms, totp_enabled: !!u.totp_enabled,
    doctor: u.doctor_id ? byId(bundle.doctors, u.doctor_id)?.name || null : null,
  };
}

export async function login(ctx) {
  const { env } = ctx;
  const body = await readJSON(ctx.req, 5000);
  const username = String(body.username || '').trim().toLowerCase();
  await rateCheck(env, `login:${ctx.ip}`, 15, 900);
  await rateCheck(env, `login:u:${username}`, 8, 900);
  const u = await findUser(env, username);
  const ok = u && u.status !== 'suspended' && (await verifyPassword(String(body.password || ''), u.password_hash));
  if (!ok) {
    ctx.waitUntil(Promise.all([rateHit(env, `login:${ctx.ip}`, 900), rateHit(env, `login:u:${username}`, 900)]));
    audit(ctx, 'login_failed', 'users', u?.id, username);
    throw unauthorized('Username atau password salah');
  }
  if (u.totp_enabled) {
    if (!body.otp) return json({ need_otp: true });
    if (!(await verifyTotp(u.totp_secret, body.otp))) {
      ctx.waitUntil(rateHit(env, `login:u:${username}`, 900));
      throw unauthorized('Kode 2FA salah');
    }
  }
  const tok = await createSession(env, u, ctx.req);
  ctx.waitUntil(Promise.all([run(env, 'UPDATE users SET last_login_at = ? WHERE id = ?', nowISO(), u.id), rateClear(env, `login:u:${username}`)]));
  ctx.session = { uid: u.id, username: u.username, role: u.role };
  audit(ctx, 'login', 'users', u.id);
  const bundle = await getBundle(env);
  return json({ ok: true, token: tok, user: publicUser(u, bundle) }, 200, { 'set-cookie': sessionCookie(tok) });
}

export async function logout(ctx) {
  if (ctx.session?.token) await destroySession(ctx.env, ctx.session.token);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}

export async function me(ctx) {
  const s = requireUser(ctx);
  const bundle = await getBundle(ctx.env);
  const u = await q1(ctx.env, 'SELECT id, username, name, role, branch_id, doctor_id, patient_id, totp_enabled, status, email, phone FROM users WHERE id = ?', s.uid);
  if (!u || u.status === 'suspended') {
    await destroySession(ctx.env, s.token);
    throw unauthorized('Sesi berakhir');
  }
  if (u.role !== s.role || (u.branch_id || null) !== (s.branch_id || null) || (u.patient_id || null) !== (s.patient_id || null)) {
    await updateSession(ctx.env, s, { role: u.role, branch_id: u.branch_id || null, patient_id: u.patient_id || null, doctor_id: u.doctor_id || null, name: u.name });
  }
  return json({ user: { ...publicUser(u, bundle), email: u.email, phone: u.phone } });
}

export async function register(ctx) {
  const { env } = ctx;
  await rateCheck(env, `register:${ctx.ip}`, 5, 3600);
  const b = await readJSON(ctx.req, 10000);
  if (b.website) throw badRequest('Spam terdeteksi');
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  if (name.length < 2) throw badRequest('Nama wajib diisi');
  if (normPhone(phone).length < 9) throw badRequest('Nomor HP tidak valid');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Email tidak valid');
  const pwErr = passwordProblems(b.password);
  if (pwErr) throw badRequest(pwErr);
  const username = email || normPhone(phone);
  if (await findUser(env, username)) throw conflict('Akun dengan email/nomor HP ini sudah terdaftar. Silakan login.');
  if (email && (await q1(env, 'SELECT id FROM users WHERE lower(email) = ?', email))) throw conflict('Email sudah terdaftar');
  let patient = await findPatient(env, { phone, name, birth_date: b.birth_date });
  if (patient && (await q1(env, 'SELECT id FROM users WHERE patient_id = ?', patient.id))) patient = null;
  if (!patient) patient = await createPatient(ctx, { name, phone, email, birth_date: b.birth_date || null, gender: ['L', 'P'].includes(b.gender) ? b.gender : null, nik: b.nik || null, referred_by: b.referral || null });
  const password_hash = await hashPassword(String(b.password));
  const id = await d1Insert(env, d1Entity('users'), { username, name, email: email || null, phone, role: 'patient', patient_id: patient.id, status: 'active', password_hash, totp_enabled: 0 });
  ctx.waitUntil(rateHit(env, `register:${ctx.ip}`, 3600));
  const u = { id, username, name, role: 'patient', patient_id: patient.id };
  const tok = await createSession(env, u, ctx.req);
  ctx.session = { uid: id, username, role: 'patient' };
  audit(ctx, 'register', 'users', id, { mrn: patient.mrn });
  const bundle = await getBundle(env);
  return json({ ok: true, token: tok, user: publicUser(u, bundle), mrn: patient.mrn }, 201, { 'set-cookie': sessionCookie(tok) });
}

export async function changePassword(ctx) {
  const s = requireUser(ctx);
  const b = await readJSON(ctx.req, 5000);
  const u = await q1(ctx.env, 'SELECT password_hash FROM users WHERE id = ?', s.uid);
  if (!(await verifyPassword(String(b.old || ''), u?.password_hash))) throw badRequest('Password lama salah');
  const err = passwordProblems(b.new);
  if (err) throw badRequest(err);
  await run(ctx.env, 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(String(b.new)), nowISO(), s.uid);
  await destroyUserSessions(ctx.env, s.uid, s.token);
  audit(ctx, 'password_change', 'users', s.uid);
  return json({ ok: true });
}

export async function totpSetup(ctx) {
  const s = requireUser(ctx);
  const secret = newTotpSecret();
  await run(ctx.env, 'UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', secret, s.uid);
  const bundle = await getBundle(ctx.env);
  return json({ secret, uri: totpUri(secret, s.username, bundle.settings?.clinic_name || 'Global Klinik') });
}

export async function totpEnable(ctx) {
  const s = requireUser(ctx);
  const b = await readJSON(ctx.req, 2000);
  const u = await q1(ctx.env, 'SELECT totp_secret FROM users WHERE id = ?', s.uid);
  if (!u?.totp_secret || !(await verifyTotp(u.totp_secret, b.code))) throw badRequest('Kode tidak valid. Pastikan jam di HP sudah sesuai.');
  await run(ctx.env, 'UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?', nowISO(), s.uid);
  audit(ctx, '2fa_enable', 'users', s.uid);
  return json({ ok: true });
}

export async function totpDisable(ctx) {
  const s = requireUser(ctx);
  const b = await readJSON(ctx.req, 2000);
  const u = await q1(ctx.env, 'SELECT password_hash FROM users WHERE id = ?', s.uid);
  if (!(await verifyPassword(String(b.password || ''), u?.password_hash))) throw badRequest('Password salah');
  await run(ctx.env, 'UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?', nowISO(), s.uid);
  audit(ctx, '2fa_disable', 'users', s.uid);
  return json({ ok: true });
}

export async function logoutAll(ctx) {
  const s = requireUser(ctx);
  await destroyUserSessions(ctx.env, s.uid);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}

export async function setupStatus(ctx) {
  const r = await q1(ctx.env, 'SELECT id FROM users LIMIT 1');
  return json({ needed: !r });
}

export async function setup(ctx) {
  const r = await q1(ctx.env, 'SELECT id FROM users LIMIT 1');
  if (r) throw forbidden('Setup sudah dilakukan');
  const b = await readJSON(ctx.req, 5000);
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw badRequest('Username 3-32 karakter (huruf kecil, angka, titik, strip)');
  const err = passwordProblems(b.password);
  if (err) throw badRequest(err);
  const id = await d1Insert(ctx.env, d1Entity('users'), { username, name: String(b.name || 'Super Admin'), email: b.email || null, role: 'superadmin', status: 'active', password_hash: await hashPassword(String(b.password)), totp_enabled: 0 });
  ctx.session = { uid: id, username, role: 'superadmin' };
  audit(ctx, 'setup', 'users', id);
  const tok = await createSession(ctx.env, { id, username, name: b.name || 'Super Admin', role: 'superadmin' }, ctx.req);
  return json({ ok: true, token: tok }, 201, { 'set-cookie': sessionCookie(tok) });
}
