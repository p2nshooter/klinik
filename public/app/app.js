// Global Klinik app shell: session bootstrap, role-aware navigation, hash router.
import { $, $$, B, L, S, T, active, api, can, canAny, debounce, esc, fail, icon, logoMark, sorted } from './lib.js';
import * as Admin from './admin.js';
import * as Clinic from './clinic.js';
import * as Portal from './portal.js';
import * as Views from './views.js';

const ROUTES = [
  ['login', Views.login, { bare: true, public: true }],
  ['register', Views.register, { bare: true, public: true }],
  ['setup', Views.setup, { bare: true, public: true }],
  ['dashboard', Clinic.dashboard],
  ['queue', Clinic.queue],
  ['doctor', Clinic.doctor],
  ['exam/:id', Clinic.exam],
  ['lab', Clinic.lab],
  ['pharmacy', Clinic.pharmacy],
  ['pharmacy/:tab', Clinic.pharmacy],
  ['cashier', Clinic.cashier],
  ['cashier/:id', Clinic.invoice],
  ['patients/:id', Clinic.patient360],
  ['data/:entity', Admin.list],
  ['data/:entity/new', Admin.form],
  ['data/:entity/:id', Admin.form],
  ['settings', Admin.settings],
  ['media', Admin.media],
  ['reports', Admin.reports],
  ['reports/:type', Admin.report],
  ['system', Admin.system],
  ['blueprint', Views.blueprint],
  ['profile', Views.profile],
  ['portal', Portal.home],
  ['portal/appointments', Portal.appointments],
  ['portal/visits', Portal.visits],
  ['portal/invoices', Portal.invoices],
  ['portal/notifications', Portal.notifications],
  ['portal/profile', Portal.profile],
];

function match(path) {
  for (const [pattern, view, opts] of ROUTES) {
    const ps = pattern.split('/'), xs = path.split('/');
    if (ps.length !== xs.length) continue;
    const params = {};
    if (ps.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(xs[i])), true) : p === xs[i]))) return { view, params, opts: opts || {} };
  }
  return null;
}

function staffNav() {
  const groups = [
    [T('Pelayanan Harian', 'Daily Operations'), [
      ['dashboard', 'home', T('Dashboard', 'Dashboard'), can('dashboard:view')],
      ['queue', 'ticket', T('Pendaftaran & Antrian', 'Registration & Queue'), canAny('clinic:register', 'queue:call')],
      ['doctor', 'stethoscope', T('Pemeriksaan Dokter', 'Doctor Workspace'), can('clinic:examine')],
      ['lab', 'flask', T('Laboratorium', 'Laboratory'), can('lab:process')],
      ['pharmacy', 'pill', T('Farmasi & Stok', 'Pharmacy & Stock'), canAny('pharmacy:dispense', 'pharmacy:stock', 'pharmacy:sale')],
      ['cashier', 'wallet', T('Kasir & Pembayaran', 'Cashier'), can('billing:cashier')],
      ['reports', 'chart', T('Laporan & Analitik', 'Reports'), can('reports:view')],
    ]],
  ];
  const ents = S.meta?.entities || {};
  for (const [g, gid, gen] of S.meta?.groups || []) {
    const items = Object.entries(ents)
      .filter(([n, e]) => e.group === g && !e.single && can(`${n}:view`))
      .map(([n, e]) => [`data/${n}`, e.icon || 'list', L(e.label), true]);
    if (g === 'system') {
      if (can('settings:update')) items.unshift(['settings', 'settings', T('Pengaturan Klinik', 'Clinic Settings'), true]);
      if (can('media:manage')) items.push(['media', 'image', T('Media (R2)', 'Media (R2)'), true]);
      if (canAny('system:backup', 'system:satusehat', 'settings:update')) items.push(['system', 'database', T('Sistem & Backup', 'System & Backup'), true]);
    }
    if (items.length) groups.push([S.lang === 'en' ? gen : gid, items]);
  }
  groups.push([T('Bantuan', 'Help'), [['blueprint', 'file', 'Blueprint & Panduan', true], ['profile', 'user', T('Akun Saya', 'My Account'), true]]]);
  return groups;
}

function patientNav() {
  return [[T('Portal Pasien', 'Patient Portal'), [
    ['portal', 'home', T('Beranda', 'Home'), true],
    ['/booking', 'calendar-check', T('Booking Dokter', 'Book a Doctor'), true],
    ['portal/appointments', 'calendar', T('Janji Temu', 'Appointments'), true],
    ['portal/visits', 'heart', T('Riwayat Medis', 'Medical History'), true],
    ['portal/invoices', 'receipt', T('Tagihan & Pembayaran', 'Bills & Payments'), true],
    ['portal/notifications', 'bell', T('Notifikasi', 'Notifications'), true],
    ['portal/profile', 'user', T('Profil & Keamanan', 'Profile & Security'), true],
  ]]];
}

