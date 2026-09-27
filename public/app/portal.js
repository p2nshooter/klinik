// Patient portal: home (member card, live queue), appointments, medical history, bills & payments, notifications, profile.
import { S, T, api, confirmBox, emptyState, esc, fail, fdate, fdt, fileUrl, icon, loading, modal, money, num, openDoc, pickFile, qrSvg, statusBadge, toast } from './lib.js';
import { profile as accountSecurity } from './views.js';

const APPT = [['pending', 'Menunggu konfirmasi', 'Pending'], ['confirmed', 'Terkonfirmasi', 'Confirmed'], ['checked_in', 'Sudah check-in', 'Checked in'], ['in_progress', 'Diperiksa', 'In progress'], ['completed', 'Selesai', 'Completed'], ['cancelled', 'Dibatalkan', 'Cancelled'], ['no_show', 'Tidak hadir', 'No show'], ['waitlist', 'Daftar tunggu', 'Waiting list']];
const INV = [['unpaid', 'Belum bayar', 'Unpaid'], ['partial', 'Sebagian', 'Partial'], ['paid', 'Lunas', 'Paid'], ['refunded', 'Refund', 'Refunded'], ['void', 'Batal', 'Void'], ['draft', 'Draf', 'Draft']];
const PAY = [['pending', 'Menunggu konfirmasi', 'Pending'], ['confirmed', 'Terkonfirmasi', 'Confirmed'], ['failed', 'Ditolak', 'Rejected'], ['refunded', 'Refund', 'Refunded']];
const alive = (ctx) => !ctx.stale();

function apptCard(a, actions = true) {
  const canAct = ['pending', 'confirmed', 'waitlist'].includes(a.status);
  const isToday = a.date === new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return `<div class="card"><div class="row-between"><span class="mono small">${esc(a.booking_no)}</span>${statusBadge(APPT, a.status)}</div><h3 style="margin:8px 0 2px">${fdate(a.date, true)} · ${esc(a.time)} WIB</h3><div class="small muted">${esc(a.doctor)} · ${esc(a.poli || '')}</div><div class="small">${a.type === 'telemedicine' ? `${icon('video', '', 14)} Telemedicine` : `${icon('map-pin', '', 14)} ${esc(a.branch)}`}</div>
  ${actions ? `<div class="btn-group" style="margin-top:12px">${a.meet_url ? `<a class="btn sm primary" href="${esc(a.meet_url)}" target="_blank" rel="noopener">${icon('video', '', 14)} ${T('Gabung video', 'Join video')}</a>` : ''}${canAct && isToday && a.type !== 'telemedicine' ? `<button class="btn sm primary" data-ci="${a.id}">${icon('check-circle', '', 14)} Check-in</button>` : ''}<button class="btn sm ghost" data-open="/api/public/booking/${a.booking_no}/pdf">${icon('download', '', 14)} PDF</button>${canAct ? `<button class="btn sm ghost" data-rs="${a.id}" data-doc="${esc(a.doctor_id)}" data-br="${esc(a.branch_id)}">${icon('calendar', '', 14)} ${T('Jadwal ulang', 'Reschedule')}</button><button class="btn sm ghost danger" data-cancel="${a.id}">${icon('x', '', 14)}</button>` : ''}</div>` : ''}</div>`;
}

