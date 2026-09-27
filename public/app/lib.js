// Core helpers for the Global Klinik app: state, API, i18n, formatting, UI primitives, charts, exports.
import { icon, logoMark } from '/assets/js/icons.js';
import { markdown, inline } from '/assets/js/markdown.js';
export { icon, logoMark, markdown, inline };

export const S = { user: null, meta: null, lang: 'id', branch: '', route: '' };
try {
  S.lang = localStorage.getItem('gk-lang') || 'id';
  S.branch = localStorage.getItem('gk-branch') || '';
} catch {}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const T = (id, en) => (S.lang === 'en' && en ? en : id);
export const L = (label) => (Array.isArray(label) ? (S.lang === 'en' ? label[1] || label[0] : label[0]) : label || '');
export const tr = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v[S.lang] || v.id || v.en || '' : v ?? '');
export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
export const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- API
export class ApiError extends Error {}
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-gk': '1' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(T('Tidak dapat terhubung. Periksa koneksi internet.', 'Cannot connect. Check your internet connection.'));
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    S.user = null;
    if (!location.hash.startsWith('#/login') && !location.hash.startsWith('#/register')) location.hash = '#/login?next=' + encodeURIComponent(location.hash.slice(1));
  }
  if (!res.ok) {
    const e = new ApiError(data.error || `Error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

// ---------------------------------------------------------------- formatting
const MONTHS = { id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const DAYS = { id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
export const num = (n) => (Number(n) || 0).toLocaleString(S.lang === 'en' ? 'en-US' : 'id-ID');
export const money = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString(S.lang === 'en' ? 'en-US' : 'id-ID');
export function fdate(d, withDay = false) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-').map(Number);
  if (!y) return d;
  const day = withDay ? DAYS[S.lang === 'en' ? 'en' : 'id'][new Date(s + 'T00:00:00Z').getUTCDay()] + ', ' : '';
  return `${day}${dd} ${MONTHS[S.lang === 'en' ? 'en' : 'id'][m - 1]} ${y}`;
}
export function fdt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const l = new Date(d.getTime() + 7 * 3600e3).toISOString();
  return `${fdate(l.slice(0, 10))} ${l.slice(11, 16)}`;
}
export function ftime(iso) {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(11, 16);
}
export function age(b) {
  if (!b) return '';
  const d = new Date(b + 'T00:00:00Z');
  const n = new Date(today() + 'T00:00:00Z');
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--;
  return a;
}
export const initials = (n) => String(n || '?').replace(/^(dr|drg)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ---------------------------------------------------------------- permissions & bundle
export function can(perm) {
  const perms = S.user?.perms || [];
  const [ent, act] = perm.split(':');
  const m = (p) => p === '*' || p === perm || p === `${ent}:*` || p === `*:${act}`;
  if (perms.some((p) => p.startsWith('!') && m(p.slice(1)))) return false;
  return perms.some((p) => !p.startsWith('!') && m(p));
}
export const canAny = (...p) => p.some(can);
export const B = () => S.meta?.bundle || {};
export const byId = (list, id) => (list || []).find((x) => String(x.id) === String(id));
export const active = (list) => (list || []).filter((x) => x.active !== false);
export const sorted = (list) => [...(list || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const ENT = (n) => S.meta?.entities?.[n];
export function branchParam() {
  return S.user?.branch_id || S.branch || '';
}
export function branchName(id) {
  return byId(B().branches, id)?.name || id || T('Semua cabang', 'All branches');
}
export const poliName = (id) => tr(byId(B().polis, id)?.name) || id || '';
export const doctorName = (id) => byId(B().doctors, id)?.name || '';

// ---------------------------------------------------------------- toasts, modal, drawer, confirm
export function toast(msg, type = 'ok') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(type === 'bad' ? 'alert' : 'check-circle', '', 18)}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'bad' ? 6000 : 3200);
}
export const fail = (e) => toast(e?.message || String(e), 'bad');

export function modal({ title, body = '', size = '', actions = [], onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2><button class="icon-btn" data-x aria-label="Tutup">${icon('x', '', 18)}</button></header><div class="body">${body}</div>${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="${i}">${a.label}</button>`).join('')}</footer>` : ''}</div>`;
  const close = () => {
    bg.remove();
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', (e) => e.target === bg && close());
  bg.querySelector('[data-x]').onclick = close;
  actions.forEach((a, i) => {
    const b = bg.querySelector(`[data-a="${i}"]`);
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.classList.add('busy');
      try {
        const r = await a.onClick(bg.querySelector('.modal'), close);
        if (r !== false) close();
      } catch (e) {
        fail(e);
      } finally {
        b.classList.remove('busy');
      }
    };
  });
  document.body.appendChild(bg);
  setTimeout(() => bg.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 50);
  return { el: bg.querySelector('.modal'), close };
}

