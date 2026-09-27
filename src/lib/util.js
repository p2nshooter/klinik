// Shared helpers for the Worker: responses, errors, ids, dates (WIB), escaping, formatting.

export const TZ_OFFSET_HOURS = 7; // Asia/Jakarta (WIB)

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const badRequest = (m = 'Permintaan tidak valid', x) => new HttpError(400, m, x);
export const unauthorized = (m = 'Silakan login terlebih dahulu') => new HttpError(401, m);
export const forbidden = (m = 'Anda tidak memiliki akses') => new HttpError(403, m);
export const notFound = (m = 'Data tidak ditemukan') => new HttpError(404, m);
export const conflict = (m = 'Data bentrok, silakan muat ulang') => new HttpError(409, m);
export const tooMany = (m = 'Terlalu banyak percobaan, coba lagi nanti') => new HttpError(429, m);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

export async function readJSON(request, maxBytes = 2_000_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw badRequest('Data terlalu besar');
  const text = await request.text();
  if (text.length > maxBytes) throw badRequest('Data terlalu besar');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('Format JSON tidak valid');
  }
}

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
export function rid(len = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHA[b % 36];
  return s;
}
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
export function code(len = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += CODE[b % CODE.length];
  return s;
}

export const nowISO = () => new Date().toISOString().slice(0, 19) + 'Z';
const shift = (d, h) => new Date(d.getTime() + h * 3600_000);
export function localDate(d = new Date(), tz = TZ_OFFSET_HOURS) {
  return shift(d, tz).toISOString().slice(0, 10);
}
export function localTime(d = new Date(), tz = TZ_OFFSET_HOURS) {
  return shift(d, tz).toISOString().slice(11, 16);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTime = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
export function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
export function minToTime(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function money(n, lang = 'id') {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
  return (v < 0 ? '-' : '') + 'Rp ' + s;
}

const MONTHS = {
  id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
export const DAYS = {
  id: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
export function fmtDate(s, lang = 'id') {
  if (!s) return '';
  const d = String(s).slice(0, 10);
  if (!isDate(d)) return String(s);
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[lang === 'en' ? 'en' : 'id'][m - 1]} ${y}`;
}
export function fmtDateTime(iso, lang = 'id') {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return `${fmtDate(localDate(d), lang)} ${localTime(d)}`;
}
export function age(birth) {
  if (!isDate(birth)) return '';
  const b = new Date(birth + 'T00:00:00Z');
  const n = new Date(localDate() + 'T00:00:00Z');
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export function normPhone(p) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0')) s = '62' + s.slice(1);
  return s;
}

export function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function tr(v, lang = 'id') {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v[lang] || v.id || v.en || '';
  return v ?? '';
}

export function parseJSON(s, fallback) {
  if (s === null || s === undefined || s === '') return fallback;
  if (typeof s !== 'string') return s;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function clientIP(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
}

export function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  for (const part of c.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