function wireAppts(el, refresh) {
  el.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = async () => { try { const r = await api(`/api/portal/appointments/${b.dataset.ci}/checkin`, { method: 'POST', body: {} }); toast(`${T('Check-in berhasil. Nomor antrian', 'Checked in. Queue number')} ${r.queue_no}`); refresh(); } catch (e) { fail(e); } }));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox(T('Batalkan janji temu ini?', 'Cancel this appointment?'), { danger: true }))) return;
    try { await api(`/api/portal/appointments/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }); toast(T('Janji temu dibatalkan', 'Appointment cancelled')); refresh(); } catch (e) { fail(e); }
  }));
  el.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = async () => {
    const m = modal({ title: T('Jadwal ulang', 'Reschedule'), size: 'wide', body: `<div data-days>${loading()}</div><div data-slots style="margin-top:12px"></div>` });
    try {
      const { days } = await api(`/api/public/slots?doctor_id=${b.dataset.doc}&branch_id=${b.dataset.br}`);
      m.el.querySelector('[data-days]').innerHTML = `<div class="chips">${days.map((d) => `<button class="chip" data-d="${d}">${fdate(d, true)}</button>`).join('')}</div>`;
      m.el.querySelectorAll('[data-d]').forEach((c) => (c.onclick = async () => {
        m.el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === c));
        const r = await api(`/api/public/slots?doctor_id=${b.dataset.doc}&branch_id=${b.dataset.br}&date=${c.dataset.d}`);
        m.el.querySelector('[data-slots]').innerHTML = `<div class="chips">${r.slots.map((s) => `<button class="chip" data-t="${s.time}" ${s.available ? '' : 'disabled style="opacity:.4"'}>${s.time}</button>`).join('') || T('Tidak ada slot', 'No slots')}</div>`;
        m.el.querySelectorAll('[data-t]:not([disabled])').forEach((t) => (t.onclick = async () => {
          try { await api(`/api/portal/appointments/${b.dataset.rs}/reschedule`, { method: 'POST', body: { date: c.dataset.d, time: t.dataset.t } }); toast(T('Jadwal diubah', 'Rescheduled')); m.close(); refresh(); } catch (e) { fail(e); }
        }));
      }));
    } catch (e) { fail(e); }
  }));
}

export async function home(ctx) {
  ctx.title(T('Portal Pasien', 'Patient Portal'), T('Beranda', 'Home'));
  const d = await api('/api/portal/overview');
  if (!alive(ctx)) return;
  const p = d.patient;
  const h = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const greet = h < 11 ? T('Selamat pagi', 'Good morning') : h < 15 ? T('Selamat siang', 'Good afternoon') : h < 18 ? T('Selamat sore', 'Good afternoon') : T('Selamat malam', 'Good evening');
  const dot = document.querySelector('[data-notif-dot]');
  if (dot) dot.classList.toggle('hide', !d.unread);
  const q = d.today;
  const polQ = q?.snapshot?.polis?.find((x) => x.poli_id === q.poli_id);
  ctx.el.innerHTML = `${window.__installPrompt ? `<div class="install-banner">${icon('smartphone', '', 22)}<span class="grow">${T('Pasang aplikasi Global Klinik di HP Anda untuk akses cepat.', 'Install the Global Klinik app for quick access.')}</span><button class="btn sm gold" data-install>Install</button></div>` : ''}
  <div class="hello"><div><h1>${greet}, ${esc(p.name.split(' ')[0])} 👋</h1><p>${T('Semoga sehat selalu. Apa yang bisa kami bantu hari ini?', 'Wishing you good health. How can we help today?')}</p></div><div class="btn-group"><a class="btn gold" href="/booking">${icon('calendar-check', '', 16)} ${T('Booking dokter', 'Book a doctor')}</a><a class="btn" href="#/portal/visits">${icon('heart', '', 16)} ${T('Riwayat medis', 'Medical history')}</a></div></div>
  <div class="grid g3">
    <div class="member"><span class="tier">${esc(d.tier?.name || 'Member')}</span><div><div class="small" style="opacity:.8">No. Rekam Medis</div><div class="mrn">${esc(p.mrn)}</div></div><div><b>${esc(p.name)}</b><div class="small" style="opacity:.8">${num(p.points)} ${T('poin loyalitas', 'loyalty points')}${d.tier?.discount_pct ? ` · ${T('diskon', 'discount')} ${d.tier.discount_pct}%` : ''}</div></div><div class="qr" data-qr></div></div>
    ${q ? `<div class="card center"><span class="muted">${T('Nomor antrian Anda hari ini', 'Your queue number today')}</span><div class="bignum">${esc(q.queue_no)}</div>${statusBadge([['waiting', 'Menunggu', 'Waiting'], ['called', 'Dipanggil! Silakan masuk', 'Called! Please proceed'], ['serving', 'Sedang dilayani', 'Being served'], ['done', 'Selesai', 'Done']], q.queue_status)}<div class="small muted" style="margin-top:10px">${T('Sedang dipanggil', 'Now serving')}: <b>${esc(polQ?.current?.queue_no || '—')}</b> · ${polQ ? polQ.waiting : 0} ${T('menunggu', 'waiting')}</div></div>` : `<div class="card"><h3>${icon('ticket', '', 18)} ${T('Antrian digital', 'Digital queue')}</h3><p class="muted small">${T('Check-in online pada hari jadwal untuk mendapat nomor antrian tanpa antre di loket.', 'Check in online on your appointment day to get a queue number.')}</p><a class="btn sm" href="/antrian" target="_blank">${icon('monitor', '', 14)} ${T('Lihat layar antrian', 'View queue display')}</a></div>`}
    <div class="card"><h3>${icon('receipt', '', 18)} ${T('Tagihan', 'Bills')}</h3>${d.unpaid.length ? `${d.unpaid.map((i) => `<div class="row-between" style="padding:6px 0"><span class="mono small">${esc(i.invoice_no)}</span><b>${money(i.total - i.paid)}</b></div>`).join('')}<a class="btn sm primary" href="#/portal/invoices" style="margin-top:8px">${T('Bayar sekarang', 'Pay now')}</a>` : `<p class="muted small">${icon('check-circle', '', 14)} ${T('Tidak ada tagihan tertunda', 'No outstanding bills')}</p>`}</div>
  </div>
  <div class="card-h" style="margin-top:22px"><h2>${T('Janji temu mendatang', 'Upcoming appointments')}</h2><a class="btn sm" href="#/portal/appointments">${T('Semua', 'All')}</a></div>
  ${d.upcoming.length ? `<div class="grid g3" data-appts>${d.upcoming.map((a) => apptCard(a)).join('')}</div>` : `<div class="card">${emptyState(T('Belum ada janji temu. Booking dokter dalam 60 detik.', 'No upcoming appointments.'), 'calendar')}<div class="center"><a class="btn primary" href="/booking">${T('Booking sekarang', 'Book now')}</a></div></div>`}
  <div class="card-h" style="margin-top:22px"><h2>${T('Kunjungan terakhir', 'Recent visits')}</h2><a class="btn sm" href="#/portal/visits">${T('Riwayat lengkap', 'Full history')}</a></div>
  ${d.visits.length ? `<div class="card"><div class="timeline">${d.visits.map((v) => `<div class="tl-item"><b>${fdate(v.date)} · ${esc(typeof v.poli === 'object' ? v.poli?.[S.lang] || v.poli?.id : v.poli || '')}</b><span class="small muted">${esc(v.doctor || '')} · ${(v.diagnoses || []).map((x) => esc(x.name)).join(', ') || T('Menunggu hasil', 'Pending')}</span></div>`).join('')}</div></div>` : `<div class="card">${emptyState(T('Belum ada kunjungan', 'No visits yet'), 'heart')}</div>`}`;
  ctx.el.querySelector('[data-qr]').innerHTML = await qrSvg(p.mrn, 74);
  const appts = ctx.el.querySelector('[data-appts]');
  if (appts) wireAppts(appts, () => ctx.refresh());
  ctx.el.querySelector('[data-install]')?.addEventListener('click', () => window.__installPrompt?.prompt());
}

export async function appointments(ctx) {
  ctx.title(T('Janji Temu', 'Appointments'), T('Portal Pasien', 'Patient Portal'));
  const { rows } = await api('/api/portal/appointments');
  if (!alive(ctx)) return;
  ctx.el.innerHTML = `<div class="toolbar"><span class="grow"></span><a class="btn primary" href="/booking">${icon('plus', '', 16)} ${T('Booking baru', 'New booking')}</a></div>${rows.length ? `<div class="grid g3">${rows.map((a) => apptCard(a)).join('')}</div>` : `<div class="card">${emptyState(T('Belum ada janji temu', 'No appointments'), 'calendar')}</div>`}`;
  wireAppts(ctx.el, () => ctx.refresh());
}

export async function visits(ctx) {
  ctx.title(T('Riwayat Medis', 'Medical History'), T('Portal Pasien', 'Patient Portal'));
  const d = await api('/api/portal/visits');
  if (!alive(ctx)) return;
  const nm = (v) => (v && typeof v === 'object' ? v[S.lang] || v.id : v || '');
  ctx.el.innerHTML = `<div class="alert" style="margin-bottom:14px">${icon('lock', '', 18)} ${T('Data medis Anda bersifat rahasia dan hanya dapat diakses oleh Anda serta tenaga kesehatan yang berwenang.', 'Your medical data is confidential and accessible only to you and authorised clinicians.')}</div>
  ${d.rows.length ? `<div class="stack">${d.rows.map((v) => `<div class="card"><div class="row-between"><div><h3 style="margin:0">${fdate(v.date, true)}</h3><span class="small muted">${esc(nm(v.poli))} · ${esc(v.doctor || '')} · ${esc(v.branch || '')}</span></div><div class="btn-group">${v.record ? `<button class="btn sm" data-open="/api/docs/record/${v.id}">${icon('download', '', 14)} ${T('Resume medis', 'Medical summary')}</button>` : `<span class="badge warn">${T('Dalam proses', 'In progress')}</span>`}</div></div>
    ${v.record ? `<div class="grid g2" style="margin-top:12px"><div><div class="small muted" style="font-weight:700">${T('DIAGNOSIS', 'DIAGNOSIS')}</div>${(v.record.diagnoses || []).map((x) => `<div>${esc(x.name)} <span class="tiny faint mono">${esc(x.code)}</span></div>`).join('') || '-'}</div><div><div class="small muted" style="font-weight:700">${T('TERAPI & SARAN', 'THERAPY & ADVICE')}</div><div class="small">${esc(v.record.therapy || v.record.plan || '-')}</div></div></div>` : ''}
    ${v.prescriptions.length ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:700">${T('RESEP', 'PRESCRIPTIONS')}</div>${v.prescriptions.map((r) => `<div class="row-between small" style="padding:4px 0"><span>${(r.items || []).map((i) => `${esc(i.name)} (${esc(i.dose || '')})`).join('; ')}</span><button class="btn sm ghost" data-open="/api/docs/prescription/${r.id}">${icon('download', '', 14)}</button></div>`).join('')}</div>` : ''}
    ${v.labs.length ? `<div style="margin-top:12px"><div class="small muted" style="font-weight:700">${T('HASIL LAB', 'LAB RESULTS')}</div>${v.labs.map((l) => l.ready ? `<div class="tbl-wrap" style="margin-top:6px"><table class="tbl"><tbody>${l.tests.map((t) => `<tr><td>${esc(t.name)}</td><td class="num"><b style="${t.flag ? 'color:var(--bad)' : ''}">${esc(t.result || '-')} ${esc(t.unit || '')}</b></td><td class="small muted">${esc(t.ref || '')}</td><td>${t.flag ? `<span class="badge bad">${esc(t.flag)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div><button class="btn sm ghost" style="margin-top:6px" data-open="/api/docs/lab/${l.id}">${icon('download', '', 14)} PDF ${esc(l.lab_no)}</button>` : `<div class="small"><span class="badge warn">${esc(l.lab_no)} · ${T('hasil belum tersedia', 'results pending')}</span></div>`).join('')}</div>` : ''}
    ${v.documents.length ? `<div style="margin-top:12px">${v.documents.map((x) => `<a class="btn sm" href="${fileUrl(x.file)}" target="_blank" rel="noopener">${icon('paperclip', '', 14)} ${esc(x.title)}</a>`).join(' ')}</div>` : ''}</div>`).join('')}</div>` : `<div class="card">${emptyState(T('Belum ada riwayat kunjungan', 'No visit history yet'), 'heart')}</div>`}
  ${d.documents.length ? `<div class="card" style="margin-top:16px"><h3>${T('Dokumen lain', 'Other documents')}</h3>${d.documents.map((x) => `<a class="row-between" href="${fileUrl(x.file)}" target="_blank" rel="noopener"><span>${icon('paperclip', '', 14)} ${esc(x.title)}</span><span class="small muted">${fdate(x.created_at)}</span></a>`).join('')}</div>` : ''}`;
}

export async function invoices(ctx) {
  ctx.title(T('Tagihan & Pembayaran', 'Bills & Payments'), T('Portal Pasien', 'Patient Portal'));
  const d = await api('/api/portal/invoices');
  if (!alive(ctx)) return;
  ctx.el.innerHTML = d.rows.length ? `<div class="stack">${d.rows.map((i) => `<div class="card"><div class="row-between"><div><b class="mono">${esc(i.invoice_no)}</b><div class="small muted">${fdate(i.date)} · ${(i.items || []).length} item</div></div><div class="right">${statusBadge(INV, i.status)}<div class="bignum" style="font-size:1.5rem;margin-top:4px">${money(i.total)}</div>${i.paid > 0 && i.paid < i.total ? `<div class="small">${T('Sisa', 'Due')} <b style="color:var(--bad)">${money(i.total - i.paid)}</b></div>` : ''}</div></div>
    <details style="margin-top:10px"><summary class="small" style="cursor:pointer">${T('Lihat rincian', 'View details')}</summary><table class="tbl" style="margin-top:8px"><tbody>${(i.items || []).map((it) => `<tr><td>${esc(it.name)}</td><td class="num">${num(it.qty)} × ${money(it.price)}</td></tr>`).join('')}</tbody></table></details>
    ${i.payments.length ? `<div style="margin-top:10px">${i.payments.map((p) => `<div class="row-between small" style="padding:4px 0"><span>${esc(p.payment_no)} · ${fdate(p.date)} · ${esc(p.method)}</span><span class="row">${statusBadge(PAY, p.status)} <b>${money(p.amount)}</b>${p.status === 'confirmed' ? `<button class="btn sm ghost" data-open="/api/docs/receipt/${p.id}">${icon('receipt', '', 14)}</button>` : ''}</span></div>`).join('')}</div>` : ''}
    <div class="btn-group" style="margin-top:12px"><button class="btn sm" data-open="/api/docs/invoice/${i.id}">${icon('download', '', 14)} Invoice PDF</button>${['unpaid', 'partial'].includes(i.status) ? `<button class="btn sm primary" data-pay="${i.id}" data-due="${i.total - i.paid}">${icon('wallet', '', 14)} ${T('Bayar', 'Pay')}</button>` : ''}</div></div>`).join('')}</div>` : `<div class="card">${emptyState(T('Belum ada tagihan', 'No bills yet'), 'receipt')}</div>`;
  ctx.el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => {
    const due = Number(b.dataset.due);
    const m = modal({
      title: T('Pembayaran', 'Payment'), size: 'wide',
      body: `<div class="grid g2"><div class="stack"><div class="total-box"><div><span>${T('Total dibayar', 'Amount due')}</span><span class="big">${money(due)}</span></div></div>
      ${d.gateway ? `<button class="btn primary lg block" data-gw>${icon('wallet', '', 18)} ${T('Bayar online (VA, e-wallet, QRIS, kartu)', 'Pay online (VA, e-wallet, QRIS, card)')}</button><div class="center small muted">${T('atau transfer manual', 'or manual transfer')}</div>` : ''}
      <div><div class="small muted" style="font-weight:700">${T('TRANSFER KE', 'TRANSFER TO')}</div>${d.banks.map((bk) => `<div class="row-between" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span><b>${esc(bk.bank)}</b> · <span class="mono">${esc(bk.number)}</span><div class="tiny muted">a.n. ${esc(bk.holder)}</div></span><button class="btn sm ghost" data-copy="${esc(bk.number)}">${icon('copy', '', 14)}</button></div>`).join('')}</div></div>
      <div class="stack">${d.qris ? `<div class="center"><div class="small muted" style="font-weight:700">QRIS</div><img src="${esc(d.qris)}" alt="QRIS" style="max-width:200px;margin:8px auto;border-radius:12px"></div>` : ''}<label class="f">${T('Jumlah ditransfer', 'Amount transferred')}<input type="number" data-amt value="${due}"></label><label class="f">${T('Metode', 'Method')}<select data-m><option value="transfer">Transfer bank</option><option value="qris">QRIS</option></select></label><label class="f">${T('No. referensi (opsional)', 'Reference (optional)')}<input data-ref></label><button class="btn" data-proof>${icon('upload', '', 16)} ${T('Unggah bukti transfer', 'Upload transfer proof')}</button><div data-fn class="small muted"></div></div></div>`,
      actions: [{ label: T('Tutup', 'Close') }, { label: T('Kirim bukti pembayaran', 'Submit payment proof'), cls: 'primary', onClick: async (el) => {
        if (!el._file) throw new Error(T('Unggah bukti transfer terlebih dahulu', 'Upload the transfer proof first'));
        const fd = new FormData();
        fd.append('file', el._file);
        fd.append('amount', el.querySelector('[data-amt]').value);
        fd.append('method', el.querySelector('[data-m]').value);
        fd.append('reference', el.querySelector('[data-ref]').value);
        await api(`/api/portal/invoices/${b.dataset.pay}/proof`, { method: 'POST', form: fd });
        toast(T('Bukti terkirim. Kasir akan mengonfirmasi pembayaran Anda.', 'Proof submitted. Our cashier will confirm your payment.'));
        ctx.refresh();
      } }],
    });
    m.el.querySelector('[data-proof]').onclick = async () => { const f = await pickFile('image/*,application/pdf'); if (f) { m.el._file = f; m.el.querySelector('[data-fn]').textContent = `✓ ${f.name}`; } };
    m.el.querySelectorAll('[data-copy]').forEach((c) => (c.onclick = () => { navigator.clipboard?.writeText(c.dataset.copy); toast(T('Disalin', 'Copied')); }));
    m.el.querySelector('[data-gw]')?.addEventListener('click', async () => { try { const r = await api(`/api/billing/invoices/${b.dataset.pay}/gateway`, { method: 'POST' }); location.href = r.redirect_url; } catch (e) { fail(e); } });
  }));
}

export async function notifications(ctx) {
  ctx.title(T('Notifikasi', 'Notifications'), T('Portal Pasien', 'Patient Portal'));
  const { rows } = await api('/api/portal/notifications');
  if (!alive(ctx)) return;
  ctx.el.innerHTML = rows.length ? `<div class="stack">${rows.map((n) => `<div class="card" style="${n.read ? '' : 'border-color:var(--primary);background:var(--primary-50)'}"><div class="row-between"><b>${esc(n.title)}</b><span class="tiny muted">${fdt(n.at)}</span></div><p class="small" style="white-space:pre-line;margin:6px 0 0">${esc(n.body)}</p></div>`).join('')}</div>` : `<div class="card">${emptyState(T('Belum ada notifikasi', 'No notifications'), 'bell')}</div>`;
  if (rows.some((n) => !n.read)) api('/api/portal/notifications/read', { method: 'POST' }).then(() => document.querySelector('[data-notif-dot]')?.classList.add('hide')).catch(() => {});
}

export async function profile(ctx) {
  ctx.title(T('Profil & Keamanan', 'Profile & Security'), T('Portal Pasien', 'Patient Portal'));
  const d = await api('/api/portal/overview');
  if (!alive(ctx)) return;
  const p = d.patient;
  const f = (k, label, type = 'text') => `<label class="f">${label}<input name="${k}" type="${type}" value="${esc(p[k] || '')}"></label>`;
  ctx.el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>${icon('user', '', 20)} ${T('Data diri', 'Personal details')}</h2><button class="btn sm" data-open="/api/docs/card/${p.id}">${icon('id-card', '', 14)} ${T('Unduh kartu pasien', 'Download patient card')}</button></div>
  <form data-pf><div class="form-grid"><label class="f">${T('Nama', 'Name')}<input value="${esc(p.name)}" disabled></label><label class="f">No. RM<input value="${esc(p.mrn)}" disabled></label>${f('nik', 'NIK')}${f('birth_date', T('Tanggal lahir', 'Date of birth'), 'date')}${f('phone', T('No. HP', 'Phone'), 'tel')}${f('email', 'Email', 'email')}${f('address', T('Alamat', 'Address'))}${f('city', T('Kota', 'City'))}${f('bpjs_no', T('No. BPJS', 'BPJS no.'))}${f('insurance_no', T('No. asuransi', 'Insurance no.'))}${f('guardian_name', T('Kontak darurat', 'Emergency contact'))}${f('guardian_phone', T('HP kontak darurat', 'Emergency phone'), 'tel')}<label class="f" style="grid-column:1/-1">${T('Alergi', 'Allergies')}<textarea name="allergies" rows="2">${esc(p.allergies || '')}</textarea></label></div>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary">${icon('check', '', 16)} ${T('Simpan', 'Save')}</button></div></form>
  <p class="small muted">${T('Kode referral Anda', 'Your referral code')}: <b class="mono">${esc(p.referral_code || '-')}</b> — ${T('ajak keluarga & teman, dapatkan poin.', 'invite friends & family to earn points.')}</p></div><div data-sec></div>`;
  ctx.el.querySelector('[data-pf]').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/portal/profile', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast(T('Profil tersimpan', 'Profile saved')); } catch (err) { fail(err); }
  };
  const sub = { ...ctx, el: ctx.el.querySelector('[data-sec]'), title: () => {} };
  await accountSecurity(sub);
}
