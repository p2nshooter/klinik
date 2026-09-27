// Global Klinik website interactions: theme, menu, reveal, filters, forms, PWA install,
// booking wizard, booking lookup and the queue display (TV).
import { icon } from './icons.js';

const GK = window.GK || { lang: 'id' };
const EN = GK.lang === 'en';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (v) => (v && typeof v === 'object' ? v[GK.lang] || v.id || v.en || '' : v ?? '');
const L = (p) => (EN ? (p === '/' ? '/en' : '/en' + p) : p);
const money = (n) => 'Rp ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, EN ? ',' : '.');
const DAYS = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', 'x-gk': '1' }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (EN ? 'Something went wrong' : 'Terjadi kesalahan'));
  return data;
}

function toast(msg, action) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.fn(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), action ? 9000 : 3500);
}

// ---------------------------------------------------------------- basics
function initTheme() {
  $$('[data-theme-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('gk-theme', next); } catch {}
    })
  );
}
function initMenu() {
  const btn = $('[data-menu]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', open);
  });
  $$('#nav a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
  const hdr = $('.hdr');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  els.forEach((e, i) => { e.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`; io.observe(e); });
}
function initFilters() {
  $$('[data-filter-group]').forEach((g) => {
    const items = $$(`[data-filter-items="${g.dataset.filterGroup}"] > [data-key]`);
    g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      $$('[data-filter]', g).forEach((x) => x.classList.toggle('on', x === b));
      items.forEach((it) => (it.hidden = b.dataset.filter !== 'all' && it.dataset.key !== b.dataset.filter));
    });
  });
  const df = $('[data-doc-filters]');
  if (df) {
    const run = () => {
      const q = $('[data-f=q]', df).value.trim().toLowerCase(), poli = $('[data-f=poli]', df).value, br = $('[data-f=branch]', df).value;
      let n = 0;
      $$('[data-doc-list] .doc').forEach((c) => {
        const ok = (!q || c.dataset.name.includes(q)) && (!poli || c.dataset.poli === poli) && (!br || c.dataset.branches.split(' ').includes(br));
        c.hidden = !ok;
        if (ok) { n++; c.classList.add('in'); }
      });
      $('[data-doc-empty]').hidden = n > 0;
    };
    df.addEventListener('input', run);
  }
  $$('.tabs').forEach((tabs) => tabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    $$('[data-tab]', tabs).forEach((x) => x.classList.toggle('on', x === t));
    const scope = tabs.parentElement;
    $$('[data-tab-panel]', scope).forEach((p) => p.classList.toggle('on', p.dataset.tabPanel === t.dataset.tab));
  }));
  const sp = $('[data-sched-poli]');
  if (sp) sp.addEventListener('click', (e) => {
    const c = e.target.closest('[data-poli]');
    if (!c) return;
    $$('[data-poli]', sp).forEach((x) => x.classList.toggle('on', x === c));
    $$('.sched-tbl tbody tr[data-poli]').forEach((r) => (r.hidden = !!c.dataset.poli && r.dataset.poli !== c.dataset.poli));
  });
}
function initForms() {
  const map = { newsletter: '/api/public/newsletter', contact: '/api/public/contact', testimonial: '/api/public/testimonial' };
  $$('form[data-form]').forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('.form-msg', f);
      const btn = $('button[type=submit]', f);
      if (!f.checkValidity()) { f.reportValidity(); return; }
      btn.disabled = true;
      try {
        const res = await api(map[f.dataset.form], { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        msg.className = 'form-msg ok';
        msg.textContent = res.message || (EN ? 'Thank you! Sent successfully.' : 'Terima kasih! Berhasil terkirim.');
        f.reset();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = err.message;
      } finally { btn.disabled = false; }
    })
  );
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (!c) return;
    navigator.clipboard?.writeText(c.dataset.copy).then(() => toast(EN ? 'Copied!' : 'Disalin!'));
  });
}
function initPWA() {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  let deferred;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $$('[data-install]').forEach((b) => (b.hidden = false));
    try { if (localStorage.getItem('gk-install-dismissed')) return; } catch {}
    setTimeout(() => toast(EN ? 'Install Global Klinik on your device for quick access.' : 'Pasang aplikasi Global Klinik di perangkat Anda.', { label: EN ? 'Install' : 'Install', fn: install }), 6000);
  });
  const install = async () => {
    if (!deferred) return toast(EN ? 'Use your browser menu → Add to Home Screen' : 'Gunakan menu browser → Tambahkan ke layar utama');
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    try { localStorage.setItem('gk-install-dismissed', '1'); } catch {}
  };
  $$('[data-install]').forEach((b) => b.addEventListener('click', install));
}

// ---------------------------------------------------------------- QR (lazy)
async function qrSvg(text, size = 180) {
  const { default: qrcode } = await import('/assets/vendor/qrcode.mjs');
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const c = size / (n + 4);
  let d = '';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) d += `M${((k + 2) * c).toFixed(2)} ${((r + 2) * c).toFixed(2)}h${c.toFixed(2)}v${c.toFixed(2)}h-${c.toFixed(2)}z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0B1F33"/></svg>`;
}

function icsFile(a) {
  const dt = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
  const [h, m] = a.time.split(':').map(Number);
  const end = `${String(h + (m + 30 >= 60 ? 1 : 0)).padStart(2, '0')}:${String((m + 30) % 60).padStart(2, '0')}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Global Klinik//ID', 'BEGIN:VEVENT', `UID:${a.booking_no}@globalklinik`, `DTSTART;TZID=Asia/Jakarta:${dt(a.date, a.time)}`, `DTEND;TZID=Asia/Jakarta:${dt(a.date, end)}`, `SUMMARY:${a.doctor} — Global Klinik`, `LOCATION:${(a.type === 'telemedicine' ? a.meet_url || 'Telemedicine' : a.address || a.branch).replace(/,/g, '\\,')}`, `DESCRIPTION:No. booking ${a.booking_no}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Pengingat', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
}

// ---------------------------------------------------------------- booking wizard
async function initBooking() {
  const root = $('#booking-app');
  if (!root) return;
  const qs = new URLSearchParams(location.search);
  let data;
  try { data = await api('/api/public/booking-data'); } catch (e) { root.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  let me = null;
  try { me = (await api('/api/portal/overview')).patient; } catch {}
  const st = { step: 0, branch: qs.get('branch') || '', poli: '', service: qs.get('service') || '', doctor: qs.get('doctor') || '', type: 'offline', date: '', time: '', days: [], slots: [], coupon: qs.get('coupon') || '', form: {} };
  const svc = () => data.services.find((s) => s.id === st.service);
  const doc = () => data.doctors.find((d) => d.id === st.doctor);
  if (st.service) st.poli = svc()?.poli_id || '';
  if (st.doctor) { st.poli = doc()?.poli_id || st.poli; if (!st.branch) st.branch = doc()?.branches?.[0] || ''; }
  if (!st.branch && data.branches.length === 1) st.branch = data.branches[0].id;
  if (st.branch && (st.service || st.poli)) st.step = st.doctor ? 2 : 1;
  const stepsEl = $$('[data-steps] li');
  const priceOf = (s) => { const bp = (s.branch_prices || []).find((p) => p.branch_id === st.branch && p.price); return bp ? bp.price : s.price; };

  const render = async () => {
    stepsEl.forEach((li, i) => { li.classList.toggle('on', i === st.step); li.classList.toggle('done', i < st.step); });
    const nav = (canNext, nextLabel) => `<div class="book-nav">${st.step ? `<button class="btn btn-ghost" data-back>${icon('arrow-left', '', 16)} ${EN ? 'Back' : 'Kembali'}</button>` : '<span></span>'}${canNext !== null ? `<button class="btn btn-primary" data-next ${canNext ? '' : 'disabled'}>${nextLabel || (EN ? 'Continue' : 'Lanjut')} ${icon('arrow-right', '', 16)}</button>` : ''}</div>`;
    if (st.step === 0) {
      const polis = data.polis.filter((p) => !st.branch || !(p.branches || []).length || p.branches.includes(st.branch));
      const services = data.services.filter((s) => (!st.branch || !(s.branches || []).length || s.branches.includes(st.branch)) && (!st.poli || s.poli_id === st.poli));
      root.innerHTML = `<h2>${EN ? 'Choose a branch & service' : 'Pilih cabang & layanan'}</h2>
      <p class="muted">${EN ? 'Branch' : 'Cabang'}</p><div class="book-grid">${data.branches.map((b) => `<button class="pick ${st.branch === b.id ? 'on' : ''}" data-branch="${b.id}"><span class="svc-ic">${icon('building', '', 22)}</span><span><b>${esc(b.name)}</b><small>${esc(b.city)}</small></span></button>`).join('')}</div>
      ${st.branch ? `<p class="muted" style="margin-top:22px">${EN ? 'Clinic unit' : 'Poli'}</p><div class="chips">${polis.map((p) => `<button class="chip ${st.poli === p.id ? 'on' : ''}" data-poli="${p.id}">${icon(p.icon || 'stethoscope', '', 15)} ${esc(tr(p.name))}</button>`).join('')}</div>
      <div class="book-grid">${services.map((s) => `<button class="pick ${st.service === s.id ? 'on' : ''}" data-service="${s.id}"><span class="svc-ic">${icon(s.icon || 'stethoscope', '', 22)}</span><span><b>${esc(tr(s.name))}</b><small>${EN ? 'from' : 'mulai'} ${money(priceOf(s))}${s.telemedicine ? ' · ' + (EN ? 'Telemedicine' : 'Telemedicine') : ''}</small></span></button>`).join('')}</div>` : ''}
      ${nav(!!(st.branch && (st.service || st.poli)))}`;
    } else if (st.step === 1) {
      const poli = st.poli || svc()?.poli_id;
      const docs = data.doctors.filter((d) => (!poli || d.poli_id === poli) && (d.branches || []).includes(st.branch));
      root.innerHTML = `<h2>${EN ? 'Choose a doctor' : 'Pilih dokter'}</h2>
      <div class="book-grid">${docs.map((d) => `<button class="pick ${st.doctor === d.id ? 'on' : ''}" data-doctor="${d.id}">${d.photo ? `<img src="${esc(d.photo)}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover">` : `<span class="svc-ic">${icon('doctor', '', 22)}</span>`}<span><b>${esc(d.name)}</b><small>${esc(tr(d.specialty))}${d.consult_fee ? ' · ' + money(d.consult_fee) : ''}</small>${d.telemedicine ? `<small>${icon('video', '', 12)} Telemedicine</small>` : ''}</span></button>`).join('') || `<p class="empty">${EN ? 'No doctors available at this branch for this unit.' : 'Belum ada dokter untuk poli ini di cabang tersebut.'}</p>`}</div>
      ${nav(!!st.doctor)}`;
    } else if (st.step === 2) {
      root.innerHTML = `<h2>${EN ? 'Pick a date & time' : 'Pilih tanggal & jam'}</h2><p class="muted">${esc(doc()?.name || '')} · ${esc(data.branches.find((b) => b.id === st.branch)?.name || '')}</p>
      ${doc()?.telemedicine ? `<div class="seg" style="margin-bottom:16px"><button class="${st.type === 'offline' ? 'on' : ''}" data-type="offline">${icon('building', '', 16)} ${EN ? 'Visit clinic' : 'Datang ke klinik'}</button><button class="${st.type === 'telemedicine' ? 'on' : ''}" data-type="telemedicine">${icon('video', '', 16)} Telemedicine</button></div>` : ''}
      <div class="dates" data-dates><span class="spinner"></span></div><div data-slots></div>${nav(!!(st.date && st.time))}`;
      if (!st.days.length) { try { st.days = (await api(`/api/public/slots?doctor_id=${st.doctor}&branch_id=${st.branch}`)).days || []; } catch { st.days = []; } }
      $('[data-dates]', root).innerHTML = st.days.length ? st.days.map((d) => `<button class="date ${st.date === d ? 'on' : ''}" data-date="${d}"><small>${DAYS[dow(d)]}</small><b>${Number(d.slice(8))}</b><small>${MONTHS[Number(d.slice(5, 7)) - 1]}</small></button>`).join('') : `<p class="muted">${EN ? 'No schedule in the coming days.' : 'Tidak ada jadwal dalam beberapa hari ke depan.'}</p>`;
      if (!st.date && st.days[0]) st.date = st.days[0];
      if (st.date) { $(`[data-date="${st.date}"]`, root)?.classList.add('on'); loadSlots(); }
    } else if (st.step === 3) {
      const f = st.form;
      const pre = me || {};
      root.innerHTML = `<h2>${EN ? 'Patient details' : 'Data pasien'}</h2>${me ? `<p class="muted">${icon('check-circle', '', 16)} ${EN ? 'Signed in as' : 'Masuk sebagai'} <b>${esc(me.name)}</b> (${esc(me.mrn)})</p>` : `<p class="muted">${EN ? 'Already a patient?' : 'Sudah punya akun?'} <a href="/app/#/login?next=/booking">${EN ? 'Sign in' : 'Masuk'}</a> ${EN ? 'to auto-fill.' : 'untuk isi otomatis.'}</p>`}
      <form class="form" data-pform novalidate><div class="form-grid"><label>${EN ? 'Full name' : 'Nama lengkap'}<input name="name" required value="${esc(f.name || pre.name || '')}" autocomplete="name"></label><label>${EN ? 'Phone / WhatsApp' : 'No. HP / WhatsApp'}<input name="phone" type="tel" required value="${esc(f.phone || pre.phone || '')}" autocomplete="tel" placeholder="08xxxxxxxxxx"></label></div>
      <div class="form-grid"><label>Email<input name="email" type="email" value="${esc(f.email || pre.email || '')}" autocomplete="email"></label><label>${EN ? 'Date of birth' : 'Tanggal lahir'}<input name="birth_date" type="date" value="${esc(f.birth_date || pre.birth_date || '')}"></label></div>
      <div class="form-grid"><label>${EN ? 'Gender' : 'Jenis kelamin'}<select name="gender"><option value="">-</option><option value="L" ${(f.gender || pre.gender) === 'L' ? 'selected' : ''}>${EN ? 'Male' : 'Laki-laki'}</option><option value="P" ${(f.gender || pre.gender) === 'P' ? 'selected' : ''}>${EN ? 'Female' : 'Perempuan'}</option></select></label><label>${EN ? 'Promo code (optional)' : 'Kode promo (opsional)'}<input name="coupon" value="${esc(f.coupon || st.coupon)}" style="text-transform:uppercase"></label></div>
      <label>${EN ? 'Main complaint' : 'Keluhan utama'}<textarea name="complaint" rows="3" maxlength="1000" placeholder="${EN ? 'Describe your symptoms briefly' : 'Ceritakan keluhan Anda secara singkat'}">${esc(f.complaint || '')}</textarea></label>
      <label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input type="checkbox" name="consent" required style="width:auto;margin-top:4px" ${f.consent ? 'checked' : ''}> <span>${EN ? 'I agree to the' : 'Saya menyetujui'} <a href="${L('/syarat-ketentuan')}" target="_blank">${EN ? 'terms' : 'syarat & ketentuan'}</a> ${EN ? 'and' : 'serta'} <a href="${L('/kebijakan-privasi')}" target="_blank">${EN ? 'privacy policy' : 'kebijakan privasi'}</a>.</span></label>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off"></form>${nav(true)}`;
    } else if (st.step === 4) {
      const s = svc(), d = doc(), b = data.branches.find((x) => x.id === st.branch);
      root.innerHTML = `<h2>${EN ? 'Confirm your booking' : 'Konfirmasi booking'}</h2><div class="summary">
      <div><span>${EN ? 'Branch' : 'Cabang'}</span><b>${esc(b?.name)}</b></div><div><span>${EN ? 'Service' : 'Layanan'}</span><b>${esc(tr(s?.name) || tr(data.polis.find((p) => p.id === st.poli)?.name))}</b></div>
      <div><span>${EN ? 'Doctor' : 'Dokter'}</span><b>${esc(d?.name)}</b></div><div><span>${EN ? 'Schedule' : 'Jadwal'}</span><b>${DAYS[dow(st.date)]}, ${fmtDate(st.date)} · ${st.time} WIB</b></div>
      <div><span>${EN ? 'Type' : 'Jenis'}</span><b>${st.type === 'telemedicine' ? 'Telemedicine (video)' : EN ? 'Clinic visit' : 'Datang ke klinik'}</b></div><div><span>${EN ? 'Patient' : 'Pasien'}</span><b>${esc(st.form.name)} · ${esc(st.form.phone)}</b></div>
      ${d?.consult_fee || s ? `<div><span>${EN ? 'Estimated fee' : 'Estimasi biaya'}</span><b>${money(d?.consult_fee || priceOf(s))}</b></div>` : ''}${st.form.coupon ? `<div><span>${EN ? 'Promo' : 'Promo'}</span><b>${esc(st.form.coupon)}</b></div>` : ''}</div>
      <p class="muted small" style="margin-top:14px">${icon('info', '', 15)} ${EN ? 'Pay at the clinic or via the patient portal. Final cost follows the treatment given.' : 'Pembayaran di klinik atau via portal pasien. Biaya final mengikuti tindakan yang diberikan.'}</p>
      <p class="form-msg" data-msg></p>${nav(true, EN ? 'Confirm booking' : 'Konfirmasi booking')}`;
    }
  };

  async function loadSlots(retry) {
    const box = $('[data-slots]', root);
    if (!box) return;
    box.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await api(`/api/public/slots?doctor_id=${st.doctor}&branch_id=${st.branch}&date=${st.date}&type=${st.type}`);
      st.slots = r.slots || [];
      const avail = st.slots.filter((s) => s.available);
      box.innerHTML = st.slots.length ? `<div class="slots">${st.slots.map((s) => `<button class="slot ${st.time === s.time ? 'on' : ''}" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('')}</div>${!avail.length ? `<p class="muted" style="margin-top:12px">${EN ? 'All slots are full.' : 'Semua slot penuh.'} <button class="btn btn-ghost btn-sm" data-waitlist>${EN ? 'Join waiting list' : 'Masuk daftar tunggu'}</button></p>` : ''}` : `<p class="muted">${r.reason === 'holiday' ? (EN ? 'Closed: ' : 'Libur: ') + esc(r.holiday || '') : EN ? 'No slots' : 'Tidak ada slot'}</p>`;
    } catch (e) { box.innerHTML = `<p class="form-msg err">${esc(e.message)}</p>`; }
  }

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.branch) { st.branch = t.dataset.branch; st.doctor = ''; st.days = []; render(); }
    else if (t.dataset.poli !== undefined && t.classList.contains('chip')) { st.poli = st.poli === t.dataset.poli ? '' : t.dataset.poli; st.service = ''; render(); }
    else if (t.dataset.service) { st.service = t.dataset.service; st.poli = svc()?.poli_id || st.poli; render(); }
    else if (t.dataset.doctor) { st.doctor = t.dataset.doctor; st.days = []; st.date = ''; st.time = ''; render(); }
    else if (t.dataset.type) { st.type = t.dataset.type; st.time = ''; render(); }
    else if (t.dataset.date) { st.date = t.dataset.date; st.time = ''; $$('.date', root).forEach((x) => x.classList.toggle('on', x === t)); loadSlots(); $('[data-next]', root).disabled = true; }
    else if (t.dataset.time) { st.time = t.dataset.time; st.waitlist = false; $$('.slot', root).forEach((x) => x.classList.toggle('on', x === t)); $('[data-next]', root).disabled = false; }
    else if (t.hasAttribute('data-waitlist')) { st.time = st.slots[0]?.time || ''; st.waitlist = true; toast(EN ? 'You will be placed on the waiting list.' : 'Anda akan masuk daftar tunggu.'); $('[data-next]', root).disabled = !st.time; }
    else if (t.hasAttribute('data-back')) { st.step--; render(); scrollTo({ top: root.offsetTop - 120, behavior: 'smooth' }); }
    else if (t.hasAttribute('data-next')) {
      if (st.step === 3) {
        const f = $('[data-pform]', root);
        if (!f.checkValidity()) { f.reportValidity(); return; }
        st.form = Object.fromEntries(new FormData(f));
        st.form.consent = true;
      }
      if (st.step === 4) return submit(t);
      st.step++;
      render();
      scrollTo({ top: root.offsetTop - 120, behavior: 'smooth' });
    }
  });

  async function submit(btn) {
    btn.disabled = true;
    const msg = $('[data-msg]', root);
    try {
      const body = { branch_id: st.branch, poli_id: st.poli || svc()?.poli_id, service_id: st.service, doctor_id: st.doctor, date: st.date, time: st.time, type: st.type, waitlist: !!st.waitlist, ...st.form };
      const { appointment: a } = await api(me ? '/api/portal/appointments' : '/api/public/book', { method: 'POST', body });
      stepsEl.forEach((li) => li.classList.add('done'));
      const pdf = `/api/public/booking/${a.booking_no}/pdf?phone=${encodeURIComponent(st.form.phone)}&download=1`;
      root.innerHTML = `<div class="success"><div class="success-ic">${icon('check', '', 44)}</div><h2>${a.status === 'waitlist' ? (EN ? 'You are on the waiting list' : 'Anda masuk daftar tunggu') : EN ? 'Booking confirmed!' : 'Booking berhasil!'}</h2>
      <p class="muted">${EN ? 'Save your booking number. A confirmation has been prepared for WhatsApp/email.' : 'Simpan nomor booking Anda. Konfirmasi juga dikirim via WhatsApp/email.'}</p>
      <div class="bookno">${esc(a.booking_no)}</div><div class="qr-box" data-qr></div>
      <div class="summary" style="width:100%;max-width:460px;text-align:left"><div><span>${EN ? 'Schedule' : 'Jadwal'}</span><b>${fmtDate(a.date)} · ${a.time} WIB</b></div><div><span>${EN ? 'Doctor' : 'Dokter'}</span><b>${esc(a.doctor)}</b></div><div><span>${EN ? 'Location' : 'Lokasi'}</span><b>${a.type === 'telemedicine' ? 'Telemedicine' : esc(a.branch)}</b></div>${a.meet_url ? `<div><span>Video</span><b><a href="${esc(a.meet_url)}" target="_blank" rel="noopener">${EN ? 'Join link' : 'Link video'}</a></b></div>` : ''}</div>
      <div class="row-btns" style="justify-content:center"><a class="btn btn-primary" href="${pdf}">${icon('download', '', 16)} ${EN ? 'Download PDF' : 'Unduh PDF'}</a><a class="btn btn-ghost" href="${icsFile(a)}" download="booking-${a.booking_no}.ics">${icon('calendar', '', 16)} ${EN ? 'Add to calendar' : 'Simpan ke kalender'}</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${GK.wa}?text=${encodeURIComponent(`Halo, saya sudah booking ${a.booking_no} (${fmtDate(a.date)} ${a.time}).`)}">${icon('message', '', 16)} WhatsApp</a><a class="btn btn-ghost" href="${L('/cek-booking')}?no=${a.booking_no}">${icon('ticket', '', 16)} ${EN ? 'Manage booking' : 'Kelola booking'}</a></div>
      ${!me ? `<p class="muted small">${EN ? 'Create a patient account to see results & invoices:' : 'Buat akun pasien untuk melihat hasil & invoice:'} <a href="/app/#/register">${EN ? 'Register' : 'Daftar'}</a></p>` : ''}</div>`;
      $('[data-qr]', root).innerHTML = await qrSvg(`${location.origin}/cek-booking?no=${a.booking_no}`, 170);
      try { localStorage.setItem('gk-last-booking', JSON.stringify({ no: a.booking_no, phone: st.form.phone })); } catch {}
      scrollTo({ top: root.offsetTop - 120, behavior: 'smooth' });
    } catch (e) {
      msg.className = 'form-msg err';
      msg.textContent = e.message;
      btn.disabled = false;
    }
  }
  render();
}

// ---------------------------------------------------------------- booking lookup
function initLookup() {
  const f = $('form[data-lookup]');
  if (!f) return;
  const out = $('#lookup-result');
  try {
    const last = JSON.parse(localStorage.getItem('gk-last-booking') || 'null');
    if (last && !f.booking_no.value) { f.booking_no.value = last.no; f.phone.value = last.phone; }
    else if (last && last.no === f.booking_no.value) f.phone.value = last.phone;
  } catch {}
  let cur = null;
  const show = async (res) => {
    const a = res.appointment;
    cur = a;
    const canChange = ['pending', 'confirmed', 'waitlist'].includes(a.status);
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const statusText = { pending: EN ? 'Pending' : 'Menunggu konfirmasi', confirmed: EN ? 'Confirmed' : 'Terkonfirmasi', waitlist: EN ? 'Waiting list' : 'Daftar tunggu', checked_in: EN ? 'Checked in' : 'Sudah check-in', in_progress: EN ? 'In progress' : 'Sedang diperiksa', completed: EN ? 'Completed' : 'Selesai', cancelled: EN ? 'Cancelled' : 'Dibatalkan', no_show: EN ? 'No show' : 'Tidak hadir' }[a.status] || a.status;
    const qInfo = res.queue ? `<div class="summary"><div><span>${EN ? 'Your queue number' : 'Nomor antrian Anda'}</span><b style="font-size:1.6rem">${esc(res.queue.queue_no)}</b></div><div><span>Status</span><b>${esc(res.queue.queue_status)}</b></div></div>` : '';
    out.innerHTML = `<div class="card" style="margin-top:24px;display:grid;gap:16px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><small class="muted">${EN ? 'Booking number' : 'Nomor booking'}</small><div class="bookno" style="font-size:1.4rem">${esc(a.booking_no)}</div></div><span class="status ${a.status}">${statusText}</span></div>
    <div class="summary"><div><span>${EN ? 'Patient' : 'Pasien'}</span><b>${esc(a.name)}</b></div><div><span>${EN ? 'Schedule' : 'Jadwal'}</span><b>${fmtDate(a.date)} · ${a.time} WIB</b></div><div><span>${EN ? 'Doctor' : 'Dokter'}</span><b>${esc(a.doctor)}</b></div><div><span>${EN ? 'Location' : 'Lokasi'}</span><b>${a.type === 'telemedicine' ? 'Telemedicine' : esc(a.branch)}</b></div>${a.meet_url ? `<div><span>Video</span><b><a href="${esc(a.meet_url)}" target="_blank" rel="noopener">${EN ? 'Join video call' : 'Masuk video call'}</a></b></div>` : ''}</div>${qInfo}
    <div class="row-btns"><a class="btn btn-ghost" href="/api/public/booking/${a.booking_no}/pdf?phone=${encodeURIComponent(f.phone.value)}&download=1">${icon('download', '', 16)} PDF</a>${canChange && a.date === today && a.type !== 'telemedicine' ? `<button class="btn btn-primary" data-act="checkin">${icon('check-circle', '', 16)} ${EN ? 'Online check-in' : 'Check-in online'}</button>` : ''}${canChange ? `<button class="btn btn-ghost" data-act="resched">${icon('calendar', '', 16)} ${EN ? 'Reschedule' : 'Jadwal ulang'}</button><button class="btn btn-ghost" data-act="cancel" style="color:var(--danger)">${icon('x-circle', '', 16)} ${EN ? 'Cancel' : 'Batalkan'}</button>` : ''}</div><div data-resched></div></div>`;
  };
  const doLookup = async () => {
    const msg = $('.form-msg', f);
    msg.textContent = '';
    try { await show(await api('/api/public/booking/lookup', { method: 'POST', body: Object.fromEntries(new FormData(f)) })); }
    catch (e) { msg.className = 'form-msg err'; msg.textContent = e.message; out.innerHTML = ''; }
  };
  f.addEventListener('submit', (e) => { e.preventDefault(); doLookup(); });
  if (f.booking_no.value && f.phone.value) doLookup();
  out.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !cur) return;
    const body = { booking_no: cur.booking_no, phone: f.phone.value };
    try {
      if (b.dataset.act === 'cancel') {
        if (!confirm(EN ? 'Cancel this booking?' : 'Batalkan booking ini?')) return;
        await api('/api/public/booking/cancel', { method: 'POST', body });
        toast(EN ? 'Booking cancelled' : 'Booking dibatalkan');
        doLookup();
      } else if (b.dataset.act === 'checkin') {
        const r = await api('/api/public/booking/checkin', { method: 'POST', body });
        toast((EN ? 'Checked in! Queue number ' : 'Check-in berhasil! Nomor antrian ') + r.queue_no);
        doLookup();
      } else if (b.dataset.act === 'resched') {
        const box = $('[data-resched]', out);
        box.innerHTML = '<span class="spinner"></span>';
        const { days } = await api(`/api/public/slots?doctor_id=${cur.doctor_id}&branch_id=${cur.branch_id}`);
        box.innerHTML = `<p class="muted">${EN ? 'Choose a new date' : 'Pilih tanggal baru'}</p><div class="dates">${days.map((d) => `<button class="date" data-d="${d}"><small>${DAYS[dow(d)]}</small><b>${Number(d.slice(8))}</b><small>${MONTHS[Number(d.slice(5, 7)) - 1]}</small></button>`).join('')}</div><div data-rs></div>`;
      } else if (b.dataset.d) {
        $$('[data-d]', out).forEach((x) => x.classList.toggle('on', x === b));
        const r = await api(`/api/public/slots?doctor_id=${cur.doctor_id}&branch_id=${cur.branch_id}&date=${b.dataset.d}`);
        $('[data-rs]', out).innerHTML = `<div class="slots">${r.slots.map((s) => `<button class="slot" data-t="${s.time}" data-dd="${b.dataset.d}" ${s.available ? '' : 'disabled'}>${s.time}</button>`).join('')}</div>`;
      } else if (b.dataset.t) {
        await api('/api/public/booking/reschedule', { method: 'POST', body: { ...body, date: b.dataset.dd, time: b.dataset.t } });
        toast(EN ? 'Rescheduled!' : 'Jadwal berhasil diubah!');
        doLookup();
      }
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------- queue display
function initQueue() {
  const root = $('.qd');
  if (!root) return;
  const branch = root.dataset.branch;
  let last = '';
  let sound = false;
  const clock = () => {
    const d = new Date();
    $('[data-clock]').textContent = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    $('[data-date]').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  };
  clock();
  setInterval(clock, 10000);
  const chime = () => {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [659, 523, 784].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.35); g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + i * 0.35 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.35 + 0.6); o.start(ac.currentTime + i * 0.35); o.stop(ac.currentTime + i * 0.35 + 0.65); });
    } catch {}
  };
  const speak = (c) => {
    if (!('speechSynthesis' in window)) return;
    const num = c.queue_no.replace('-', ' ').split('').join(' ').replace(/\s+/g, ' ');
    const u = new SpeechSynthesisUtterance(`Nomor antrian, ${num}. Silakan menuju ${c.poli}.`);
    u.lang = 'id-ID';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  };
  $('[data-sound]').addEventListener('click', (e) => { sound = !sound; e.currentTarget.innerHTML = `${icon('volume', '', 18)} ${sound ? 'Suara aktif' : 'Aktifkan suara'}`; if (sound) chime(); });
  const tick = async () => {
    try {
      const d = await api(`/api/public/queue?branch=${encodeURIComponent(branch)}`);
      const top = d.called?.[0];
      const key = top ? top.queue_no + top.called_at : '';
      if (top) {
        $('[data-now]').textContent = top.queue_no;
        $('[data-now-poli]').textContent = top.poli;
        $('[data-now-doc]').textContent = top.doctor || '';
      }
      if (key && key !== last) {
        if (last) { $('[data-now]').classList.remove('flash'); void $('[data-now]').offsetWidth; $('[data-now]').classList.add('flash'); if (sound) { chime(); setTimeout(() => speak(top), 1100); } }
        last = key;
      }
      $('[data-polis]').innerHTML = (d.polis || []).map((p) => `<div class="qd-card" style="--c:${esc(p.color)}"><div><h3>${esc(tr(p.name))}</h3><div class="meta">${p.current?.doctor ? esc(p.current.doctor) + ' · ' : ''}${p.waiting} menunggu · ${p.done} selesai</div></div><div class="cur">${esc(p.current?.queue_no || '—')}</div>${p.next?.length ? `<div class="nx">Berikutnya: ${p.next.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}</div>`).join('') || '<div class="qd-card"><div><h3>Belum ada antrian hari ini</h3><div class="meta">Silakan ambil nomor di meja pendaftaran atau check-in online.</div></div></div>';
    } catch {}
  };
  tick();
  setInterval(tick, 4000);
}

// ---------------------------------------------------------------- boot
document.documentElement.classList.remove('no-js');
initTheme();
initMenu();
initReveal();
initFilters();
initForms();
initPWA();
if (GK.page === 'booking') initBooking();
if (GK.page === 'lookup') initLookup();
if (GK.page === 'queue') initQueue();