export function confirmBox(message, { danger = false, okLabel, input } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title: danger ? T('Konfirmasi', 'Confirm') : T('Konfirmasi', 'Confirm'),
      body: `<p>${message}</p>${input ? `<label class="f">${input}<input data-in></label>` : ''}`,
      actions: [
        { label: T('Batal', 'Cancel'), onClick: () => { done = true; resolve(false); } },
        { label: okLabel || T('Ya, lanjutkan', 'Yes, continue'), cls: danger ? 'danger solid' : 'primary', onClick: (el) => { done = true; resolve(input ? el.querySelector('[data-in]').value : true); } },
      ],
      onClose: () => !done && resolve(false),
    });
    return m;
  });
}

export function drawer({ title, body = '' }) {
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const d = document.createElement('aside');
  d.className = 'drawer';
  d.innerHTML = `<header><h2 style="margin:0">${title}</h2><button class="icon-btn" data-x>${icon('x', '', 18)}</button></header><div class="body">${body}</div>`;
  const close = () => {
    bg.remove();
    d.remove();
  };
  bg.onclick = close;
  d.querySelector('[data-x]').onclick = close;
  document.body.append(bg, d);
  return { el: d.querySelector('.body'), close };
}

// ---------------------------------------------------------------- options / status badges
const STATUS_TONE = {
  ok: ['confirmed', 'completed', 'paid', 'done', 'dispensed', 'validated', 'final', 'received', 'approved', 'active', 'published', 'sent', 'subscribed', 'converted', 'processed', 'serving'],
  warn: ['pending', 'waitlist', 'unpaid', 'partial', 'draft', 'requested', 'sampled', 'new', 'ordered', 'submitted', 'waiting', 'triage', 'billing', 'pharmacy', 'lab', 'contacted', 'prepared'],
  bad: ['cancelled', 'no_show', 'void', 'failed', 'rejected', 'expired', 'suspended', 'lost', 'skipped', 'refunded'],
  info: ['checked_in', 'in_progress', 'called', 'examining', 'registered'],
};
export function tone(v) {
  for (const [k, list] of Object.entries(STATUS_TONE)) if (list.includes(v)) return k;
  return '';
}
export function optList(f) {
  if (f.optionsFrom === 'roles') return (B().roles || []).map((r) => [r.id, r.name, r.name]);
  return f.options || [];
}
export function optLabel(f, v) {
  const o = optList(f).find((x) => String(x[0]) === String(v));
  return o ? (S.lang === 'en' ? o[2] || o[1] : o[1]) : v ?? '';
}
export function badge(f, v) {
  if (v === null || v === undefined || v === '') return '<span class="faint">—</span>';
  const t = tone(v);
  return `<span class="badge ${t}">${t ? '<span class="d"></span>' : ''}${esc(optLabel(f, v))}</span>`;
}
export function statusBadge(options, v) {
  return badge({ options: options || [] }, v);
}

export function refText(f, v, refs) {
  if (v === null || v === undefined || v === '') return '';
  const target = ENT(f.ref);
  if (!target) return String(v);
  if (target.store === 'cms') {
    const it = byId(B()[f.ref], v);
    if (!it) return String(v);
    const lf = target.labelField || 'name';
    return tr(it[lf]) || it.name || it.id;
  }
  return refs?.[f.key]?.[v] || `#${v}`;
}

export function cell(f, row, refs) {
  const v = row[f.key];
  switch (f.type) {
    case 'bool':
      return v ? `<span class="badge ok">${icon('check', '', 12)} ${T('Ya', 'Yes')}</span>` : '<span class="faint">—</span>';
    case 'select':
      return badge(f, v);
    case 'money':
      return v === null || v === undefined ? '' : money(v);
    case 'number':
      return v === null || v === undefined ? '' : num(v);
    case 'date':
      return fdate(v);
    case 'datetime':
      return fdt(v);
    case 'image':
      return v ? `<img class="thumb" src="${esc(v)}" alt="" loading="lazy">` : '';
    case 'ref':
      return esc(refText(f, v, refs));
    case 'refs':
      return esc((v || []).map((x) => refText({ ...f, type: 'ref' }, x, refs)).join(', '));
    case 'items':
      return `<span class="badge">${(v || []).length} item</span>`;
    case 'color':
      return `<span style="display:inline-block;width:18px;height:18px;border-radius:6px;background:${esc(v)};vertical-align:middle"></span>`;
    case 'icon':
      return icon(v || 'star', '', 18);
    default: {
      const s = tr(v);
      const str = typeof s === 'string' ? s : JSON.stringify(s ?? '');
      return esc(str.length > 80 ? str.slice(0, 80) + '…' : str);
    }
  }
}

