// Auth screens, account/security, blueprint viewer.
import { $, S, T, api, confirmBox, esc, fail, icon, logoMark, markdown, qrSvg, toast } from './lib.js';
import { boot, toggleTheme } from './app.js';

function authLayout(title, sub, form) {
  return `<div class="auth">
  <section class="auth-art"><a class="brand" href="/" style="color:#fff">${logoMark(46, 'au')}<span>Global <i>Klinik</i></span></a>
  <div><h1>${T('Platform klinik digital, <em>dalam satu genggaman.</em>', 'Your digital clinic platform, <em>in one place.</em>')}</h1>
  <ul><li>${icon('calendar-check', '', 20)} ${T('Booking, antrian & check-in QR real-time', 'Real-time booking, queue & QR check-in')}</li><li>${icon('heart', '', 20)} ${T('Rekam medis elektronik (SOAP) terintegrasi', 'Integrated electronic medical records (SOAP)')}</li><li>${icon('pill', '', 20)} ${T('Farmasi, stok FEFO, kasir & invoice PDF', 'Pharmacy, FEFO stock, cashier & PDF invoices')}</li><li>${icon('shield', '', 20)} ${T('Aman: 2FA, enkripsi, audit log, multi-cabang', 'Secure: 2FA, encryption, audit log, multi-branch')}</li></ul></div>
  <small style="color:#9fb3c2">© ${new Date().getFullYear()} Global Klinik · <a href="/" style="color:#7ee0d3">${T('Kembali ke website', 'Back to website')}</a></small><span class="ring"></span></section>
  <section class="auth-form"><div class="box"><div class="row-between" style="margin-bottom:18px"><span></span><div class="row"><button class="icon-btn" data-lang><b style="font-size:.72rem">${S.lang === 'en' ? 'ID' : 'EN'}</b></button><button class="icon-btn" data-theme>${icon('moon', '', 18)}</button></div></div>
  <h2>${title}</h2><p class="muted">${sub}</p>${form}</div></section></div>`;
}

function wireAuthTop(ctx, el) {
  el.querySelector('[data-lang]').onclick = () => {
    S.lang = S.lang === 'en' ? 'id' : 'en';
    try { localStorage.setItem('gk-lang', S.lang); } catch {}
    ctx.refresh();
  };
  el.querySelector('[data-theme]').onclick = toggleTheme;
  el.querySelectorAll('.pw button').forEach((b) => (b.onclick = () => {
    const i = b.previousElementSibling;
    i.type = i.type === 'password' ? 'text' : 'password';
  }));
}

export async function login(ctx) {
  ctx.el.innerHTML = authLayout(T('Selamat datang kembali', 'Welcome back'), T('Masuk untuk staf klinik maupun pasien.', 'Sign in for clinic staff and patients.'), `
  <form class="stack" data-f autocomplete="on">
    <label class="f">${T('Username / Email / No. HP', 'Username / Email / Phone')}<input name="username" required autocomplete="username" autocapitalize="none" autofocus></label>
    <label class="f">Password<div class="pw"><input name="password" type="password" required autocomplete="current-password"><button type="button" aria-label="Show">${icon('eye', '', 18)}</button></div></label>
    <label class="f hide" data-otp>${T('Kode 2FA (6 digit dari aplikasi authenticator)', '2FA code (6 digits)')}<input name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
    <div class="alert bad hide" data-err></div>
    <button class="btn primary lg block" type="submit">${icon('login', '', 18)} ${T('Masuk', 'Sign in')}</button>
    <p class="muted center small">${T('Pasien baru?', 'New patient?')} <a href="#/register">${T('Buat akun pasien', 'Create a patient account')}</a></p>
  </form>
  <div class="quick"><a href="/booking">${icon('calendar-check', '', 22)}${T('Booking', 'Booking')}</a><a href="/cek-booking">${icon('ticket', '', 22)}${T('Cek booking', 'Check booking')}</a><a href="/antrian">${icon('monitor', '', 22)}${T('Antrian', 'Queue')}</a></div>`);
  wireAuthTop(ctx, ctx.el);
  document.title = 'Masuk — Global Klinik';
  const f = ctx.el.querySelector('[data-f]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    const err = f.querySelector('[data-err]');
    btn.classList.add('busy');
    err.classList.add('hide');
    try {
      const body = Object.fromEntries(new FormData(f));
      const r = await api('/api/auth/login', { method: 'POST', body });
      if (r.need_otp) {
        f.querySelector('[data-otp]').classList.remove('hide');
        f.otp.focus();
        toast(T('Masukkan kode 2FA', 'Enter your 2FA code'));
        return;
      }
      const next = ctx.query.next;
      if (next && next.startsWith('/')) return (location.href = next);
      document.getElementById('app').innerHTML = '';
      S.user = null;
      S.meta = null;
      history.replaceState(null, '', '#/' + (next || (r.user.role === 'patient' ? 'portal' : r.user.home || 'dashboard')));
      await boot();
    } catch (e2) {
      err.textContent = e2.message;
      err.classList.remove('hide');
    } finally {
      btn.classList.remove('busy');
    }
  };
}

