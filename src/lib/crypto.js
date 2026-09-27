// Password hashing (PBKDF2-SHA256), random tokens, TOTP (RFC 6238) and digests — WebCrypto only.

const enc = new TextEncoder();

export function b64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function token(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const PBKDF2_ITER = 100000; // Workers maximum

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password, iterations = PBKDF2_ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(dk)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [algo, iter, saltB64, hashB64] = stored.split('$');
  if (algo !== 'pbkdf2') return false;
  const dk = await pbkdf2(password, unb64(saltB64), Number(iter));
  const expected = unb64(hashB64);
  if (dk.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < dk.length; i++) diff |= dk[i] ^ expected[i];
  return diff === 0;
}

export function passwordProblems(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password minimal 8 karakter';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Password harus mengandung huruf dan angka';
  return null;
}

export async function sha256hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
export async function sha512hex(text) {
  return hex(await crypto.subtle.digest('SHA-512', enc.encode(text)));
}

// ---------- TOTP ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export function newTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}
async function hotp(secretBytes, counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}
export async function verifyTotp(secret, code, window = 1) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const bytes = base32Decode(secret);
  const step = Math.floor(Date.now() / 30000);
  for (let w = -window; w <= window; w++) {
    if ((await hotp(bytes, step + w)) === c) return true;
  }
  return false;
}
export function totpUri(secret, account, issuer = 'Global Klinik') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