function shell() {
  const u = S.user;
  const isPatient = u.role === 'patient';
  document.body.classList.toggle('is-patient', isPatient);
  const nav = (isPatient ? patientNav() : staffNav())
    .map(([g, items]) => {
      const vis = items.filter((i) => i[3]);
      if (!vis.length) return '';
      return `<div class="side-group"><span>${esc(g)}</span>${vis.map(([r, ic, label]) => `<a href="${r.startsWith('/') ? r : '#/' + r}" data-r="${r}">${icon(ic, '', 18)}<span>${esc(label)}</span></a>`).join('')}</div>`;
    })
    .join('');
  const branches = sorted(active(B().branches));
  const branchSel = !isPatient && !u.branch_id && branches.length > 1 ? `<div class="side-branch"><select data-branch aria-label="Cabang"><option value="">${T('Semua cabang (pusat)', 'All branches (HQ)')}</option>${branches.map((b) => `<option value="${b.id}" ${S.branch === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>` : u.branch_id ? `<div class="side-branch"><select disabled><option>${esc(B().branches?.find((b) => b.id === u.branch_id)?.name || u.branch_id)}</option></select></div>` : '';
  document.getElementById('app').innerHTML = `<div class="shell">
  <aside class="side"><a class="side-brand" href="#/${u.home || 'dashboard'}">${logoMark(38, 'sb')}<span><b>Global <i>Klinik</i></b><small>${isPatient ? T('Portal Pasien', 'Patient Portal') : 'Digital Clinic Platform'}</small></span></a>
  ${branchSel}<nav class="side-nav">${nav}</nav>
  <div class="side-foot"><div class="who"><b>${esc(u.name)}</b><small>${esc(u.role_name || u.role)}${u.doctor ? ' · ' + esc(u.doctor) : ''}</small></div><button class="icon-btn" data-logout title="${T('Keluar', 'Sign out')}" style="background:transparent;color:#c4d3de;border-color:rgba(255,255,255,.12)">${icon('logout', '', 18)}</button></div></aside>
  <div class="scrim" data-scrim></div>
  <div class="main"><header class="top"><button class="icon-btn menu-btn" data-menu aria-label="Menu">${icon('menu', '', 20)}</button><div style="min-width:0"><div class="crumb" data-crumb></div><h1 data-title>…</h1></div>
  ${!isPatient && can('patients:view') ? `<div class="top-search">${icon('search', '', 16)}<input type="search" placeholder="${T('Cari pasien (nama, No. RM, NIK, HP)…', 'Search patient (name, MRN, ID, phone)…')}" data-gsearch aria-label="Cari pasien"><div class="search-pop hide" data-gpop></div></div>` : '<div style="margin-left:auto"></div>'}
  <a class="icon-btn" href="/" target="_blank" rel="noopener" title="${T('Buka website', 'Open website')}">${icon('globe', '', 18)}</a>
  <button class="icon-btn" data-lang title="Bahasa / Language"><b style="font-size:.72rem">${S.lang === 'en' ? 'ID' : 'EN'}</b></button>
  <button class="icon-btn" data-theme title="Dark / Light">${icon('moon', '', 18)}</button>
  ${isPatient ? `<a class="icon-btn" href="#/portal/notifications" title="${T('Notifikasi', 'Notifications')}">${icon('bell', '', 18)}<span class="dot hide" data-notif-dot></span></a>` : ''}
  </header><section class="content" id="view"></section></div></div>
  ${isPatient ? `<nav class="bottom-nav">${[['portal', 'home', T('Beranda', 'Home')], ['/booking', 'calendar-check', 'Booking'], ['portal/visits', 'heart', T('Riwayat', 'History')], ['portal/invoices', 'receipt', T('Tagihan', 'Bills')], ['portal/profile', 'user', T('Akun', 'Account')]].map(([r, ic, l]) => `<a href="${r.startsWith('/') ? r : '#/' + r}" data-r="${r}">${icon(ic, '', 22)}<span>${l}</span></a>`).join('')}</nav>` : ''}`;
  wireShell();
}

function wireShell() {
  const root = document.getElementById('app');
  root.querySelector('[data-logout]').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    S.user = null;
    location.hash = '#/login';
    boot();
  };
  root.querySelector('[data-menu]').onclick = () => document.body.classList.toggle('nav-open');
  root.querySelector('[data-scrim]').onclick = () => document.body.classList.remove('nav-open');
  root.querySelector('[data-lang]').onclick = () => {
    S.lang = S.lang === 'en' ? 'id' : 'en';
    try { localStorage.setItem('gk-lang', S.lang); } catch {}
    shell();
    render();
  };
  root.querySelector('[data-theme]').onclick = toggleTheme;
  const br = root.querySelector('[data-branch]');
  if (br) br.onchange = () => {
    S.branch = br.value;
    try { localStorage.setItem('gk-branch', S.branch); } catch {}
    render();
  };
  const gs = root.querySelector('[data-gsearch]');
  if (gs) {
    const pop = root.querySelector('[data-gpop]');
    gs.oninput = debounce(async () => {
      const qv = gs.value.trim();
      if (qv.length < 2) return pop.classList.add('hide');
      try {
        const { rows } = await api('/api/clinic/patients/search?q=' + encodeURIComponent(qv));
        pop.innerHTML = rows.length ? rows.map((p) => `<a href="#/patients/${p.id}">${icon('user', '', 16)}<span><b>${esc(p.name)}</b><br><small class="muted">${esc(p.mrn)} · ${esc(p.phone || '')} · ${esc(p.birth_date || '')}</small></span></a>`).join('') : `<div class="empty small">${T('Tidak ditemukan', 'Not found')}</div>`;
        pop.classList.remove('hide');
      } catch {}
    }, 250);
    gs.onblur = () => setTimeout(() => pop.classList.add('hide'), 200);
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('.side-nav a, .bottom-nav a')) document.body.classList.remove('nav-open');
  });
}

export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('gk-theme', next); } catch {}
}

let renderSeq = 0;
export async function render() {
  const raw = location.hash.replace(/^#\/?/, '') || '';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (!S.user) {
    const m = match(path);
    if (m?.opts.public) return runView(m, query, true);
    location.hash = '#/login';
    return;
  }
  const home = S.user.role === 'patient' ? 'portal' : S.user.home || 'dashboard';
  if (!path || path === 'login' || path === 'register' || path === 'setup') {
    location.replace('#/' + (query.next && !query.next.startsWith('login') ? query.next : home));
    return;
  }
  const m = match(path);
  if (S.user.role !== 'patient' && !S.meta) {
    try { S.meta = await api('/api/meta'); } catch (e) { if (e.status === 401) return; }
  }
  if (!document.querySelector('.shell')) shell();
  $$('.side-nav a, .bottom-nav a').forEach((a) => {
    const r = a.dataset.r;
    a.classList.toggle('on', path === r || (r !== 'portal' && path.startsWith(r + '/')) || (r.startsWith('data/') && path.startsWith(r)));
  });
  if (!m) {
    document.getElementById('view').innerHTML = `<div class="empty">${icon('help', '', 40)}<h2>${T('Halaman tidak ditemukan', 'Page not found')}</h2><a class="btn" href="#/${home}">${T('Kembali', 'Back')}</a></div>`;
    return;
  }
  return runView(m, query, false);
}

async function runView(m, query, bare) {
  const seq = ++renderSeq;
  let el;
  if (bare) {
    document.body.classList.remove('is-patient');
    document.getElementById('app').innerHTML = '<div id="view"></div>';
    el = document.getElementById('view');
  } else {
    el = document.getElementById('view');
    el.innerHTML = '<div class="card"><div class="skel" style="width:30%;margin-bottom:14px"></div><div class="skel" style="margin-bottom:10px"></div><div class="skel" style="width:70%"></div></div>';
    window.scrollTo(0, 0);
  }
  const ctx = {
    el, params: m.params, query,
    title(t, crumb = '') {
      const h = document.querySelector('[data-title]');
      if (h) h.textContent = t;
      const c = document.querySelector('[data-crumb]');
      if (c) c.textContent = crumb;
      document.title = `${t} — Global Klinik`;
    },
    stale: () => seq !== renderSeq,
    refresh: () => render(),
  };
  try {
    await m.view(ctx);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e.status === 401) return;
    el.innerHTML = `<div class="card"><div class="alert bad">${icon('alert', '', 18)} ${esc(e.message)}</div><div style="margin-top:12px"><button class="btn" onclick="location.reload()">${icon('refresh', '', 16)} ${T('Muat ulang', 'Reload')}</button></div></div>`;
  }
}

export async function boot() {
  try {
    const { user } = await api('/api/auth/me');
    S.user = user;
    if (user.role !== 'patient') S.meta = await api('/api/meta');
  } catch (e) {
    S.user = null;
    if (e.status !== 401) {
      // offline or server error: show message in login screen
    }
    try {
      const st = await api('/api/auth/setup');
      if (st.needed) {
        location.hash = '#/setup';
      }
    } catch {}
  }
  if (S.user && !document.querySelector('.shell')) shell();
  render();
}

window.addEventListener('hashchange', render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  document.dispatchEvent(new Event('gk-installable'));
});
export { fail };
boot();