export async function register(ctx) {
  ctx.el.innerHTML = authLayout(T('Buat akun pasien', 'Create patient account'), T('Akses riwayat medis, hasil lab, invoice, dan booking lebih cepat.', 'Access records, lab results, invoices and faster booking.'), `
  <form class="stack" data-f>
    <label class="f"><span class="req">${T('Nama lengkap', 'Full name')}</span><input name="name" required autocomplete="name"></label>
    <div class="form-grid"><label class="f"><span class="req">${T('No. HP / WhatsApp', 'Phone / WhatsApp')}</span><input name="phone" type="tel" required autocomplete="tel" placeholder="08xxxxxxxxxx"></label><label class="f">Email<input name="email" type="email" autocomplete="email"></label></div>
    <div class="form-grid"><label class="f">${T('Tanggal lahir', 'Date of birth')}<input name="birth_date" type="date"></label><label class="f">${T('Jenis kelamin', 'Gender')}<select name="gender"><option value="">-</option><option value="L">${T('Laki-laki', 'Male')}</option><option value="P">${T('Perempuan', 'Female')}</option></select></label></div>
    <label class="f"><span class="req">Password</span><div class="pw"><input name="password" type="password" required minlength="8" autocomplete="new-password"><button type="button">${icon('eye', '', 18)}</button></div><span class="help">${T('Minimal 8 karakter, kombinasi huruf & angka', 'Min. 8 characters with letters & numbers')}</span></label>
    <label class="f">${T('Kode referral (opsional)', 'Referral code (optional)')}<input name="referral" style="text-transform:uppercase"></label>
    <input name="website" class="hide" tabindex="-1" autocomplete="off">
    <div class="alert bad hide" data-err></div>
    <button class="btn primary lg block" type="submit">${icon('user', '', 18)} ${T('Daftar & masuk', 'Register & sign in')}</button>
    <p class="muted center small">${T('Sudah punya akun?', 'Already registered?')} <a href="#/login">${T('Masuk', 'Sign in')}</a></p>
  </form>`);
  wireAuthTop(ctx, ctx.el);
  const f = ctx.el.querySelector('[data-f]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector('[data-err]');
    err.classList.add('hide');
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      toast(T(`Akun dibuat. No. RM Anda ${r.mrn}`, `Account created. Your MRN is ${r.mrn}`));
      document.getElementById('app').innerHTML = '';
      history.replaceState(null, '', '#/portal');
      await boot();
    } catch (e2) {
      err.textContent = e2.message;
      err.classList.remove('hide');
    }
  };
}