// ---------------------------------------------------------------- uploads
export async function uploadMedia(file) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/media', { method: 'POST', form: fd });
}
export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/files', { method: 'POST', form: fd });
}
export function pickFile(accept = '*/*') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}
export const fileUrl = (key, download) => `/api/files?key=${encodeURIComponent(key)}${download ? '&download=1' : ''}`;
export function openDoc(url) {
  window.open(url, '_blank', 'noopener');
}

// ---------------------------------------------------------------- QR
export async function qrSvg(text, size = 160) {
  const { default: qrcode } = await import('/assets/vendor/qrcode.mjs');
  const q = qrcode(0, 'M');
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  const c = size / (n + 2);
  let d = '';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) d += `M${((k + 1) * c).toFixed(2)} ${((r + 1) * c).toFixed(2)}h${c.toFixed(2)}v${c.toFixed(2)}h-${c.toFixed(2)}z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0B1F33"/></svg>`;
}

// ---------------------------------------------------------------- charts (single-series, one axis, hover tooltips)
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const short = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + (S.lang === 'en' ? 'M' : 'jt') : v >= 1e3 ? (v / 1e3).toFixed(0) + (S.lang === 'en' ? 'k' : 'rb') : String(Math.round(v)));

/** Column chart: data = [{label, value, tip?}] */
export function barChart(data, { height = 220, fmt = num, labelEvery = 1, highlightLast = false } = {}) {
  if (!data.length) return `<div class="empty">${T('Belum ada data', 'No data yet')}</div>`;
  const W = 640, H = height, pl = 40, pb = 26, pt = 18, pr = 6;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const bw = (W - pl - pr) / data.length;
  const barW = Math.min(24, bw * 0.62);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`;
  for (const tk of ticks) s += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(tk)}" y2="${y(tk)}"/><text class="axis-t" x="${pl - 6}" y="${y(tk) + 4}" text-anchor="end">${short(tk)}</text>`;
  data.forEach((d, i) => {
    const x = pl + i * bw + (bw - barW) / 2;
    const h = Math.max(0, H - pb - y(d.value));
    const r = Math.min(4, h / 2, barW / 2);
    const top = H - pb - h;
    const path = h > 0 ? `M${x} ${H - pb}V${top + r}q0 -${r} ${r} -${r}h${barW - 2 * r}q${r} 0 ${r} ${r}V${H - pb}Z` : '';
    s += `<g class="hit" data-tip="${esc(d.tip || `${d.label}: ${fmt(d.value)}`)}"><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>${path ? `<path class="bar" d="${path}"/>` : ''}</g>`;
    if (i % labelEvery === 0 || i === data.length - 1) s += `<text class="axis-t" x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(String(d.label).slice(0, 12))}</text>`;
    if ((highlightLast && i === data.length - 1) || (!highlightLast && i === maxIdx && d.value > 0)) s += `<text class="val-t" x="${pl + i * bw + bw / 2}" y="${top - 6}" text-anchor="middle">${esc(short(d.value))}</text>`;
  });
  return `<div class="chart">${s}</svg></div>`;
}

/** Line/area chart for one series over time. */
export function lineChart(data, { height = 220, fmt = num, labelEvery = 2 } = {}) {
  if (!data.length) return `<div class="empty">${T('Belum ada data', 'No data yet')}</div>`;
  const W = 640, H = height, pl = 44, pb = 26, pt = 18, pr = 30;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const step = (W - pl - pr) / Math.max(1, data.length - 1);
  const x = (i) => pl + i * step;
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="chart">`;
  for (const f of [0, 0.25, 0.5, 0.75, 1]) s += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${y(f * max)}" y2="${y(f * max)}"/><text class="axis-t" x="${pl - 6}" y="${y(f * max) + 4}" text-anchor="end">${short(f * max)}</text>`;
  s += `<path class="area" d="M${x(0)},${H - pb}L${pts.join('L')}L${x(data.length - 1)},${H - pb}Z"/><path class="line" d="M${pts.join('L')}"/>`;
  data.forEach((d, i) => {
    s += `<g class="hit" data-tip="${esc(d.tip || `${d.label}: ${fmt(d.value)}`)}"><rect x="${x(i) - step / 2}" y="${pt}" width="${step}" height="${H - pt - pb}" fill="transparent"/>${i === data.length - 1 ? `<circle class="dot" cx="${x(i)}" cy="${y(d.value)}" r="5"/>` : ''}</g>`;
    if (i % labelEvery === 0 || i === data.length - 1) s += `<text class="axis-t" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(String(d.label).slice(0, 10))}</text>`;
  });
  const last = data[data.length - 1];
  s += `<text class="val-t" x="${x(data.length - 1)}" y="${y(last.value) - 10}" text-anchor="end">${esc(short(last.value))}</text>`;
  return `<div class="chart">${s}</svg></div>`;
}

