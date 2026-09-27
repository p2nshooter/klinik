// Sessions (KV), permissions (RBAC from CMS roles), rate limiting and CSRF guard.
import { token } from './crypto.js';
import { getCookie, clientIP, forbidden, unauthorized, tooMany } from './util.js';

export const SESSION_TTL = 12 * 3600;
const COOKIE = 'gk_sess';
const memSess = new Map();
const MEM_TTL = 30_000;

export async function createSession(env, user, request) {
  const tok = `${user.id}.${token(24)}`;
  const s = {
    uid: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    branch_id: user.branch_id || null,
    doctor_id: user.doctor_id || null,
    patient_id: user.patient_id || null,
    iat: Date.now(),
    ip: clientIP(request),
  };
  await env.SESSIONS.put('s:' + tok, JSON.stringify(s), { expirationTtl: SESSION_TTL });
  return tok;
}

export function readToken(request) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return getCookie(request, COOKIE);
}

export async function getSession(request, env) {
  const tok = readToken(request);
  if (!tok || !/^\d+\.[A-Za-z0-9_-]{20,64}$/.test(tok)) return null;
  const m = memSess.get(tok);
  if (m && Date.now() - m.at < MEM_TTL) return m.s;
  const s = await env.SESSIONS.get('s:' + tok, { type: 'json' });
  if (!s) {
    memSess.delete(tok);
    return null;
  }
  s.token = tok;
  if (memSess.size > 500) memSess.clear();
  memSess.set(tok, { s, at: Date.now() });
  return s;
}

export async function updateSession(env, s, patch) {
  const next = { ...s, ...patch };
  delete next.token;
  await env.SESSIONS.put('s:' + s.token, JSON.stringify(next), { expirationTtl: SESSION_TTL });
  memSess.delete(s.token);
}

export async function destroySession(env, tok) {
  memSess.delete(tok);
  await env.SESSIONS.delete('s:' + tok);
}

export async function destroyUserSessions(env, uid, exceptToken) {
  let cursor;
  do {
    const res = await env.SESSIONS.list({ prefix: `s:${uid}.`, cursor });
    await Promise.all(
      res.keys
        .filter((k) => k.name !== 's:' + exceptToken)
        .map((k) => {
          memSess.delete(k.name.slice(2));
          return env.SESSIONS.delete(k.name);
        })
    );
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
}

export function sessionCookie(tok, maxAge = SESSION_TTL) {
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// ---------- RBAC ----------
export function rolePerms(bundle, role) {
  const r = (bundle.roles || []).find((x) => x.id === role || x.code === role);
  if (!r && role === 'superadmin') return ['*'];
  return r?.perms || [];
}

export function can(perms, perm) {
  const [ent, act] = perm.split(':');
  const match = (p) => p === '*' || p === perm || p === `${ent}:*` || p === `*:${act}`;
  if (perms.some((p) => p.startsWith('!') && match(p.slice(1)))) return false;
  return perms.some((p) => !p.startsWith('!') && match(p));
}

export function requireUser(ctx) {
  if (!ctx.session) throw unauthorized();
  return ctx.session;
}

export function requireStaff(ctx) {
  const s = requireUser(ctx);
  if (s.role === 'patient') throw forbidden();
  return s;
}

export function requirePerm(ctx, perm) {
  requireStaff(ctx);
  if (!can(ctx.perms, perm)) throw forbidden(`Akses ditolak (${perm})`);
}

export function canAny(ctx, ...perms) {
  return perms.some((p) => can(ctx.perms || [], p));
}

/** Branch the current user is restricted to (null = all branches). */
export function userBranch(ctx) {
  return ctx.session?.branch_id || null;
}

// ---------- Rate limiting (memory + KV) ----------
const memRL = new Map();
export async function rateCheck(env, key, limit, windowSec) {
  const k = 'rl:' + key;
  const m = memRL.get(k);
  if (m && m.until > Date.now() && m.n >= limit) throw tooMany();
  const n = Number((await env.KV.get(k)) || 0);
  if (n >= limit) {
    memRL.set(k, { n, until: Date.now() + 60_000 });
    throw tooMany();
  }
  return n;
}
export async function rateHit(env, key, windowSec) {
  const k = 'rl:' + key;
  const n = Number((await env.KV.get(k)) || 0) + 1;
  await env.KV.put(k, String(n), { expirationTtl: Math.max(60, windowSec) });
  const m = memRL.get(k) || { n: 0, until: 0 };
  memRL.set(k, { n, until: Date.now() + windowSec * 1000 });
  return n;
}
export async function rateClear(env, key) {
  memRL.delete('rl:' + key);
  await env.KV.delete('rl:' + key);
}

// ---------- CSRF ----------
export function csrfOk(request, url) {
  const m = request.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  // Bearer-token API clients (mobile apps) are not exposed to CSRF
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return true;
  if (request.headers.get('x-gk') !== '1') return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return true;
}