export async function setup(ctx) {
  ctx.el.innerHTML = authLayout(T('Setup awal', 'Initial setup'), T('Buat akun Super Admin pertama untuk mengelola klinik.', 'Create the first Super Admin account.'), `
  <form class="stack" data-f><label class="f">Nama<input name="name" required value="Super Admin"></label><label class="f">Username<input name="username" required pattern="[a-z0-9._-]{3,32}" value="superadmin"></label><label class="f">Email<input name="email" type="email"></label><label class="f">Password<div class="pw"><input name="password" type="password" required minlength="8"><button type="button">${icon('eye', '', 18)}</button></div></label><div class="alert bad hide" data-err></div><button class="btn primary lg block">${T('Buat Super Admin', 'Create Super Admin')}</button></form>`);
  wireAuthTop(ctx, ctx.el);
  const f = ctx.el.querySelector('[data-f]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/setup', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
      document.getElementById('app').innerHTML = '';
      history.replaceState(null, '', '#/dashboard');
      await boot();
    } catch (e2) {
      const err = f.querySelector('[data-err]');
      err.textContent = e2.message;
      err.classList.remove('hide');
    }
  };
}

export async function profile(ctx) {
  ctx.title(T('Akun & Keamanan', 'Account & Security'), T('Profil', 'Profile'));
  const { user } = await api('/api/auth/me');
  ctx.el.innerHTML = `<div class="grid g2">
  <div class="card"><div class="card-h"><h2>${icon('user', '', 20)} ${T('Informasi akun', 'Account information')}</h2></div>
  <dl class="kv"><dt>Nama</dt><dd>${esc(user.name)}</dd><dt>Username</dt><dd class="mono">${esc(user.username)}</dd><dt>${T('Peran', 'Role')}</dt><dd>${esc(user.role_name)}</dd><dt>Email</dt><dd>${esc(user.email || '-')}</dd><dt>No. HP</dt><dd>${esc(user.phone || '-')}</dd><dt>2FA</dt><dd>${user.totp_enabled ? `<span class="badge ok">${T('Aktif', 'Enabled')}</span>` : `<span class="badge warn">${T('Belum aktif', 'Disabled')}</span>`}</dd></dl>
  <div class="card-f row"><button class="btn danger" data-logout-all>${icon('logout', '', 16)} ${T('Keluar dari semua perangkat', 'Sign out everywhere')}</button></div></div>
  <div class="card"><div class="card-h"><h2>${icon('lock', '', 20)} ${T('Ganti password', 'Change password')}</h2></div>
  <form class="stack" data-pw><label class="f">${T('Password lama', 'Current password')}<input name="old" type="password" required autocomplete="current-password"></label><label class="f">${T('Password baru', 'New password')}<input name="new" type="password" required minlength="8" autocomplete="new-password"><span class="help">${T('Minimal 8 karakter, huruf & angka', 'Min. 8 chars, letters & numbers')}</span></label><button class="btn primary">${T('Simpan password', 'Save password')}</button></form></div>
  <div class="card"><div class="card-h"><h2>${icon('shield', '', 20)} ${T('Verifikasi dua langkah (2FA)', 'Two-factor authentication')}</h2></div><div data-2fa>
  ${user.totp_enabled ? `<p>${T('2FA aktif. Setiap login memerlukan kode dari aplikasi authenticator.', '2FA is enabled.')}</p><button class="btn danger" data-2fa-off>${T('Nonaktifkan 2FA', 'Disable 2FA')}</button>` : `<p class="muted">${T('Lindungi akun dengan Google Authenticator / Authy / Microsoft Authenticator.', 'Protect your account with an authenticator app.')}</p><button class="btn primary" data-2fa-on>${icon('qr', '', 16)} ${T('Aktifkan 2FA', 'Enable 2FA')}</button>`}</div></div>
  <div class="card"><div class="card-h"><h2>${icon('smartphone', '', 20)} ${T('Pasang sebagai aplikasi', 'Install as an app')}</h2></div><p class="muted">${T('Global Klinik dapat di-install di HP, tablet, laptop, dan PC seperti aplikasi biasa.', 'Install Global Klinik on phone, tablet, laptop and PC.')}</p><ul class="small"><li><b>Android/Chrome</b>: ⋮ → ${T('Install aplikasi', 'Install app')}</li><li><b>iPhone/Safari</b>: ${T('Bagikan → Tambahkan ke Layar Utama', 'Share → Add to Home Screen')}</li><li><b>Windows/Mac (Chrome/Edge)</b>: ${T('ikon install di address bar', 'install icon in the address bar')}</li></ul><button class="btn gold" data-install>${icon('download', '', 16)} ${T('Install sekarang', 'Install now')}</button></div>
  </div>`;
  const el = ctx.el;
  el.querySelector('[data-pw]').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast(T('Password berhasil diganti', 'Password updated'));
      e.target.reset();
    } catch (err) { fail(err); }
  };
  el.querySelector('[data-logout-all]').onclick = async () => {
    if (!(await confirmBox(T('Keluar dari semua perangkat?', 'Sign out from all devices?')))) return;
    await api('/api/auth/logout-all', { method: 'POST' });
    location.hash = '#/login';
    location.reload();
  };
  el.querySelector('[data-install]').onclick = async () => {
    const p = window.__installPrompt;
    if (!p) return toast(T('Gunakan menu browser → Install / Tambahkan ke layar utama', 'Use the browser menu → Install'));
    p.prompt();
  };
  const on = el.querySelector('[data-2fa-on]');
  if (on) on.onclick = async () => {
    try {
      const { secret, uri } = await api('/api/auth/2fa/setup', { method: 'POST' });
      el.querySelector('[data-2fa]').innerHTML = `<ol class="small"><li>${T('Pindai QR dengan aplikasi authenticator', 'Scan the QR with your authenticator app')}</li><li>${T('Masukkan kode 6 digit untuk verifikasi', 'Enter the 6-digit code')}</li></ol><div class="row" style="align-items:flex-start"><div style="background:#fff;padding:8px;border-radius:12px">${await qrSvg(uri, 170)}</div><div class="stack grow"><label class="f">${T('Kunci manual', 'Manual key')}<input readonly value="${esc(secret)}" class="mono"></label><label class="f">${T('Kode verifikasi', 'Verification code')}<input data-code inputmode="numeric" maxlength="6"></label><button class="btn primary" data-verify>${T('Verifikasi & aktifkan', 'Verify & enable')}</button></div></div>`;
      el.querySelector('[data-verify]').onclick = async () => {
        try {
          await api('/api/auth/2fa/enable', { method: 'POST', body: { code: el.querySelector('[data-code]').value } });
          toast(T('2FA aktif', '2FA enabled'));
          ctx.refresh();
        } catch (e) { fail(e); }
      };
    } catch (e) { fail(e); }
  };
  const off = el.querySelector('[data-2fa-off]');
  if (off) off.onclick = async () => {
    const pw = await confirmBox(T('Masukkan password untuk menonaktifkan 2FA', 'Enter your password to disable 2FA'), { danger: true, input: 'Password' });
    if (!pw) return;
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: { password: pw } });
      toast(T('2FA dinonaktifkan', '2FA disabled'));
      ctx.refresh();
    } catch (e) { fail(e); }
  };
}

export async function blueprint(ctx) {
  ctx.title('Blueprint & Panduan', T('Dokumen induk proyek', 'Master project document'));
  const { markdown: md } = await api('/api/system/blueprint');
  ctx.el.innerHTML = `<div class="card"><div class="row-between" style="margin-bottom:10px"><span class="badge gold">${icon('file', '', 14)} BLUEPRINT.md</span><button class="btn sm" onclick="window.print()">${icon('printer', '', 16)} ${T('Cetak / PDF', 'Print / PDF')}</button></div><article class="prose">${markdown(md)}</article></div>`;
}