export function hbars(data, { fmt = num } = {}) {
  if (!data.length) return `<div class="empty">${T('Belum ada data', 'No data yet')}</div>`;
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div class="hbar">${data.map((d) => `<div class="r" data-tip="${esc(d.label + ': ' + fmt(d.value))}"><span title="${esc(d.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.label)}</span><span class="t"><span class="b" style="width:${(d.value / max) * 100}%;display:block"></span></span><b class="right">${esc(fmt(d.value))}</b></div>`).join('')}</div>`;
}

// global tooltip for charts
let tipEl;
document.addEventListener('mouseover', (e) => {
  const g = e.target.closest?.('.chart [data-tip]');
  if (!g) return;
  const chart = g.closest('.chart');
  tipEl?.remove();
  tipEl = document.createElement('div');
  tipEl.className = 'chart-tip';
  tipEl.textContent = g.dataset.tip;
  chart.appendChild(tipEl);
  $$('.bar', chart).forEach((b) => b.classList.toggle('dim', !g.contains(b)));
  const r = g.getBoundingClientRect(), cr = chart.getBoundingClientRect();
  const bar = g.querySelector('.bar,.dot');
  const br = (bar || g).getBoundingClientRect();
  tipEl.style.left = `${r.left - cr.left + r.width / 2}px`;
  tipEl.style.top = `${Math.max(14, br.top - cr.top)}px`;
});
document.addEventListener('mouseout', (e) => {
  const g = e.target.closest?.('.chart [data-tip]');
  if (!g || g.contains(e.relatedTarget)) return;
  tipEl?.remove();
  $$('.bar', g.closest('.chart')).forEach((b) => b.classList.remove('dim'));
});

// ---------------------------------------------------------------- export: CSV & XLSX (dependency-free)
function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xmlEsc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
/** cols: [{key,label,type,get}] */
export function exportXLSX(rows, cols, filename, sheetName = 'Data') {
  const val = (c, r) => (c.get ? c.get(r) : r[c.key]);
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>';
  cols.forEach((c, i) => (x += `<col min="${i + 1}" max="${i + 1}" width="${Math.min(50, Math.max(10, String(c.label).length + 4, c.type === 'money' ? 16 : 0))}" customWidth="1"/>`));
  x += '</cols><sheetData><row r="1">' + cols.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${xmlEsc(c.label)}</t></is></c>`).join('') + '</row>';
  rows.forEach((r, ri) => {
    x += `<row r="${ri + 2}">`;
    cols.forEach((c, ci) => {
      const v = val(c, r);
      const ref = `${colName(ci)}${ri + 2}`;
      if (typeof v === 'number' && Number.isFinite(v)) x += `<c r="${ref}"${c.type === 'money' ? ' s="2"' : ''}><v>${v}</v></c>`;
      else if (v !== null && v !== undefined && v !== '') x += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(typeof v === 'object' ? JSON.stringify(v) : v)}</t></is></c>`;
    });
    x += '</row>';
  });
  x += '</sheetData></worksheet>';
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: x },
  ];
  downloadBlob(zip(files), filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}
export function exportCSV(rows, cols, filename) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(c.get ? c.get(r) : r[c.key])).join(','))];
  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : filename + '.csv');
}
export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const s = text.replace(/^﻿/, '');
  const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// ---------------------------------------------------------------- misc UI snippets
export const emptyState = (text, ic = 'inbox') => `<div class="empty">${icon(ic, '', 36)}<div>${esc(text)}</div></div>`;
export const loading = () => `<div class="card"><div class="skel" style="width:40%;margin-bottom:14px"></div><div class="skel" style="margin-bottom:10px"></div><div class="skel" style="width:80%;margin-bottom:10px"></div><div class="skel" style="width:60%"></div></div>`;
export function kpi(label, value, { icon: ic = 'activity', sub = '', tone: tn = '', href } = {}) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="kpi ${tn}" ${href ? `href="${href}"` : ''}><span class="ico">${icon(ic, '', 18)}</span><span class="lbl">${esc(label)}</span><span class="val">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</${tag}>`;
}
export function avatarInitials(name) {
  return `<span class="av">${esc(initials(name))}</span>`;
}
