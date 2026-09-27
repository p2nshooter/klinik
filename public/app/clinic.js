// Clinical & operational workspaces: dashboard, registration/queue, doctor, exam (EMR), lab, pharmacy, cashier, patient 360.
import { $, $$, B, S, T, active, addDays, age, api, badge, barChart, branchName, branchParam, byId, can, canAny, confirmBox, debounce, doctorName, drawer, emptyState, esc, fail, fdate, fdt, fileUrl, ftime, hbars, icon, initials, kpi, lineChart, loading, modal, money, num, openDoc, pickFile, poliName, sorted, statusBadge, today, toast, tr, uploadFile } from './lib.js';

const O = () => S.meta?.options || {};
const vBadge = (v) => statusBadge(O().visitStatus, v);
const qBadge = (v) => statusBadge(O().queueStatus, v);
const curBranch = () => branchParam() || sorted(active(B().branches))[0]?.id || '';
const PAYERS = () => O().payer || [];
const alive = (ctx) => !ctx.stale();

function branchSelect(val) {
  if (S.user.branch_id) return '';
  return `<select data-branch-local style="width:auto">${sorted(active(B().branches)).map((b) => `<option value="${b.id}" ${b.id === val ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`;
}
function vitalsChips(v) {
  if (!v) return '';
  const p = [];
  if (v.bp) p.push(`TD ${esc(v.bp)}`);
  if (v.hr) p.push(`N ${esc(v.hr)}`);
  if (v.temp) p.push(`S ${esc(v.temp)}°`);
  if (v.spo2) p.push(`SpO₂ ${esc(v.spo2)}%`);
  if (v.weight) p.push(`BB ${esc(v.weight)}kg`);
  return p.map((x) => `<span class="vital-chip">${x}</span>`).join(' ');
}

// ================================================================== DASHBOARD
export async function dashboard(ctx) {
  if (S.user.role === 'patient') return location.replace('#/portal');
  ctx.title('Dashboard', branchName(branchParam()));
  const d = await api('/api/dashboard?branch=' + encodeURIComponent(branchParam()));
  if (!alive(ctx)) return;
  const k = d.kpi;
  const h = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const greet = h < 11 ? T('Selamat pagi', 'Good morning') : h < 15 ? T('Selamat siang', 'Good afternoon') : h < 18 ? T('Selamat sore', 'Good afternoon') : T('Selamat malam', 'Good evening');
  const quick = [
    canAny('clinic:register') && `<a class="btn gold" href="#/queue">${icon('plus', '', 16)} ${T('Daftarkan pasien', 'Register patient')}</a>`,
    can('clinic:examine') && `<a class="btn" href="#/doctor">${icon('stethoscope', '', 16)} ${T('Ruang periksa', 'Exam room')}</a>`,
    can('billing:cashier') && `<a class="btn" href="#/cashier">${icon('wallet', '', 16)} ${T('Kasir', 'Cashier')}</a>`,
    `<a class="btn" href="/antrian?branch=${curBranch()}" target="_blank">${icon('monitor', '', 16)} ${T('Layar antrian', 'Queue display')}</a>`,
  ].filter(Boolean).join('');
  const series = d.series || [];
  ctx.el.innerHTML = `<div class="hello"><div><h1>${greet}, ${esc(S.user.name.split(' ')[0])} 👋</h1><p>${fdate(d.today, true)} · ${esc(branchName(d.branch))}</p></div><div class="btn-group">${quick}</div></div>
  <div class="grid g6">
    ${kpi(T('Kunjungan hari ini', 'Visits today'), num(k.visits), { icon: 'clipboard', href: '#/queue' })}
    ${kpi(T('Pasien baru', 'New patients'), num(k.patients_new), { icon: 'user', sub: `${T('Total', 'Total')} ${num(k.patients_total)}`, href: '#/data/patients' })}
    ${kpi(T('Janji temu hari ini', 'Appointments today'), num(k.appointments), { icon: 'calendar-check', sub: `+${num(k.bookings)} ${T('booking baru', 'new bookings')}`, href: '#/data/appointments' })}
    ${kpi(T('Pendapatan hari ini', 'Revenue today'), money(k.revenue), { icon: 'banknote', tone: 'gold', href: can('reports:view') ? '#/reports/revenue' : undefined })}
    ${kpi(T('Antrian menunggu', 'Waiting in queue'), num(k.queue_waiting), { icon: 'ticket', href: '#/queue' })}
    ${kpi(T('Tagihan belum lunas', 'Unpaid invoices'), num(k.unpaid_count), { icon: 'receipt', tone: k.unpaid_count ? 'warn' : '', sub: money(k.unpaid_amount), href: '#/cashier' })}
  </div>
  <div class="grid g4" style="margin-top:16px">
    ${kpi(T('Konfirmasi pembayaran', 'Payments to confirm'), num(k.pending_payments), { icon: 'wallet', tone: k.pending_payments ? 'warn' : '', href: '#/cashier' })}
    ${kpi(T('Lab menunggu', 'Lab pending'), num(k.lab_open), { icon: 'flask', href: '#/lab' })}
    ${kpi(T('Resep menunggu', 'Prescriptions pending'), num(k.rx_open), { icon: 'pill', href: '#/pharmacy' })}
    ${kpi(T('Stok menipis / hampir exp.', 'Low stock / expiring'), `${num(k.low_stock)} / ${num(k.expiring)}`, { icon: 'alert', tone: k.low_stock || k.expiring ? 'bad' : '', href: '#/pharmacy/peringatan' })}
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>${T('Kunjungan 14 hari terakhir', 'Visits — last 14 days')}</h3><span class="muted small">${num(series.reduce((a, x) => a + (x.visits || 0), 0))} ${T('kunjungan', 'visits')}</span></div>${barChart(series.map((x) => ({ label: fdate(x.date).slice(0, 6), value: x.visits || 0 })), { labelEvery: 2, highlightLast: true })}</div>
    <div class="card"><div class="card-h"><h3>${T('Pendapatan 14 hari terakhir', 'Revenue — last 14 days')}</h3><span class="muted small">${money(series.reduce((a, x) => a + (x.revenue || 0), 0))}</span></div>${lineChart(series.map((x) => ({ label: fdate(x.date).slice(0, 6), value: Math.max(0, x.revenue || 0) })), { fmt: money, labelEvery: 2 })}</div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><div class="card-h"><h3>${T('Janji temu berikutnya', 'Upcoming appointments')}</h3><a class="btn sm ghost" href="#/data/appointments">${T('Semua', 'All')}</a></div>${d.upcoming.length ? `<div class="timeline">${d.upcoming.map((a) => `<div class="tl-item"><b>${esc(a.name)} ${a.type === 'telemedicine' ? icon('video', '', 14) : ''}</b><span class="small muted">${fdate(a.date)} · ${esc(a.time)} · ${esc(a.doctor || '')}</span></div>`).join('')}</div>` : emptyState(T('Tidak ada janji temu', 'No appointments'), 'calendar')}</div>
    <div class="card"><div class="card-h"><h3>${T('Antrian langsung', 'Live queue')}</h3><a class="btn sm ghost" href="#/queue">${T('Kelola', 'Manage')}</a></div>${d.queues.map((qq) => `<div style="margin-bottom:10px"><div class="small muted" style="font-weight:700">${esc(qq.branch || '')}</div>${(qq.polis || []).map((p) => `<div class="row-between" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${esc(tr(p.name))}</span><span class="row"><b class="mono">${esc(p.current?.queue_no || '—')}</b><span class="badge warn">${p.waiting} ${T('menunggu', 'waiting')}</span></span></div>`).join('') || `<div class="small faint">${T('Belum ada antrian', 'No queue yet')}</div>`}</div>`).join('')}</div>
    <div class="card"><div class="card-h"><h3>${T('Status janji temu hari ini', "Today's appointment status")}</h3></div>${hbars((d.apptStatus || []).map((r) => ({ label: tr(O().apptStatus?.find((o) => o[0] === r.status)?.[S.lang === 'en' ? 2 : 1] || r.status), value: r.n })))}</div>
  </div>`;
}

// ================================================================== REGISTRATION & QUEUE
export async function queue(ctx) {
  ctx.title(T('Pendaftaran & Antrian', 'Registration & Queue'), T('Pelayanan harian', 'Daily operations'));
  let branch = curBranch();
  let poliF = ctx.query.poli || '';
  ctx.el.innerHTML = `<div class="toolbar">${branchSelect(branch)}<div class="chips" data-polis></div><span class="grow"></span>
    ${can('clinic:register') ? `<button class="btn primary" data-new>${icon('plus', '', 16)} ${T('Daftarkan pasien', 'Register patient')}</button>` : ''}
    <button class="btn" data-checkin>${icon('scan', '', 16)} ${T('Check-in booking / QR', 'Check-in booking / QR')}</button>
    <a class="btn" target="_blank" data-display>${icon('monitor', '', 16)} ${T('Layar antrian', 'Queue display')}</a></div>
  <div class="split-l"><div class="card"><div class="card-h"><h3>${icon('calendar-check', '', 18)} ${T('Booking hari ini', "Today's bookings")}</h3><span class="badge" data-acount>0</span></div><div data-appts>${loading()}</div></div>
  <div><div class="qboard" data-board>${loading()}</div></div></div>`;
  const el = ctx.el;
  const load = async () => {
    const d = await api(`/api/clinic/queue?branch=${encodeURIComponent(branch)}${poliF ? '&poli=' + poliF : ''}`);
    if (!alive(ctx)) return;
    el.querySelector('[data-display]').href = `/antrian?branch=${branch}`;
    const polis = sorted(active(B().polis)).filter((p) => !(p.branches || []).length || p.branches.includes(branch));
    el.querySelector('[data-polis]').innerHTML = `<button class="chip ${poliF ? '' : 'on'}" data-pf="">${T('Semua poli', 'All units')}</button>` + polis.map((p) => `<button class="chip ${poliF === p.id ? 'on' : ''}" data-pf="${p.id}">${esc(tr(p.name))}</button>`).join('');
    el.querySelectorAll('[data-pf]').forEach((b) => (b.onclick = () => { poliF = b.dataset.pf; load(); }));
    el.querySelector('[data-acount]').textContent = d.appointments.length;
    el.querySelector('[data-appts]').innerHTML = d.appointments.length ? d.appointments.map((a) => `<div class="qitem"><div class="row-between"><b>${esc(a.time)} · ${esc(a.name)}</b>${a.type === 'telemedicine' ? `<span class="badge info">${icon('video', '', 12)} Tele</span>` : ''}</div><div class="meta">${esc(doctorName(a.doctor_id))} · ${esc(poliName(a.poli_id))} · <span class="mono">${esc(a.booking_no)}</span></div><div class="acts">${a.type === 'telemedicine' && a.meet_url ? `<a class="btn sm" href="${esc(a.meet_url)}" target="_blank" rel="noopener">${icon('video', '', 14)} Video</a>` : ''}<button class="btn sm primary" data-ci="${esc(a.booking_no)}">${icon('check', '', 14)} Check-in</button></div></div>`).join('') : emptyState(T('Tidak ada booking tersisa hari ini', 'No remaining bookings today'), 'calendar');
    el.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = async () => { try { const r = await api('/api/clinic/checkin', { method: 'POST', body: { code: b.dataset.ci } }); afterRegister(r.visit); load(); } catch (e) { fail(e); } }));
    const groups = {};
    for (const v of d.visits) (groups[v.poli_id] ||= []).push(v);
    const show = polis.filter((p) => !poliF || p.id === poliF);
    el.querySelector('[data-board]').innerHTML = show.map((p) => {
      const list = groups[p.id] || [];
      const waiting = list.filter((v) => v.queue_status === 'waiting').length;
      return `<div class="qcol" style="--c:${esc(p.color)}"><header><b>${esc(tr(p.name))}</b><span class="row"><span class="badge warn">${waiting} ${T('menunggu', 'waiting')}</span>${can('queue:call') ? `<button class="btn sm primary" data-next="${p.id}">${icon('volume', '', 14)} ${T('Panggil berikutnya', 'Call next')}</button>` : ''}</span></header><div class="list">${list.map(qItem).join('') || `<div class="empty small">${T('Belum ada antrian', 'No queue')}</div>`}</div></div>`;
    }).join('') || emptyState(T('Tidak ada poli di cabang ini', 'No units in this branch'));
  };
  function qItem(v) {
    const acts = [];
    if (can('queue:call')) {
      if (v.queue_status === 'waiting') acts.push(`<button class="btn sm primary" data-qa="call" data-id="${v.id}">${icon('volume', '', 14)} ${T('Panggil', 'Call')}</button>`);
      if (v.queue_status === 'called') acts.push(`<button class="btn sm" data-qa="recall" data-id="${v.id}">${icon('volume', '', 14)} ${T('Ulang', 'Recall')}</button><button class="btn sm primary" data-qa="serve" data-id="${v.id}">${T('Layani', 'Serve')}</button><button class="btn sm ghost" data-qa="skip" data-id="${v.id}">${T('Lewati', 'Skip')}</button>`);
      if (v.queue_status === 'skipped') acts.push(`<button class="btn sm" data-qa="requeue" data-id="${v.id}">${T('Antrikan lagi', 'Requeue')}</button>`);
    }
    if (can('clinic:triage') && ['waiting', 'called'].includes(v.queue_status)) acts.push(`<button class="btn sm" data-triage="${v.id}">${icon('thermometer', '', 14)} ${T('Triase', 'Triage')}</button>`);
    if (can('clinic:examine') && v.queue_status !== 'waiting' && v.status !== 'cancelled') acts.push(`<a class="btn sm" href="#/exam/${v.id}">${icon('stethoscope', '', 14)} ${T('Periksa', 'Examine')}</a>`);
    acts.push(`<button class="btn sm ghost" data-open-slip="${v.id}" title="${T('Cetak bukti', 'Print slip')}">${icon('printer', '', 14)}</button>`);
    if (can('queue:call') && v.status === 'registered' && v.queue_status === 'waiting') acts.push(`<button class="btn sm ghost danger" data-qa="cancel" data-id="${v.id}" title="${T('Batal', 'Cancel')}">${icon('x', '', 14)}</button>`);
    return `<div class="qitem ${v.queue_status}"><div class="row-between"><span class="no">${esc(v.queue_no)}</span><span class="row">${qBadge(v.queue_status)}${vBadge(v.status)}</span></div><div><a class="nm" href="#/patients/${v.patient_id}">${esc(v.patient_name)}</a> <span class="meta">${esc(v.mrn)} · ${esc(v.gender || '')} ${v.birth_date ? age(v.birth_date) + ' th' : ''}</span></div><div class="meta">${esc(doctorName(v.doctor_id) || T('Dokter jaga', 'On-duty doctor'))}${v.invoice_status ? ' · ' + statusBadge(O().invStatus, v.invoice_status) : ''}</div>${v.allergies ? `<div class="meta" style="color:var(--bad)">${icon('alert', '', 12)} ${T('Alergi', 'Allergy')}: ${esc(v.allergies)}</div>` : ''}${v.vitals ? `<div>${vitalsChips(v.vitals)}</div>` : ''}<div class="acts">${acts.join('')}</div></div>`;
  }
  el.addEventListener('click', async (e) => {
    const qa = e.target.closest('[data-qa]');
    if (qa) {
      try { await api(`/api/clinic/queue/${qa.dataset.id}/${qa.dataset.qa}`, { method: 'POST' }); load(); } catch (err) { fail(err); }
    }
    const nx = e.target.closest('[data-next]');
    if (nx) {
      try { const r = await api('/api/clinic/queue/next', { method: 'POST', body: { branch_id: branch, poli_id: nx.dataset.next } }); if (r.ok === false) toast(r.message); load(); } catch (err) { fail(err); }
    }
    const tg = e.target.closest('[data-triage]');
    if (tg) triageModal(tg.dataset.triage, load);
    const sl = e.target.closest('[data-open-slip]');
    if (sl) openDoc(`/api/docs/slip/${sl.dataset.openSlip}`);
  });
  el.querySelector('[data-branch-local]')?.addEventListener('change', (e) => { branch = e.target.value; load(); });
  el.querySelector('[data-new]')?.addEventListener('click', () => registerModal(branch, null, load));
  el.querySelector('[data-checkin]').onclick = () => checkinModal(load);
  await load();
  const timer = setInterval(() => (alive(ctx) ? load().catch(() => {}) : clearInterval(timer)), 15000);
  if (ctx.query.register) registerModal(branch, ctx.query.register, load);
}

function afterRegister(visit, patient) {
  modal({
    title: T('Pendaftaran berhasil', 'Registration complete'),
    body: `<div class="center stack" style="justify-items:center"><span class="muted">${T('Nomor antrian', 'Queue number')}</span><div class="bignum">${esc(visit.queue_no)}</div><div>${esc(poliName(visit.poli_id))} · ${esc(doctorName(visit.doctor_id) || '')}</div><div class="mono small">${esc(visit.visit_no)}</div>${patient?.mrn ? `<div class="alert ok">${icon('check-circle', '', 18)} ${T('Pasien baru terdaftar dengan No. RM', 'New patient registered with MRN')} <b>${esc(patient.mrn)}</b></div>` : ''}</div>`,
    actions: [
      ...(patient?.id ? [{ label: `${icon('id-card', '', 16)} ${T('Kartu pasien', 'Patient card')}`, onClick: () => { openDoc(`/api/docs/card/${patient.id}`); return false; } }] : []),
      { label: `${icon('printer', '', 16)} ${T('Cetak bukti', 'Print slip')}`, cls: 'primary', onClick: () => { openDoc(`/api/docs/slip/${visit.id}`); return false; } },
      { label: T('Selesai', 'Done') },
    ],
  });
}

export function registerModal(branch, patientId, done) {
  const st = { patient: null, isNew: false };
  const polis = sorted(active(B().polis)).filter((p) => !(p.branches || []).length || p.branches.includes(branch));
  const m = modal({
    title: T('Daftarkan kunjungan', 'Register visit'), size: 'wide',
    body: `<div class="stack">
      <div class="row"><div class="grow refpick"><input data-ps placeholder="${T('Cari pasien lama: nama, No. RM, NIK, BPJS, HP…', 'Search existing patient: name, MRN, ID, phone…')}"><div class="pop hide" data-pp></div></div><button type="button" class="btn" data-newp>${icon('plus', '', 16)} ${T('Pasien baru', 'New patient')}</button></div>
      <div data-psel></div>
      <div data-pnew class="hide card" style="background:var(--surface2)"><div class="form-grid">
        <label class="f"><span class="req">${T('Nama lengkap', 'Full name')}</span><input data-n="name"></label><label class="f">NIK<input data-n="nik" inputmode="numeric" maxlength="16"></label>
        <label class="f">${T('Jenis kelamin', 'Gender')}<select data-n="gender"><option value="">-</option><option value="L">${T('Laki-laki', 'Male')}</option><option value="P">${T('Perempuan', 'Female')}</option></select></label><label class="f">${T('Tanggal lahir', 'Date of birth')}<input type="date" data-n="birth_date"></label>
        <label class="f">${T('No. HP / WA', 'Phone')}<input data-n="phone" type="tel"></label><label class="f">${T('No. BPJS / asuransi', 'Insurance no.')}<input data-n="bpjs_no"></label>
        <label class="f full" style="grid-column:1/-1">${T('Alamat', 'Address')}<input data-n="address"></label></div></div>
      <div class="form-grid g3"><label class="f"><span class="req">Poli</span><select data-poli>${polis.map((p) => `<option value="${p.id}">${esc(tr(p.name))}</option>`).join('')}</select></label>
      <label class="f">${T('Dokter', 'Doctor')}<select data-doc></select></label>
      <label class="f">${T('Penjamin', 'Payer')}<select data-payer>${PAYERS().map((o) => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></label>
      <label class="f" style="grid-column:1/-1">${T('Keluhan utama', 'Chief complaint')}<textarea data-complaint rows="2"></textarea></label></div></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: `${icon('ticket', '', 16)} ${T('Daftarkan & ambil nomor antrian', 'Register & get queue number')}`, cls: 'primary', onClick: async (el) => {
      const body = { branch_id: branch, poli_id: el.querySelector('[data-poli]').value, doctor_id: el.querySelector('[data-doc]').value || null, payer_type: el.querySelector('[data-payer]').value, complaint: el.querySelector('[data-complaint]').value };
      if (st.isNew) {
        const p = {};
        el.querySelectorAll('[data-n]').forEach((i) => (p[i.dataset.n] = i.value));
        if (!p.name) throw new Error(T('Nama pasien wajib diisi', 'Patient name is required'));
        p.payer_type = body.payer_type;
        body.patient = p;
      } else if (st.patient) body.patient_id = st.patient.id;
      else throw new Error(T('Pilih pasien atau buat pasien baru', 'Choose or create a patient'));
      const r = await api('/api/clinic/register', { method: 'POST', body });
      done && done();
      afterRegister(r.visit, r.patient);
    } }],
  });
  const el = m.el;
  const docSel = el.querySelector('[data-doc]');
  const fillDocs = () => {
    const pid = el.querySelector('[data-poli]').value;
    const wd = String(new Date(today() + 'T00:00:00Z').getUTCDay());
    const docs = sorted(active(B().doctors)).filter((d) => d.poli_id === pid && (d.branches || []).includes(branch));
    docSel.innerHTML = `<option value="">${T('Dokter jaga / belum ditentukan', 'On-duty / unassigned')}</option>` + docs.map((d) => {
      const sch = active(B().schedules).filter((s) => s.doctor_id === d.id && s.branch_id === branch && String(s.day) === wd);
      return `<option value="${d.id}">${esc(d.name)}${sch.length ? ` · ${sch.map((s) => s.start + '-' + s.end).join(', ')}` : ` · ${T('tidak praktik hari ini', 'not on duty today')}`}</option>`;
    }).join('');
  };
  el.querySelector('[data-poli]').onchange = fillDocs;
  fillDocs();
  const selectPatient = (p) => {
    st.patient = p;
    st.isNew = false;
    el.querySelector('[data-pnew]').classList.add('hide');
    el.querySelector('[data-psel]').innerHTML = `<div class="card pcard" style="background:var(--primary-50)"><span class="av">${esc(initials(p.name))}</span><div class="grow"><b>${esc(p.name)}</b><span class="small muted">${esc(p.mrn)} · ${esc(p.gender || '')} ${p.birth_date ? age(p.birth_date) + ' th' : ''} · ${esc(p.phone || '')}</span>${p.allergies ? `<div class="small" style="color:var(--bad)">${icon('alert', '', 12)} ${esc(p.allergies)}</div>` : ''}</div>${p.member_tier ? `<span class="badge gold">${esc(byId(B().membership_tiers, p.member_tier)?.name || '')}</span>` : ''}</div>`;
    if (p.payer_type) el.querySelector('[data-payer]').value = p.payer_type;
  };
  const ps = el.querySelector('[data-ps]'), pp = el.querySelector('[data-pp]');
  ps.oninput = debounce(async () => {
    if (ps.value.trim().length < 2) return pp.classList.add('hide');
    const { rows } = await api('/api/clinic/patients/search?q=' + encodeURIComponent(ps.value.trim()));
    pp.innerHTML = rows.map((p, i) => `<button type="button" data-i="${i}"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.mrn)} · ${esc(p.birth_date || '')} · ${esc(p.phone || '')}</span></button>`).join('') || `<div class="empty small">${T('Tidak ditemukan — buat pasien baru', 'Not found — create a new patient')}</div>`;
    pp.classList.remove('hide');
    pp.querySelectorAll('[data-i]').forEach((b) => (b.onmousedown = (ev) => { ev.preventDefault(); selectPatient(rows[b.dataset.i]); pp.classList.add('hide'); ps.value = ''; }));
  }, 250);
  el.querySelector('[data-newp]').onclick = () => {
    st.isNew = true;
    st.patient = null;
    el.querySelector('[data-psel]').innerHTML = '';
    el.querySelector('[data-pnew]').classList.remove('hide');
    el.querySelector('[data-n="name"]').focus();
  };
  if (patientId) api(`/api/crud/patients/${patientId}`).then((r) => selectPatient(r.row)).catch(fail);
}

function checkinModal(done) {
  const m = modal({
    title: T('Check-in booking', 'Booking check-in'),
    body: `<div class="stack"><label class="f">${T('Nomor booking / hasil scan QR', 'Booking number / QR result')}<input data-code placeholder="GK260927-XXXX" autocapitalize="characters"></label>${'BarcodeDetector' in window ? `<button type="button" class="btn" data-scan>${icon('scan', '', 16)} ${T('Scan QR dengan kamera', 'Scan QR with camera')}</button><video data-video playsinline class="hide" style="width:100%;border-radius:14px;background:#000"></video>` : `<p class="muted small">${T('Pemindai kamera tidak didukung browser ini. Gunakan scanner USB atau ketik nomor booking.', 'Camera scanning not supported. Use a USB scanner or type the number.')}</p>`}</div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: 'Check-in', cls: 'primary', onClick: async (el) => {
      const r = await api('/api/clinic/checkin', { method: 'POST', body: { code: el.querySelector('[data-code]').value } });
      done && done();
      afterRegister(r.visit);
    } }],
    onClose: () => stream?.getTracks().forEach((t) => t.stop()),
  });
  let stream;
  m.el.querySelector('[data-scan]')?.addEventListener('click', async () => {
    try {
      const v = m.el.querySelector('[data-video]');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      v.srcObject = stream;
      v.classList.remove('hide');
      await v.play();
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!document.body.contains(v)) return;
        const codes = await det.detect(v).catch(() => []);
        if (codes[0]) {
          m.el.querySelector('[data-code]').value = codes[0].rawValue;
          stream.getTracks().forEach((t) => t.stop());
          v.classList.add('hide');
          toast(T('QR terbaca', 'QR detected'));
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { fail(e); }
  });
}

function vitalsForm(v = {}) {
  const f = (k, label, ph, type = 'number') => `<label class="f">${label}<input data-v="${k}" type="${type}" step="any" value="${esc(v[k] ?? '')}" placeholder="${ph}"></label>`;
  return `<div class="vitals">${f('bp', T('Tekanan darah', 'Blood pressure'), '120/80', 'text')}${f('hr', T('Nadi (x/mnt)', 'Pulse'), '80')}${f('rr', T('Napas (x/mnt)', 'Resp. rate'), '18')}${f('temp', T('Suhu (°C)', 'Temp (°C)'), '36.5')}${f('spo2', 'SpO₂ (%)', '98')}${f('weight', T('Berat (kg)', 'Weight (kg)'), '60')}${f('height', T('Tinggi (cm)', 'Height (cm)'), '165')}${f('pain', T('Skala nyeri (0-10)', 'Pain (0-10)'), '0')}</div>`;
}
const readVitals = (el) => Object.fromEntries([...el.querySelectorAll('[data-v]')].filter((i) => i.value !== '').map((i) => [i.dataset.v, i.type === 'number' ? Number(i.value) : i.value]));

async function triageModal(visitId, done) {
  const d = await api(`/api/clinic/visits/${visitId}`).catch(fail);
  if (!d) return;
  modal({
    title: `${T('Triase', 'Triage')} · ${esc(d.visit.queue_no)} · ${esc(d.patient.name)}`, size: 'wide',
    body: `${vitalsForm(d.record?.vitals || {})}<div class="form-grid" style="margin-top:14px"><label class="f">${T('Keluhan / anamnesis singkat', 'Complaint / brief history')}<textarea data-an rows="3">${esc(d.record?.anamnesis || d.visit.complaint || '')}</textarea></label><label class="f">${T('Alergi', 'Allergies')}<textarea data-al rows="3">${esc(d.patient.allergies || '')}</textarea></label></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Simpan triase', 'Save triage'), cls: 'primary', onClick: async (el) => {
      await api(`/api/clinic/visits/${visitId}/record`, { method: 'PUT', body: { vitals: readVitals(el), anamnesis: el.querySelector('[data-an]').value, allergies: el.querySelector('[data-al]').value } });
      toast(T('Triase tersimpan', 'Triage saved'));
      done && done();
    } }],
  });
}

// ================================================================== DOCTOR WORKSPACE
export async function doctor(ctx) {
  ctx.title(T('Ruang Periksa Dokter', 'Doctor Workspace'), T('Pelayanan harian', 'Daily operations'));
  const docs = sorted(active(B().doctors));
  let docId = ctx.query.doctor || S.user.doctor_id || docs[0]?.id;
  const draw = async () => {
    const d = await api(`/api/clinic/doctor/today?doctor=${encodeURIComponent(docId)}`);
    if (!alive(ctx)) return;
    const doc = d.doctor;
    const wd = String(new Date(today() + 'T00:00:00Z').getUTCDay());
    const todaySch = (d.schedule || []).filter((s) => String(s.day) === wd);
    const waiting = d.visits.filter((v) => v.queue_status === 'waiting');
    const current = d.visits.filter((v) => ['called', 'serving'].includes(v.queue_status));
    ctx.el.innerHTML = `<div class="card pcard" style="margin-bottom:16px"><span class="av">${esc(initials(doc?.name))}</span><div class="grow"><b>${esc(doc?.name || T('Pilih dokter', 'Choose doctor'))}</b><span class="small muted">${esc(tr(doc?.specialty))} · ${esc(poliName(doc?.poli_id))}</span><div class="row" style="margin-top:6px">${todaySch.map((s) => `<span class="badge pri">${icon('clock', '', 12)} ${esc(s.start)}–${esc(s.end)} · ${esc(branchName(s.branch_id))}</span>`).join('') || `<span class="badge">${T('Tidak ada jadwal hari ini', 'No schedule today')}</span>`}</div></div>
    ${!S.user.doctor_id ? `<select data-doc style="width:auto">${docs.map((x) => `<option value="${x.id}" ${x.id === docId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
    ${can('queue:call') && doc ? `<button class="btn primary lg" data-callnext ${waiting.length ? '' : 'disabled'}>${icon('volume', '', 18)} ${T('Panggil pasien berikutnya', 'Call next patient')} (${waiting.length})</button>` : ''}</div>
    ${current.length ? `<div class="grid g3" style="margin-bottom:16px">${current.map((v) => `<a class="card" href="#/exam/${v.id}" style="border-color:var(--primary);background:var(--primary-50)"><div class="row-between"><span class="bignum" style="font-size:2rem">${esc(v.queue_no)}</span>${qBadge(v.queue_status)}</div><b>${esc(v.patient_name)}</b><div class="small muted">${esc(v.mrn)} · ${esc(v.gender || '')} ${age(v.birth_date)} th</div><div style="margin-top:6px">${vitalsChips(v.vitals)}</div><div class="btn primary sm" style="margin-top:10px">${icon('stethoscope', '', 14)} ${T('Mulai pemeriksaan', 'Start exam')}</div></a>`).join('')}</div>` : ''}
    <div class="grid g2"><div class="card"><div class="card-h"><h3>${T('Daftar pasien hari ini', "Today's patients")}</h3><span class="badge">${d.visits.length}</span></div>
    ${d.visits.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>${T('Pasien', 'Patient')}</th><th>${T('Vital', 'Vitals')}</th><th>Status</th><th></th></tr></thead><tbody>${d.visits.map((v) => `<tr class="click" data-go="${v.id}"><td class="mono"><b>${esc(v.queue_no)}</b></td><td><b>${esc(v.patient_name)}</b><div class="tiny muted">${esc(v.mrn)} · ${esc(v.gender || '')} ${age(v.birth_date)} th${v.allergies ? ` · <span style="color:var(--bad)">${T('Alergi', 'Allergy')}</span>` : ''}</div></td><td>${vitalsChips(v.vitals) || '<span class="faint">—</span>'}</td><td>${qBadge(v.queue_status)} ${v.record_status === 'final' ? '<span class="badge ok">Final</span>' : ''}</td><td class="act">${v.queue_status === 'waiting' && can('queue:call') ? `<button class="btn sm" data-call="${v.id}">${icon('volume', '', 14)}</button>` : ''}<a class="btn sm primary" href="#/exam/${v.id}">${T('Periksa', 'Examine')}</a></td></tr>`).join('')}</tbody></table></div>` : emptyState(T('Belum ada pasien untuk Anda hari ini', 'No patients for you yet today'), 'users')}</div>
    <div class="card"><div class="card-h"><h3>${T('Janji temu hari ini', "Today's appointments")}</h3></div>${d.appointments.length ? `<div class="timeline">${d.appointments.map((a) => `<div class="tl-item"><b>${esc(a.time)} · ${esc(a.name)}</b><span class="small muted">${statusBadge(O().apptStatus, a.status)} ${a.type === 'telemedicine' ? `<a class="btn sm" href="${esc(a.meet_url || '#')}" target="_blank" rel="noopener">${icon('video', '', 14)} ${T('Mulai video', 'Start video')}</a>` : ''}</span></div>`).join('')}</div>` : emptyState(T('Tidak ada janji temu', 'No appointments'), 'calendar')}</div></div>`;
    ctx.el.querySelector('[data-doc]')?.addEventListener('change', (e) => { docId = e.target.value; draw().catch(fail); });
    ctx.el.querySelector('[data-callnext]')?.addEventListener('click', async () => {
      const v = waiting[0];
      try { await api(`/api/clinic/queue/${v.id}/call`, { method: 'POST' }); location.hash = `#/exam/${v.id}`; } catch (e) { fail(e); }
    });
    ctx.el.querySelectorAll('[data-call]').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); try { await api(`/api/clinic/queue/${b.dataset.call}/call`, { method: 'POST' }); draw(); } catch (err) { fail(err); } }));
    ctx.el.querySelectorAll('[data-go]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = `#/exam/${tr.dataset.go}`; }));
  };
  await draw();
  const timer = setInterval(() => (alive(ctx) ? draw().catch(() => {}) : clearInterval(timer)), 20000);
}

// ================================================================== EXAM (EMR / SOAP)
let ICD = null;
const DOSES = ['3 x 1 sesudah makan', '2 x 1 sesudah makan', '1 x 1 sesudah makan', '3 x 1 sebelum makan', '1 x 1 malam sebelum tidur', '3 x 1 bila demam/nyeri', '3 x 1 sendok takar (5 ml)', '2 x 1 oles tipis', 'Dihabiskan, 3 x 1'];

export async function exam(ctx) {
  const id = ctx.params.id;
  const d = await api(`/api/clinic/visits/${id}`);
  if (!alive(ctx)) return;
  const v = d.visit, p = d.patient;
  ctx.title(`${T('Pemeriksaan', 'Examination')} · ${v.queue_no}`, `${p.name} · ${p.mrn}`);
  const editable = can('clinic:examine') && d.record?.status !== 'final' && v.status !== 'cancelled';
  const rec = d.record ? structuredClone(d.record) : { vitals: {}, diagnoses: [], procedures: [] };
  rec.vitals ||= {};
  rec.diagnoses ||= [];
  rec.procedures ||= [];
  const openRx = d.prescriptions.find((r) => ['new', 'prepared'].includes(r.status));
  const rx = structuredClone(openRx?.items || []);
  const ro = editable ? '' : 'disabled';
  const ta = (k, label, rows = 3) => `<label class="f">${label}<textarea data-r="${k}" rows="${rows}" ${ro}>${esc(rec[k] || '')}</textarea></label>`;
  const labCats = {};
  active(B().lab_tests).forEach((t) => (labCats[t.category || 'Lainnya'] ||= []).push(t));
  const procs = sorted(active(B().procedures)).sort((a, b) => (b.poli_id === v.poli_id) - (a.poli_id === v.poli_id));
  ctx.el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row-between"><div class="pcard"><span class="av">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><span class="small muted">${esc(p.mrn)} · ${p.gender === 'P' ? T('Perempuan', 'Female') : p.gender === 'L' ? T('Laki-laki', 'Male') : '-'} · ${age(p.birth_date)} th · ${esc(PAYERS().find((x) => x[0] === v.payer_type)?.[1] || v.payer_type)}${p.bpjs_no ? ' · BPJS ' + esc(p.bpjs_no) : ''}</span><div class="row" style="margin-top:6px"><span class="badge pri mono">${esc(v.queue_no)}</span>${vBadge(v.status)}${d.record?.status === 'final' ? `<span class="badge ok">${icon('check', '', 12)} Final · ${fdt(d.record.signed_at)}</span>` : ''}${p.member_tier ? `<span class="badge gold">${esc(byId(B().membership_tiers, p.member_tier)?.name || '')}</span>` : ''}</div></div></div>
  <div class="btn-group">${can('queue:call') ? `<button class="btn" data-recall>${icon('volume', '', 16)} ${T('Panggil ulang', 'Recall')}</button>` : ''}<a class="btn" href="#/patients/${p.id}">${icon('clipboard', '', 16)} ${T('Riwayat lengkap', 'Full history')}</a><button class="btn" data-open="/api/docs/record/${v.id}">${icon('file', '', 16)} Resume PDF</button>${d.record?.status === 'final' && can('clinic:examine') ? `<button class="btn" data-reopen>${icon('edit', '', 16)} ${T('Buka kembali', 'Reopen')}</button>` : ''}</div></div>
  ${p.allergies ? `<div class="alert bad" style="margin-top:12px">${icon('alert', '', 18)} <b>${T('ALERGI', 'ALLERGY')}:</b> ${esc(p.allergies)}</div>` : ''}${p.medical_history ? `<div class="alert warn" style="margin-top:8px">${icon('info', '', 18)} ${T('Riwayat penyakit', 'History')}: ${esc(p.medical_history)}</div>` : ''}</div>
  <div class="split"><div class="stack">
    <div class="card"><div class="card-h"><h3>${icon('activity', '', 18)} ${T('Tanda vital', 'Vital signs')}</h3>${rec.vitals.bmi ? `<span class="badge">BMI ${esc(rec.vitals.bmi)}</span>` : ''}</div><div data-vitals>${vitalsForm(rec.vitals)}</div></div>
    <div class="card"><div class="card-h"><h3>${icon('clipboard', '', 18)} SOAP</h3></div><div class="form-grid">${ta('anamnesis', 'Anamnesis')}${ta('subjective', 'S — Subjektif')}${ta('physical_exam', T('Pemeriksaan fisik', 'Physical exam'))}${ta('objective', 'O — Objektif')}${ta('assessment', 'A — Asesmen')}${ta('plan', 'P — Rencana')}</div></div>
    <div class="card"><div class="card-h"><h3>${icon('heart', '', 18)} Diagnosis (ICD-10)</h3></div>${editable ? `<div class="refpick" style="margin-bottom:10px"><input data-icd placeholder="${T('Cari kode/nama diagnosis, mis. J06 atau ISPA…', 'Search ICD-10 code or name…')}"><div class="pop hide" data-icdpop></div></div>` : ''}<div data-dx></div></div>
    <div class="card"><div class="card-h"><h3>${icon('activity', '', 18)} ${T('Tindakan', 'Procedures')}</h3></div>${editable ? `<div class="row" style="margin-bottom:10px"><select data-proc class="grow" style="flex:1">${procs.map((x) => `<option value="${x.id}">${esc(x.code || '')} ${esc(x.name)} — ${money(priceOf(x, v.branch_id))}</option>`).join('')}</select><button class="btn" data-addproc>${icon('plus', '', 16)} ${T('Tambah', 'Add')}</button></div>` : ''}<div data-procs></div></div>
    <div class="card"><div class="card-h"><h3>${icon('pill', '', 18)} ${T('Resep elektronik', 'E-prescription')}</h3>${openRx ? `<span class="badge warn">${esc(openRx.rx_no)}</span>` : ''}${d.prescriptions.filter((r) => r.status === 'dispensed').map((r) => `<span class="badge ok">${esc(r.rx_no)} ${T('diserahkan', 'dispensed')}</span>`).join('')}</div>${editable ? `<div class="refpick" style="margin-bottom:10px"><input data-med placeholder="${T('Cari obat (nama/generik/kode)…', 'Search medicine…')}"><div class="pop hide" data-medpop></div></div>` : ''}<div data-rx></div><datalist id="doses">${DOSES.map((x) => `<option value="${x}">`).join('')}</datalist></div>
    <div class="card"><div class="card-h"><h3>${icon('flask', '', 18)} ${T('Laboratorium', 'Laboratory')}</h3></div>
      ${d.labs.map((l) => `<div class="qitem" style="margin-bottom:8px"><div class="row-between"><b class="mono">${esc(l.lab_no)}</b><span class="row">${statusBadge(O().labStatus, l.status)}<button class="btn sm ghost" data-open="/api/docs/lab/${l.id}">${icon('download', '', 14)}</button></span></div><div class="small">${(l.tests || []).map((t) => `${esc(t.name)}${t.result ? `: <b style="color:${t.flag ? 'var(--bad)' : 'inherit'}">${esc(t.result)} ${esc(t.unit || '')}${t.flag ? ' (' + esc(t.flag) + ')' : ''}</b>` : ''}`).join(' · ')}</div></div>`).join('')}
      ${can('clinic:examine') && v.status !== 'cancelled' ? `<details><summary class="btn sm" style="display:inline-flex">${icon('plus', '', 14)} ${T('Permintaan lab baru', 'New lab request')}</summary><div style="margin-top:10px">${Object.entries(labCats).map(([c, list]) => `<div class="small muted" style="font-weight:700;margin:8px 0 4px">${esc(c)}</div><div class="checks">${list.map((t) => `<label><input type="checkbox" data-lab="${t.id}"> ${esc(t.name)} <span class="faint">${money(t.price)}</span></label>`).join('')}</div>`).join('')}<label class="f" style="margin-top:10px">${T('Catatan klinis', 'Clinical notes')}<input data-labnote></label><button class="btn primary" data-sendlab style="margin-top:10px">${icon('send', '', 16)} ${T('Kirim ke laboratorium', 'Send to lab')}</button></div></details>` : ''}</div>
    <div class="card"><div class="card-h"><h3>${icon('edit', '', 18)} ${T('Terapi & catatan', 'Therapy & notes')}</h3></div><div class="form-grid">${ta('therapy', T('Terapi / edukasi', 'Therapy / education'))}${ta('notes', T('Catatan dokter (internal)', 'Doctor notes (internal)'))}</div>
    <div class="row" style="margin-top:12px"><button class="btn" data-upload>${icon('paperclip', '', 16)} ${T('Unggah dokumen / lampiran', 'Upload document')}</button></div></div>
    ${editable ? `<div class="form-actions"><button class="btn" data-save>${icon('check', '', 16)} ${T('Simpan draf', 'Save draft')}</button><button class="btn primary lg" data-final>${icon('check-circle', '', 18)} ${T('Finalisasi & kirim ke kasir/farmasi', 'Finalize & send to billing')}</button></div>` : ''}
  </div>
  <aside class="stack"><div class="card"><div class="card-h"><h3>${icon('clock', '', 18)} ${T('Riwayat kunjungan', 'Visit history')}</h3></div>${d.history.length ? `<div class="timeline">${d.history.map((h) => `<div class="tl-item"><b>${fdate(h.date)} · ${esc(poliName(h.poli_id))}</b><span class="small">${(h.diagnoses || []).map((x) => `${esc(x.code)} ${esc(x.name)}`).join('; ') || esc(h.assessment || '-')}</span>${h.therapy ? `<div class="tiny muted">${esc(h.therapy)}</div>` : ''}<div class="tiny faint">${esc(doctorName(h.doctor_id))} · <a href="#" data-open="/api/docs/record/${h.visit_id}">PDF</a></div></div>`).join('')}</div>` : emptyState(T('Kunjungan pertama', 'First visit'), 'clock')}</div>
  <div class="card"><div class="card-h"><h3>${icon('paperclip', '', 18)} ${T('Dokumen pasien', 'Patient documents')}</h3></div>${d.documents.length ? d.documents.map((x) => `<a class="row" style="padding:6px 0" href="${fileUrl(x.file)}" target="_blank" rel="noopener">${icon('file', '', 16)} ${esc(x.title)} <span class="tiny faint">${fdate(x.created_at)}</span></a>`).join('') : `<p class="muted small">${T('Belum ada dokumen', 'No documents')}</p>`}</div>
  ${d.invoice ? `<div class="card"><div class="card-h"><h3>${icon('receipt', '', 18)} Invoice</h3>${statusBadge(O().invStatus, d.invoice.status)}</div><div class="row-between"><span class="mono small">${esc(d.invoice.invoice_no)}</span><b>${money(d.invoice.total)}</b></div>${can('billing:cashier') ? `<a class="btn sm" style="margin-top:10px" href="#/cashier/${d.invoice.id}">${T('Buka kasir', 'Open cashier')}</a>` : ''}</div>` : ''}</aside></div>`;
  const el = ctx.el;
  // diagnoses
  const drawDx = () => {
    el.querySelector('[data-dx]').innerHTML = rec.diagnoses.length ? rec.diagnoses.map((x, i) => `<div class="row-between" style="padding:8px 0;border-bottom:1px dashed var(--line)"><span><b class="mono">${esc(x.code)}</b> ${esc(x.name)} ${x.primary ? `<span class="badge pri">${T('Utama', 'Primary')}</span>` : ''}</span>${editable ? `<span class="btn-group"><button class="btn sm ghost" data-dxp="${i}">${T('Jadikan utama', 'Set primary')}</button><button class="btn sm ghost danger" data-dxr="${i}">${icon('x', '', 14)}</button></span>` : ''}</div>`).join('') : `<p class="muted small">${T('Belum ada diagnosis', 'No diagnosis yet')}</p>`;
    el.querySelectorAll('[data-dxr]').forEach((b) => (b.onclick = () => { rec.diagnoses.splice(+b.dataset.dxr, 1); drawDx(); }));
    el.querySelectorAll('[data-dxp]').forEach((b) => (b.onclick = () => { rec.diagnoses.forEach((x, i) => (x.primary = i === +b.dataset.dxp)); drawDx(); }));
  };
  drawDx();
  const icdIn = el.querySelector('[data-icd]');
  if (icdIn) {
    const pop = el.querySelector('[data-icdpop]');
    icdIn.oninput = debounce(async () => {
      ICD ||= await fetch('/assets/data/icd10.json').then((r) => r.json());
      const qv = icdIn.value.trim().toLowerCase();
      if (qv.length < 2) return pop.classList.add('hide');
      const res = ICD.filter(([c, n]) => c.toLowerCase().startsWith(qv) || n.toLowerCase().includes(qv)).slice(0, 12);
      pop.innerHTML = res.map(([c, n], i) => `<button type="button" data-i="${i}"><b class="mono">${esc(c)}</b> ${esc(n)}</button>`).join('') + `<button type="button" data-free>${icon('plus', '', 14)} ${T('Tambah sebagai teks bebas', 'Add as free text')}: "${esc(icdIn.value)}"</button>`;
      pop.classList.remove('hide');
      pop.querySelectorAll('[data-i]').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); const [c, n] = res[b.dataset.i]; rec.diagnoses.push({ code: c, name: n, primary: !rec.diagnoses.length }); icdIn.value = ''; pop.classList.add('hide'); drawDx(); }));
      pop.querySelector('[data-free]').onmousedown = (e) => { e.preventDefault(); rec.diagnoses.push({ code: '', name: icdIn.value, primary: !rec.diagnoses.length }); icdIn.value = ''; pop.classList.add('hide'); drawDx(); };
    }, 150);
    icdIn.onblur = () => setTimeout(() => pop.classList.add('hide'), 200);
  }
  // procedures
  const drawProcs = () => {
    el.querySelector('[data-procs]').innerHTML = rec.procedures.length ? `<table class="tbl items-tbl"><tbody>${rec.procedures.map((x, i) => `<tr><td>${esc(x.name)}</td><td style="width:80px"><input type="number" min="1" value="${esc(x.qty || 1)}" data-pq="${i}" ${ro}></td><td class="num" style="width:120px">${money((x.price ?? priceOf(byId(B().procedures, x.procedure_id), v.branch_id)) * (x.qty || 1))}</td><td class="act">${editable ? `<button class="btn sm ghost danger" data-pr="${i}">${icon('x', '', 14)}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="muted small">${T('Belum ada tindakan', 'No procedures')}</p>`;
    el.querySelectorAll('[data-pq]').forEach((i) => (i.oninput = () => { rec.procedures[+i.dataset.pq].qty = Number(i.value) || 1; }));
    el.querySelectorAll('[data-pr]').forEach((b) => (b.onclick = () => { rec.procedures.splice(+b.dataset.pr, 1); drawProcs(); }));
  };
  drawProcs();
  el.querySelector('[data-addproc]')?.addEventListener('click', () => {
    const pr = byId(B().procedures, el.querySelector('[data-proc]').value);
    if (pr) rec.procedures.push({ procedure_id: pr.id, name: pr.name, qty: 1, price: priceOf(pr, v.branch_id) });
    drawProcs();
  });
  // prescription
  const drawRx = () => {
    el.querySelector('[data-rx]').innerHTML = rx.length ? `<div class="tbl-wrap"><table class="tbl items-tbl"><thead><tr><th>${T('Obat', 'Medicine')}</th><th>Qty</th><th>${T('Satuan', 'Unit')}</th><th>${T('Aturan pakai', 'Dosage')}</th><th></th></tr></thead><tbody>${rx.map((x, i) => `<tr><td><b>${esc(x.name)}</b>${x.stock !== undefined ? `<div class="tiny ${x.stock < x.qty ? '' : 'muted'}" style="${x.stock < x.qty ? 'color:var(--bad)' : ''}">${T('stok', 'stock')} ${num(x.stock)}</div>` : ''}</td><td style="width:80px"><input type="number" min="1" data-rq="${i}" value="${esc(x.qty)}" ${ro}></td><td style="width:90px"><input data-ru="${i}" value="${esc(x.unit || '')}" ${ro}></td><td><input data-rd="${i}" list="doses" value="${esc(x.dose || '')}" placeholder="3 x 1 sesudah makan" ${ro}></td><td class="act">${editable ? `<button class="btn sm ghost danger" data-rr="${i}">${icon('x', '', 14)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>${openRx ? `<button class="btn sm ghost" style="margin-top:8px" data-open="/api/docs/prescription/${openRx.id}">${icon('printer', '', 14)} ${T('Cetak resep', 'Print prescription')}</button>` : ''}` : `<p class="muted small">${T('Belum ada obat', 'No medicines')}</p>`;
    el.querySelectorAll('[data-rq]').forEach((i) => (i.oninput = () => (rx[+i.dataset.rq].qty = Number(i.value) || 1)));
    el.querySelectorAll('[data-ru]').forEach((i) => (i.oninput = () => (rx[+i.dataset.ru].unit = i.value)));
    el.querySelectorAll('[data-rd]').forEach((i) => (i.oninput = () => (rx[+i.dataset.rd].dose = i.value)));
    el.querySelectorAll('[data-rr]').forEach((b) => (b.onclick = () => { rx.splice(+b.dataset.rr, 1); drawRx(); }));
  };
  drawRx();
  const medIn = el.querySelector('[data-med]');
  if (medIn) {
    const pop = el.querySelector('[data-medpop]');
    medIn.oninput = debounce(async () => {
      if (medIn.value.trim().length < 2) return pop.classList.add('hide');
      const { rows } = await api(`/api/pharmacy/search?q=${encodeURIComponent(medIn.value.trim())}&branch=${v.branch_id}`);
      pop.innerHTML = rows.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r.name)}</b> ${esc(r.strength || '')} <span class="muted small">· ${esc(r.unit_name || '')} · ${T('stok', 'stock')} ${num(r.stock)} · ${money(r.price_sell)}</span></button>`).join('') || `<div class="empty small">${T('Obat tidak ditemukan', 'Not found')}</div>`;
      pop.classList.remove('hide');
      pop.querySelectorAll('[data-i]').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); const r = rows[b.dataset.i]; rx.push({ medicine_id: r.id, name: `${r.name}${r.strength ? ' ' + r.strength : ''}`, qty: 10, unit: r.unit_name || '', dose: '3 x 1 sesudah makan', price: r.price_sell, stock: r.stock }); medIn.value = ''; pop.classList.add('hide'); drawRx(); }));
    }, 200);
    medIn.onblur = () => setTimeout(() => pop.classList.add('hide'), 200);
  }
  const collect = () => {
    el.querySelectorAll('[data-r]').forEach((t) => (rec[t.dataset.r] = t.value));
    rec.vitals = readVitals(el.querySelector('[data-vitals]'));
    return { vitals: rec.vitals, anamnesis: rec.anamnesis, subjective: rec.subjective, physical_exam: rec.physical_exam, objective: rec.objective, assessment: rec.assessment, plan: rec.plan, diagnoses: rec.diagnoses, procedures: rec.procedures, therapy: rec.therapy, notes: rec.notes };
  };
  const saveAll = async (finalize) => {
    const body = collect();
    await api(`/api/clinic/visits/${id}/prescription`, { method: 'PUT', body: { items: rx } });
    const r = await api(`/api/clinic/visits/${id}/record`, { method: 'PUT', body: { ...body, finalize } });
    return r;
  };
  el.querySelector('[data-save]')?.addEventListener('click', async (e) => { e.target.classList.add('busy'); try { await saveAll(false); toast(T('Draf tersimpan', 'Draft saved')); } catch (err) { fail(err); } finally { e.target.classList.remove('busy'); } });
  el.querySelector('[data-final]')?.addEventListener('click', async () => {
    if (!rec.diagnoses.length && !(await confirmBox(T('Belum ada diagnosis. Tetap finalisasi?', 'No diagnosis yet. Finalize anyway?')))) return;
    if (!(await confirmBox(T('Finalisasi rekam medis? Invoice akan dibuat otomatis dan resep dikirim ke farmasi.', 'Finalize record? An invoice will be created and prescriptions sent to pharmacy.')))) return;
    try {
      const r = await saveAll(true);
      modal({ title: T('Pemeriksaan selesai', 'Examination complete'), body: `<div class="stack"><div class="alert ok">${icon('check-circle', '', 18)} ${T('Rekam medis final & ditandatangani.', 'Record finalized and signed.')}</div>${r.invoice ? `<div class="row-between"><span>Invoice <b class="mono">${esc(r.invoice.invoice_no)}</b></span><b>${money(r.invoice.total)}</b></div>` : ''}<div class="small muted">${T('Status berikutnya', 'Next step')}: ${vBadge(r.status)}</div></div>`, actions: [{ label: T('Pasien berikutnya', 'Next patient'), cls: 'primary', onClick: () => { location.hash = '#/doctor'; } }, { label: 'Resume PDF', onClick: () => { openDoc(`/api/docs/record/${id}`); return false; } }] });
    } catch (err) { fail(err); }
  });
  el.querySelector('[data-recall]')?.addEventListener('click', async () => { try { await api(`/api/clinic/queue/${id}/recall`, { method: 'POST' }); toast(T('Pasien dipanggil ulang', 'Patient recalled')); } catch (e) { fail(e); } });
  el.querySelector('[data-reopen]')?.addEventListener('click', async () => {
    if (!(await confirmBox(T('Buka kembali rekam medis final untuk koreksi? Tindakan ini tercatat di audit log.', 'Reopen the finalized record? This is audit-logged.'), { danger: true }))) return;
    try { await api(`/api/clinic/visits/${id}/record`, { method: 'PUT', body: { reopen: true } }); ctx.refresh(); } catch (e) { fail(e); }
  });
  el.querySelector('[data-sendlab]')?.addEventListener('click', async () => {
    const tests = [...el.querySelectorAll('[data-lab]:checked')].map((c) => c.dataset.lab);
    try { const r = await api(`/api/clinic/visits/${id}/lab`, { method: 'POST', body: { tests, notes: el.querySelector('[data-labnote]').value } }); toast(`${T('Permintaan lab dikirim', 'Lab request sent')}: ${r.lab_no}`); await saveAll(false).catch(() => {}); ctx.refresh(); } catch (e) { fail(e); }
  });
  el.querySelector('[data-upload]').onclick = () => uploadDocModal(p.id, v.id, () => ctx.refresh());
}

function priceOf(item, branchId) {
  if (!item) return 0;
  const bp = (item.branch_prices || []).find((x) => x.branch_id === branchId && x.price);
  return Number(bp ? bp.price : item.price) || 0;
}

export function uploadDocModal(patientId, visitId, done) {
  modal({
    title: T('Unggah dokumen medis', 'Upload medical document'),
    body: `<div class="stack"><label class="f"><span class="req">${T('Judul', 'Title')}</span><input data-t placeholder="${T('mis. Hasil rontgen thorax', 'e.g. Chest X-ray')}"></label><label class="f">${T('Kategori', 'Category')}<select data-c>${(O().docCategory || []).map((o) => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></label><label class="switch"><input type="checkbox" data-s checked><span>${T('Tampilkan di portal pasien', 'Show in patient portal')}</span></label><button type="button" class="btn" data-pick>${icon('upload', '', 16)} ${T('Pilih file (PDF/gambar, maks 10 MB)', 'Choose file (PDF/image, max 10 MB)')}</button><div data-fn class="small muted"></div></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Simpan', 'Save'), cls: 'primary', onClick: async (el) => {
      if (!el._key) throw new Error(T('Pilih file terlebih dahulu', 'Choose a file first'));
      await api('/api/crud/documents', { method: 'POST', body: { title: el.querySelector('[data-t]').value || el._name, category: el.querySelector('[data-c]').value, patient_id: patientId, visit_id: visitId || null, file: el._key, shared_with_patient: el.querySelector('[data-s]').checked } });
      toast(T('Dokumen tersimpan di R2 (privat)', 'Document saved to R2 (private)'));
      done && done();
    } }],
  }).el.querySelector('[data-pick]').addEventListener('click', async function () {
    const el = this.closest('.modal');
    const f = await pickFile('application/pdf,image/*,.doc,.docx');
    if (!f) return;
    try { const r = await uploadFile(f); el._key = r.key; el._name = f.name; el.querySelector('[data-fn]').textContent = `✓ ${f.name}`; } catch (e) { fail(e); }
  });
}

// ================================================================== LAB
export async function lab(ctx) {
  ctx.title(T('Laboratorium', 'Laboratory'), T('Pelayanan harian', 'Daily operations'));
  let status = ctx.query.status || 'open';
  let branch = curBranch();
  ctx.el.innerHTML = `<div class="toolbar">${branchSelect(branch)}<div class="tabs" style="margin:0">${[['open', T('Aktif', 'Active')], ['validated', T('Tervalidasi', 'Validated')], ['all', T('Semua', 'All')]].map(([k, l]) => `<button data-st="${k}" class="${status === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="grow"></span><a class="btn" href="#/data/lab_tests">${icon('settings', '', 16)} ${T('Master pemeriksaan & nilai rujukan', 'Test master & reference ranges')}</a></div><div data-list>${loading()}</div>`;
  const load = async () => {
    const { rows } = await api(`/api/lab/orders?branch=${branch}&status=${status}`);
    if (!alive(ctx)) return;
    ctx.el.querySelector('[data-list]').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No. Lab</th><th>${T('Tanggal', 'Date')}</th><th>${T('Pasien', 'Patient')}</th><th>${T('Pemeriksaan', 'Tests')}</th><th>${T('Dokter', 'Doctor')}</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr class="click" data-o="${r.id}"><td class="mono"><b>${esc(r.lab_no)}</b></td><td>${fdate(r.date)}</td><td><b>${esc(r.patient_name)}</b><div class="tiny muted">${esc(r.mrn)} · ${esc(r.gender || '')} ${age(r.birth_date)} th</div></td><td class="small">${(r.tests || []).map((t) => esc(t.name)).join(', ')}</td><td class="small">${esc(doctorName(r.doctor_id))}</td><td>${statusBadge(O().labStatus, r.status)}</td><td class="act"><button class="btn sm ghost" data-open="/api/docs/lab/${r.id}">${icon('download', '', 15)}</button><button class="btn sm primary">${T('Input hasil', 'Enter results')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState(T('Tidak ada permintaan lab', 'No lab requests'), 'flask')}</div>`;
    ctx.el.querySelectorAll('[data-o]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('[data-open]')) return; labModal(rows.find((x) => String(x.id) === tr.dataset.o), load); }));
  };
  ctx.el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { status = b.dataset.st; ctx.el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); load().catch(fail); }));
  ctx.el.querySelector('[data-branch-local]')?.addEventListener('change', (e) => { branch = e.target.value; load().catch(fail); });
  await load();
}

function labModal(o, done) {
  const tests = structuredClone(o.tests || []);
  const flagOf = (t) => {
    const m = byId(B().lab_tests, t.test_id);
    const v = parseFloat(String(t.result ?? '').replace(',', '.'));
    if (!m || !Number.isFinite(v)) return t.flag || '';
    return m.ref_high != null && v > m.ref_high ? 'H' : m.ref_low != null && v < m.ref_low ? 'L' : '';
  };
  const m = modal({
    title: `${esc(o.lab_no)} · ${esc(o.patient_name)}`, size: 'wide',
    body: `<div class="row small muted" style="margin-bottom:10px">${esc(o.mrn)} · ${esc(doctorName(o.doctor_id))} · ${statusBadge(O().labStatus, o.status)}${o.notes ? ` · ${T('Catatan', 'Notes')}: ${esc(o.notes)}` : ''}</div>
    <div class="tbl-wrap"><table class="tbl items-tbl"><thead><tr><th>${T('Pemeriksaan', 'Test')}</th><th>${T('Hasil', 'Result')}</th><th>${T('Satuan', 'Unit')}</th><th>${T('Rujukan', 'Reference')}</th><th>Flag</th></tr></thead><tbody>${tests.map((t, i) => `<tr><td><b>${esc(t.name)}</b></td><td style="width:140px"><input data-res="${i}" value="${esc(t.result || '')}"></td><td>${esc(t.unit || '')}</td><td class="small">${esc(t.ref || '')}</td><td data-flag="${i}">${t.flag ? `<span class="badge bad">${esc(t.flag)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <label class="f" style="margin-top:12px">${T('Catatan / kesan', 'Notes / impression')}<textarea data-notes rows="2">${esc(o.notes || '')}</textarea></label>`,
    actions: [
      { label: T('Tutup', 'Close') },
      { label: `${icon('download', '', 16)} PDF`, onClick: () => { openDoc(`/api/docs/lab/${o.id}`); return false; } },
      { label: T('Sampel diambil', 'Sample taken'), onClick: () => save('sampled') },
      { label: T('Simpan hasil', 'Save results'), onClick: () => save('completed') },
      { label: `${icon('check-circle', '', 16)} ${T('Validasi & terbitkan', 'Validate & publish')}`, cls: 'primary', onClick: () => save('validated') },
    ],
  });
  m.el.querySelectorAll('[data-res]').forEach((i) => (i.oninput = () => {
    const t = tests[+i.dataset.res];
    t.result = i.value;
    t.flag = flagOf(t);
    m.el.querySelector(`[data-flag="${i.dataset.res}"]`).innerHTML = t.flag ? `<span class="badge bad">${t.flag}</span>` : '';
  }));
  async function save(status) {
    await api(`/api/lab/orders/${o.id}`, { method: 'PUT', body: { tests, status, notes: m.el.querySelector('[data-notes]').value } });
    toast(status === 'validated' ? T('Hasil divalidasi & tersedia di portal pasien', 'Validated and published to patient portal') : T('Tersimpan', 'Saved'));
    done && done();
  }
}

// ================================================================== PHARMACY
export async function pharmacy(ctx) {
  ctx.title(T('Farmasi & Stok', 'Pharmacy & Stock'), T('Pelayanan harian', 'Daily operations'));
  const tab = ctx.params.tab || 'resep';
  let branch = curBranch();
  const tabs = [['resep', icon('pill', '', 16) + ' ' + T('Resep masuk', 'Prescriptions'), can('pharmacy:dispense')], ['stok', icon('box', '', 16) + ' ' + T('Stok obat', 'Stock'), true], ['jual', icon('cart', '', 16) + ' ' + T('Penjualan (POS)', 'Sales (POS)'), can('pharmacy:sale')], ['peringatan', icon('alert', '', 16) + ' ' + T('Peringatan', 'Alerts'), true], ['po', icon('truck', '', 16) + ' ' + T('Purchase order', 'Purchase orders'), can('purchase_orders:view')]].filter((t) => t[2]);
  ctx.el.innerHTML = `<div class="toolbar"><div class="tabs" style="margin:0">${tabs.map(([k, l]) => `<a href="#/pharmacy/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><span class="grow"></span>${branchSelect(branch)}</div><div data-body>${loading()}</div>`;
  const body = ctx.el.querySelector('[data-body]');
  const run = () => ({ resep: rxTab, stok: stockTab, jual: posTab, peringatan: alertTab, po: poTab })[tab]?.(ctx, body, branch);
  ctx.el.querySelector('[data-branch-local]')?.addEventListener('change', (e) => { branch = e.target.value; run().catch(fail); });
  await run();
}

async function rxTab(ctx, body, branch) {
  const { rows } = await api(`/api/pharmacy/prescriptions?branch=${branch}&status=open`);
  if (!alive(ctx)) return;
  body.innerHTML = rows.length ? `<div class="grid g3">${rows.map((r) => `<div class="card"><div class="row-between"><b class="mono">${esc(r.rx_no)}</b>${r.queue_no ? `<span class="badge pri">${esc(r.queue_no)}</span>` : ''}</div><div style="margin:6px 0"><b>${esc(r.patient_name)}</b> <span class="small muted">${esc(r.mrn)}</span></div>${r.allergies ? `<div class="alert bad small" style="padding:6px 10px">${icon('alert', '', 14)} ${esc(r.allergies)}</div>` : ''}<div class="small muted">${esc(doctorName(r.doctor_id))} · ${fdate(r.date)}</div><ul class="small" style="padding-left:18px">${(r.items || []).map((i) => `<li><b>${esc(i.name)}</b> × ${num(i.qty)} ${esc(i.unit || '')}<br><span class="muted">${esc(i.dose || '')}</span></li>`).join('')}</ul><div class="row-between">${r.invoice_status ? statusBadge(O().invStatus, r.invoice_status) : `<span class="badge">${T('Belum ditagih', 'Not billed')}</span>`}<span class="btn-group"><button class="btn sm ghost" data-open="/api/docs/prescription/${r.id}">${icon('printer', '', 14)}</button><button class="btn sm primary" data-disp="${r.id}" data-paid="${r.invoice_status === 'paid' ? 1 : 0}">${icon('check', '', 14)} ${T('Serahkan', 'Dispense')}</button></span></div></div>`).join('')}</div>` : `<div class="card">${emptyState(T('Tidak ada resep yang menunggu', 'No pending prescriptions'), 'pill')}</div>`;
  body.querySelectorAll('[data-disp]').forEach((b) => (b.onclick = async () => {
    const warn = b.dataset.paid === '1' ? '' : `<br><span style="color:var(--warn)">${T('Catatan: invoice belum lunas.', 'Note: invoice not yet paid.')}</span>`;
    if (!(await confirmBox(T('Serahkan obat? Stok akan dikurangi otomatis (FEFO — kedaluwarsa terdekat keluar lebih dulu).', 'Dispense? Stock will be deducted automatically (FEFO).') + warn))) return;
    try { await api(`/api/pharmacy/prescriptions/${b.dataset.disp}/dispense`, { method: 'POST' }); toast(T('Obat diserahkan, stok diperbarui', 'Dispensed, stock updated')); rxTab(ctx, body, branch); } catch (e) { fail(e); }
  }));
}

async function stockTab(ctx, body, branch) {
  let qv = '', low = false;
  body.innerHTML = `<div class="toolbar"><div class="search">${icon('search', '', 16)}<input type="search" data-q placeholder="${T('Cari obat…', 'Search medicine…')}"></div><label class="switch"><input type="checkbox" data-low><span>${T('Hanya stok menipis', 'Low stock only')}</span></label><span class="grow"></span>${can('pharmacy:stock') ? `<button class="btn primary" data-in>${icon('plus', '', 16)} ${T('Terima stok', 'Receive stock')}</button><button class="btn" data-trf>${icon('repeat', '', 16)} ${T('Mutasi cabang', 'Transfer')}</button>` : ''}${can('medicines:create') ? `<a class="btn" href="#/data/medicines/new">${icon('plus', '', 16)} ${T('Obat baru', 'New medicine')}</a>` : ''}</div><div data-t>${loading()}</div>`;
  const load = async () => {
    const { rows } = await api(`/api/pharmacy/stock?branch=${branch}&q=${encodeURIComponent(qv)}${low ? '&low=1' : ''}&limit=100`);
    if (!alive(ctx)) return;
    const soon = addDays(today(), 90);
    body.querySelector('[data-t]').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${T('Kode', 'Code')}</th><th>${T('Obat', 'Medicine')}</th><th>${T('Kategori', 'Category')}</th><th class="num">${T('Stok', 'Stock')}</th><th class="num">Min</th><th>${T('Exp. terdekat', 'Nearest exp.')}</th><th class="num">${T('Harga jual', 'Price')}</th></tr></thead><tbody>${rows.map((r) => `<tr class="click" data-m="${r.id}"><td class="mono small">${esc(r.code)}</td><td><b>${esc(r.name)}</b> <span class="muted small">${esc(r.strength || '')} · ${esc(r.unit_name || '')}</span>${r.requires_rx ? ' <span class="badge info">Rx</span>' : ''}</td><td class="small">${esc(r.category_name || '')}</td><td class="num"><b style="${r.stock <= r.min_stock ? 'color:var(--bad)' : ''}">${num(r.stock)}</b></td><td class="num muted">${num(r.min_stock)}</td><td>${r.nearest_exp ? `<span class="${r.nearest_exp <= soon ? 'badge warn' : 'small'}">${fdate(r.nearest_exp)}</span>` : '<span class="faint">—</span>'}</td><td class="num">${money(r.price_sell)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState(T('Tidak ada data obat', 'No medicines'), 'box')}</div>`;
    body.querySelectorAll('[data-m]').forEach((tr) => (tr.onclick = () => batchDrawer(rows.find((x) => String(x.id) === tr.dataset.m), branch, load)));
  };
  body.querySelector('[data-q]').oninput = debounce((e) => { qv = e.target.value.trim(); load().catch(fail); }, 300);
  body.querySelector('[data-low]').onchange = (e) => { low = e.target.checked; load().catch(fail); };
  body.querySelector('[data-in]')?.addEventListener('click', () => receiveModal(branch, load));
  body.querySelector('[data-trf]')?.addEventListener('click', () => transferModal(branch, load));
  await load();
}

async function batchDrawer(med, branch, done) {
  const d = await api(`/api/pharmacy/stock/${med.id}/batches?branch=${branch}`);
  const dr = drawer({ title: `${esc(med.name)} ${esc(med.strength || '')}`, body: `<div class="row-between" style="margin-bottom:12px"><span class="muted">${T('Total stok', 'Total stock')}</span><b class="bignum" style="font-size:2rem">${num(med.stock)}</b></div>
  <h3>${T('Batch', 'Batches')}</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Batch</th><th>Exp.</th><th class="num">Qty</th><th></th></tr></thead><tbody>${d.batches.map((b) => `<tr><td class="mono small">${esc(b.batch_no)}</td><td>${fdate(b.expired_at)}</td><td class="num"><b>${num(b.qty)}</b></td><td class="act">${can('pharmacy:stock') ? `<button class="btn sm" data-adj="${b.id}" data-q="${b.qty}">${T('Opname / sesuaikan', 'Count / adjust')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${T('Belum ada batch', 'No batches')}</td></tr>`}</tbody></table></div>
  <h3 style="margin-top:18px">${T('Mutasi terakhir', 'Recent movements')}</h3><div class="timeline">${d.moves.map((m) => `<div class="tl-item"><b>${esc(optLabel2(m.type))} <span style="color:${m.qty < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${num(m.qty)}</span></b><span class="tiny muted">${fdt(m.created_at)} · ${esc(m.ref || '')} · ${esc(m.user_name || '')}${m.note ? ' · ' + esc(m.note) : ''}</span></div>`).join('') || `<p class="muted small">—</p>`}</div>` });
  dr.el.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => modal({
    title: T('Stock opname / penyesuaian', 'Stock count / adjustment'),
    body: `<div class="stack"><div class="row-between"><span class="muted">${T('Qty sistem', 'System qty')}</span><b>${num(b.dataset.q)}</b></div><label class="f">${T('Qty fisik (hasil hitung)', 'Counted qty')}<input type="number" min="0" data-nq value="${b.dataset.q}"></label><label class="f">${T('Jenis', 'Type')}<select data-type><option value="opname">Stock opname</option><option value="adjust">${T('Penyesuaian', 'Adjustment')}</option><option value="expired">${T('Kedaluwarsa / rusak', 'Expired / damaged')}</option><option value="return">${T('Retur ke supplier', 'Return to supplier')}</option></select></label><label class="f"><span class="req">${T('Alasan', 'Reason')}</span><input data-reason></label></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Simpan', 'Save'), cls: 'primary', onClick: async (el) => {
      await api('/api/pharmacy/stock/adjust', { method: 'POST', body: { batch_id: +b.dataset.adj, new_qty: Number(el.querySelector('[data-nq]').value), type: el.querySelector('[data-type]').value, reason: el.querySelector('[data-reason]').value } });
      toast(T('Stok diperbarui', 'Stock updated'));
      dr.close();
      done();
    } }],
  })));
}
const optLabel2 = (t) => (O().moveType || []).find((o) => o[0] === t)?.[S.lang === 'en' ? 2 : 1] || t;

function medPicker(el, onPick, branch) {
  const inp = el.querySelector('[data-mp]'), pop = el.querySelector('[data-mpp]');
  inp.oninput = debounce(async () => {
    const { rows } = await api(`/api/pharmacy/search?q=${encodeURIComponent(inp.value.trim())}&branch=${branch}`);
    pop.innerHTML = rows.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r.name)}</b> ${esc(r.strength || '')} <span class="muted small">${T('stok', 'stock')} ${num(r.stock)} · ${money(r.price_sell)}</span></button>`).join('') || `<div class="empty small">—</div>`;
    pop.classList.remove('hide');
    pop.querySelectorAll('[data-i]').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); const r = rows[b.dataset.i]; inp.value = `${r.name} ${r.strength || ''}`; pop.classList.add('hide'); onPick(r); }));
  }, 200);
  inp.onblur = () => setTimeout(() => pop.classList.add('hide'), 200);
}

function receiveModal(branch, done) {
  let med = null;
  const m = modal({
    title: T('Terima stok obat', 'Receive stock'), size: 'wide',
    body: `<div class="form-grid"><div class="f refpick" style="grid-column:1/-1"><span class="req">${T('Obat', 'Medicine')}</span><input data-mp placeholder="${T('Cari obat…', 'Search…')}"><div class="pop hide" data-mpp></div></div><label class="f"><span class="req">No. batch</span><input data-bn></label><label class="f"><span class="req">${T('Tanggal kedaluwarsa', 'Expiry date')}</span><input type="date" data-exp></label><label class="f"><span class="req">Qty</span><input type="number" min="1" data-qty></label><label class="f">${T('Harga beli / unit', 'Unit cost')}<input type="number" data-cost></label><label class="f" style="grid-column:1/-1">${T('Catatan / No. faktur', 'Note / invoice no.')}<input data-note></label></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Simpan penerimaan', 'Save'), cls: 'primary', onClick: async (el) => {
      if (!med) throw new Error(T('Pilih obat', 'Choose a medicine'));
      await api('/api/pharmacy/stock/in', { method: 'POST', body: { medicine_id: med.id, branch_id: branch, batch_no: el.querySelector('[data-bn]').value, expired_at: el.querySelector('[data-exp]').value, qty: Number(el.querySelector('[data-qty]').value), cost: Number(el.querySelector('[data-cost]').value) || undefined, note: el.querySelector('[data-note]').value } });
      toast(T('Stok bertambah', 'Stock received'));
      done();
    } }],
  });
  medPicker(m.el, (r) => (med = r), branch);
}

function transferModal(branch, done) {
  let med = null;
  const m = modal({
    title: T('Mutasi stok antar cabang', 'Transfer stock between branches'),
    body: `<div class="stack"><div class="f refpick"><span class="req">${T('Obat', 'Medicine')}</span><input data-mp><div class="pop hide" data-mpp></div></div><label class="f">${T('Dari cabang', 'From')}<input disabled value="${esc(branchName(branch))}"></label><label class="f">${T('Ke cabang', 'To')}<select data-to>${sorted(active(B().branches)).filter((b) => b.id !== branch).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label><label class="f">Qty<input type="number" min="1" data-qty></label></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Mutasi', 'Transfer'), cls: 'primary', onClick: async (el) => {
      if (!med) throw new Error(T('Pilih obat', 'Choose a medicine'));
      const r = await api('/api/pharmacy/stock/transfer', { method: 'POST', body: { medicine_id: med.id, from_branch: branch, to_branch: el.querySelector('[data-to]').value, qty: Number(el.querySelector('[data-qty]').value) } });
      toast(`${T('Mutasi berhasil', 'Transferred')} (${r.ref})`);
      done();
    } }],
  });
  medPicker(m.el, (r) => (med = r), branch);
}

async function posTab(ctx, body, branch) {
  const cart = [];
  let method = 'cash';
  body.innerHTML = `<div class="pos"><div class="card"><div class="refpick"><input data-mp placeholder="${T('Scan barcode / cari obat untuk ditambahkan…', 'Scan / search medicine to add…')}" autofocus><div class="pop hide" data-mpp></div></div><div data-cart style="margin-top:14px"></div></div>
  <div class="card stack"><label class="f">${T('Nama pelanggan (opsional)', 'Customer name (optional)')}<input data-cust></label><div class="total-box" data-tot></div>
  <div class="pay-methods">${[['cash', 'banknote', T('Tunai', 'Cash')], ['qris', 'qr', 'QRIS'], ['transfer', 'send', 'Transfer'], ['card', 'wallet', T('Kartu', 'Card')], ['ewallet', 'smartphone', 'E-wallet'], ['va', 'building', 'VA']].map(([k, ic, l]) => `<button type="button" data-pm="${k}" class="${k === method ? 'on' : ''}">${icon(ic, '', 20)}${l}</button>`).join('')}</div>
  <label class="f">${T('Uang diterima', 'Amount received')}<input type="number" data-paid></label><div data-change class="right muted"></div><button class="btn primary lg block" data-go>${icon('check', '', 18)} ${T('Proses penjualan', 'Complete sale')}</button></div></div>`;
  const total = () => cart.reduce((a, c) => a + c.qty * c.price, 0);
  const draw = () => {
    body.querySelector('[data-cart]').innerHTML = cart.length ? cart.map((c, i) => `<div class="cart-line"><span><b>${esc(c.name)}</b><div class="tiny muted">${money(c.price)} · ${T('stok', 'stock')} ${num(c.stock)}</div></span><input type="number" min="1" data-cq="${i}" value="${c.qty}"><b class="right">${money(c.qty * c.price)}</b><button class="btn sm ghost danger" data-cr="${i}">${icon('x', '', 14)}</button></div>`).join('') : emptyState(T('Keranjang kosong', 'Cart is empty'), 'cart');
    body.querySelector('[data-tot]').innerHTML = `<div><span>${T('Item', 'Items')}</span><b>${cart.reduce((a, c) => a + c.qty, 0)}</b></div><div><span>Total</span><span class="big">${money(total())}</span></div>`;
    body.querySelectorAll('[data-cq]').forEach((i) => (i.oninput = () => { cart[+i.dataset.cq].qty = Math.max(1, Number(i.value) || 1); body.querySelector('[data-tot]').querySelector('.big').textContent = money(total()); }));
    body.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = () => { cart.splice(+b.dataset.cr, 1); draw(); }));
    const paid = Number(body.querySelector('[data-paid]').value) || 0;
    body.querySelector('[data-change]').textContent = paid > total() ? `${T('Kembalian', 'Change')}: ${money(paid - total())}` : '';
  };
  medPicker(body, (r) => {
    const ex = cart.find((c) => c.id === r.id);
    ex ? ex.qty++ : cart.push({ id: r.id, name: `${r.name} ${r.strength || ''}`.trim(), price: r.price_sell, qty: 1, stock: r.stock });
    body.querySelector('[data-mp]').value = '';
    draw();
  }, branch);
  body.querySelectorAll('[data-pm]').forEach((b) => (b.onclick = () => { method = b.dataset.pm; body.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('on', x === b)); }));
  body.querySelector('[data-paid]').oninput = draw;
  body.querySelector('[data-go]').onclick = async (e) => {
    if (!cart.length) return toast(T('Keranjang kosong', 'Cart is empty'), 'bad');
    e.target.classList.add('busy');
    try {
      const paid = Number(body.querySelector('[data-paid]').value) || total();
      const r = await api('/api/pharmacy/sale', { method: 'POST', body: { branch_id: branch, items: cart.map((c) => ({ medicine_id: c.id, qty: c.qty })), customer_name: body.querySelector('[data-cust]').value, method, amount_paid: paid } });
      modal({ title: T('Penjualan berhasil', 'Sale completed'), body: `<div class="center stack" style="justify-items:center"><div class="success-ic">${icon('check-circle', '', 40)}</div><b class="mono">${esc(r.invoice_no)}</b><div class="bignum" style="font-size:2.2rem">${money(r.total)}</div>${r.payment?.change ? `<div class="alert ok">${T('Kembalian', 'Change')}: <b>${money(r.payment.change)}</b></div>` : ''}</div>`, actions: [{ label: 'Invoice PDF', onClick: () => { openDoc(`/api/docs/invoice/${r.invoice_id}`); return false; } }, ...(r.payment ? [{ label: T('Kwitansi', 'Receipt'), onClick: () => { openDoc(`/api/docs/receipt/${r.payment.id}`); return false; } }] : []), { label: T('Transaksi baru', 'New sale'), cls: 'primary' }] });
      cart.length = 0;
      body.querySelector('[data-paid]').value = '';
      body.querySelector('[data-cust]').value = '';
      draw();
    } catch (err) { fail(err); } finally { e.target.classList.remove('busy'); }
  };
  draw();
}

async function alertTab(ctx, body, branch) {
  const d = await api(`/api/pharmacy/alerts?branch=${branch}`);
  if (!alive(ctx)) return;
  const sec = (title, ic, rows, cols) => `<div class="card"><div class="card-h"><h3>${icon(ic, '', 18)} ${title}</h3><span class="badge ${rows.length ? 'warn' : 'ok'}">${rows.length}</span></div>${rows.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${rows.map(cols).join('')}</tbody></table></div>` : `<p class="muted small">${T('Aman', 'All good')} ✓</p>`}</div>`;
  body.innerHTML = `<div class="grid g3">${sec(T('Stok di bawah minimum', 'Below minimum stock'), 'alert', d.low, (r) => `<tr><td><b>${esc(r.name)}</b> <span class="muted small">${esc(r.strength || '')}</span></td><td class="num"><b style="color:var(--bad)">${num(r.stock)}</b> / ${num(r.min_stock)}</td></tr>`)}
  ${sec(T('Kedaluwarsa ≤ 90 hari', 'Expiring ≤ 90 days'), 'clock', d.expiring, (r) => `<tr><td><b>${esc(r.name)}</b><div class="tiny muted mono">${esc(r.batch_no)}</div></td><td>${fdate(r.expired_at)}</td><td class="num">${num(r.qty)}</td></tr>`)}
  ${sec(T('Sudah kedaluwarsa', 'Expired'), 'x-circle', d.expired, (r) => `<tr><td><b>${esc(r.name)}</b><div class="tiny muted mono">${esc(r.batch_no)}</div></td><td>${fdate(r.expired_at)}</td><td class="num">${num(r.qty)}</td><td class="act">${can('pharmacy:stock') ? `<button class="btn sm danger" data-wo="${r.id}">${T('Musnahkan', 'Write off')}</button>` : ''}</td></tr>`)}</div>${can('purchase_orders:create') ? `<div style="margin-top:14px"><a class="btn primary" href="#/data/purchase_orders/new">${icon('truck', '', 16)} ${T('Buat purchase order', 'Create purchase order')}</a></div>` : ''}`;
  body.querySelectorAll('[data-wo]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox(T('Catat pemusnahan obat kedaluwarsa ini (stok batch menjadi 0)?', 'Write off this expired batch?'), { danger: true }))) return;
    try { await api('/api/pharmacy/stock/adjust', { method: 'POST', body: { batch_id: +b.dataset.wo, new_qty: 0, type: 'expired', reason: 'Pemusnahan obat kedaluwarsa' } }); alertTab(ctx, body, branch); } catch (e) { fail(e); }
  }));
}

async function poTab(ctx, body, branch) {
  const r = await api(`/api/crud/purchase_orders?limit=50${S.user.branch_id ? '' : '&f_branch_id=' + branch}`);
  if (!alive(ctx)) return;
  body.innerHTML = `<div class="toolbar"><span class="grow"></span>${can('purchase_orders:create') ? `<a class="btn primary" href="#/data/purchase_orders/new">${icon('plus', '', 16)} PO ${T('baru', 'new')}</a>` : ''}</div>${r.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No. PO</th><th>${T('Tanggal', 'Date')}</th><th>Supplier</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>${r.rows.map((p) => `<tr class="click" onclick="location.hash='#/data/purchase_orders/${p.id}'"><td class="mono"><b>${esc(p.po_no)}</b></td><td>${fdate(p.date)}</td><td>${esc(r.refs?.supplier_id?.[p.supplier_id] || '')}</td><td class="num">${money(p.total)}</td><td>${statusBadge(O().poStatus, p.status)}</td><td class="act">${p.status !== 'received' && p.status !== 'cancelled' && can('pharmacy:stock') ? `<button class="btn sm primary" data-po-recv="${p.id}">${icon('truck', '', 14)} ${T('Terima', 'Receive')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState(T('Belum ada purchase order', 'No purchase orders'), 'truck')}</div>`}`;
}

// ================================================================== CASHIER
export async function cashier(ctx) {
  ctx.title(T('Kasir & Pembayaran', 'Cashier & Payments'), T('Pelayanan harian', 'Daily operations'));
  let status = ctx.query.status || 'open', qv = '', branch = curBranch();
  ctx.el.innerHTML = `<div class="toolbar">${branchSelect(branch)}<div class="tabs" style="margin:0">${[['open', T('Belum lunas', 'Open')], ['today', T('Hari ini', 'Today')], ['paid', T('Lunas', 'Paid')], ['all', T('Semua', 'All')]].map(([k, l]) => `<button data-st="${k}" class="${status === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="search">${icon('search', '', 16)}<input type="search" data-q placeholder="${T('No. invoice / nama / No. RM', 'Invoice / name / MRN')}"></div><span class="grow"></span><a class="btn" href="#/pharmacy/jual">${icon('cart', '', 16)} ${T('Penjualan obat', 'Pharmacy sale')}</a>${can('invoices:create') ? `<a class="btn" href="#/data/invoices/new">${icon('plus', '', 16)} ${T('Invoice manual', 'Manual invoice')}</a>` : ''}</div><div data-body>${loading()}</div>`;
  const load = async () => {
    const d = await api(`/api/billing/cashier?branch=${branch}&status=${status}${qv ? '&q=' + encodeURIComponent(qv) : ''}`);
    if (!alive(ctx)) return;
    ctx.el.querySelector('[data-body]').innerHTML = `<div class="grid g3" style="margin-bottom:16px">${kpi(T('Penerimaan hari ini', 'Collected today'), money(d.today?.total), { icon: 'banknote', tone: 'gold', sub: `${num(d.today?.n)} ${T('transaksi', 'transactions')}` })}<div class="card">${hbars((d.byMethod || []).map((m) => ({ label: optLabelPay(m.method), value: m.total })), { fmt: money })}</div>${kpi(T('Menunggu konfirmasi', 'Awaiting confirmation'), num(d.pending.length), { icon: 'wallet', tone: d.pending.length ? 'warn' : '' })}</div>
    ${d.pending.length ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${icon('wallet', '', 18)} ${T('Konfirmasi pembayaran (transfer / bukti dari pasien)', 'Confirm payments (transfer proofs)')}</h3></div><div class="tbl-wrap"><table class="tbl"><tbody>${d.pending.map((p) => `<tr><td class="mono small">${esc(p.payment_no)}</td><td><b>${esc(p.patient_name || '')}</b><div class="tiny muted">${esc(p.invoice_no)}</div></td><td>${esc(optLabelPay(p.method))}</td><td class="num"><b>${money(p.amount)}</b></td><td class="act">${p.proof ? `<a class="btn sm" href="${fileUrl(p.proof)}" target="_blank" rel="noopener">${icon('image', '', 14)} ${T('Bukti', 'Proof')}</a>` : ''}<button class="btn sm primary" data-ok="${p.id}">${T('Terima', 'Approve')}</button><button class="btn sm danger" data-no="${p.id}">${T('Tolak', 'Reject')}</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>${T('Tanggal', 'Date')}</th><th>${T('Pasien / pelanggan', 'Patient / customer')}</th><th>${T('Jenis', 'Type')}</th><th class="num">Total</th><th class="num">${T('Terbayar', 'Paid')}</th><th>Status</th><th></th></tr></thead><tbody>${d.rows.map((i) => `<tr class="click" data-inv="${i.id}"><td class="mono"><b>${esc(i.invoice_no)}</b></td><td>${fdate(i.date)}</td><td><b>${esc(i.patient_name || i.customer_name || T('Umum', 'Walk-in'))}</b>${i.mrn ? `<div class="tiny muted">${esc(i.mrn)}${i.queue_no ? ' · ' + esc(i.queue_no) : ''}</div>` : ''}</td><td>${statusBadge(O().invType, i.type)}</td><td class="num">${money(i.total)}</td><td class="num">${money(i.paid)}</td><td>${statusBadge(O().invStatus, i.status)}</td><td class="act"><button class="btn sm ghost" data-open="/api/docs/invoice/${i.id}">${icon('download', '', 14)}</button><a class="btn sm primary" href="#/cashier/${i.id}">${i.status === 'paid' ? T('Detail', 'Detail') : T('Bayar', 'Pay')}</a></td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState(T('Tidak ada invoice', 'No invoices'), 'receipt')}</div>`}`;
    ctx.el.querySelectorAll('[data-inv]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = `#/cashier/${tr.dataset.inv}`; }));
    ctx.el.querySelectorAll('[data-ok],[data-no]').forEach((b) => (b.onclick = async () => { try { await api(`/api/billing/payments/${b.dataset.ok || b.dataset.no}/confirm`, { method: 'POST', body: { approve: !!b.dataset.ok } }); toast(b.dataset.ok ? T('Pembayaran dikonfirmasi', 'Payment confirmed') : T('Pembayaran ditolak', 'Payment rejected')); load(); } catch (e) { fail(e); } }));
  };
  ctx.el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { status = b.dataset.st; ctx.el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); load().catch(fail); }));
  ctx.el.querySelector('[data-q]').oninput = debounce((e) => { qv = e.target.value.trim(); load().catch(fail); }, 300);
  ctx.el.querySelector('[data-branch-local]')?.addEventListener('change', (e) => { branch = e.target.value; load().catch(fail); });
  await load();
  const timer = setInterval(() => (alive(ctx) ? load().catch(() => {}) : clearInterval(timer)), 30000);
}
const optLabelPay = (m) => (O().payMethod || []).find((o) => o[0] === m)?.[S.lang === 'en' ? 2 : 1] || m;

export async function invoice(ctx) {
  const id = ctx.params.id;
  const d = await api(`/api/billing/invoices/${id}`);
  if (!alive(ctx)) return;
  const inv = d.invoice;
  ctx.title(`Invoice ${inv.invoice_no}`, T('Kasir', 'Cashier'));
  const editable = !['paid', 'refunded', 'void'].includes(inv.status) && canAny('billing:cashier', 'invoices:update');
  const items = structuredClone(inv.items || []);
  const due = Math.max(0, inv.total - inv.paid);
  let method = 'cash';
  const p = d.patient;
  const s = B().settings || {};
  ctx.el.innerHTML = `<div class="row-between" style="margin-bottom:14px"><a class="btn ghost" href="#/cashier">${icon('arrow-left', '', 16)} ${T('Kembali', 'Back')}</a><div class="btn-group"><button class="btn" data-open="/api/docs/invoice/${inv.id}">${icon('download', '', 16)} Invoice PDF</button>${p?.phone ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${String(p.phone).replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(`Halo ${p.name}, tagihan ${inv.invoice_no} sebesar ${money(inv.total)}${due ? ` (sisa ${money(due)})` : ' telah LUNAS'}. Invoice dapat diunduh di portal pasien: ${location.origin}/app/#/portal/invoices`)}">${icon('message', '', 16)} WhatsApp</a>` : ''}${inv.visit_id && editable ? `<button class="btn" data-rebuild>${icon('refresh', '', 16)} ${T('Hitung ulang dari kunjungan', 'Rebuild from visit')}</button>` : ''}${inv.insurer_id && can('claims:create') ? `<button class="btn" data-claim>${icon('shield', '', 16)} ${T('Buat klaim', 'Create claim')}</button>` : ''}${inv.paid <= 0 && inv.status !== 'void' && editable ? `<button class="btn danger" data-void>${icon('x-circle', '', 16)} Void</button>` : ''}</div></div>
  <div class="split"><div class="stack"><div class="card"><div class="row-between"><div><span class="muted small">${T('Ditagihkan kepada', 'Bill to')}</span><h2 style="margin:2px 0">${esc(p?.name || inv.customer_name || T('Pelanggan umum', 'Walk-in customer'))}</h2><span class="small muted">${esc(p?.mrn || '')} ${p?.phone ? '· ' + esc(p.phone) : ''}</span></div><div class="right">${statusBadge(O().invStatus, inv.status)}<div class="mono small" style="margin-top:6px">${esc(inv.invoice_no)}</div><div class="small muted">${fdate(inv.date)}</div></div></div></div>
  <div class="card"><div class="card-h"><h3>${T('Rincian tagihan', 'Line items')}</h3>${editable ? `<div class="btn-group"><select data-addsel style="width:auto"><option value="">+ ${T('Tambah item…', 'Add item…')}</option><optgroup label="${T('Tindakan', 'Procedures')}">${sorted(active(B().procedures)).map((x) => `<option value="p:${x.id}">${esc(x.name)} — ${money(x.price)}</option>`).join('')}</optgroup><optgroup label="Lab">${active(B().lab_tests).map((x) => `<option value="l:${x.id}">${esc(x.name)} — ${money(x.price)}</option>`).join('')}</optgroup><option value="custom">${T('Item lain (manual)', 'Other (manual)')}</option></select></div>` : ''}</div><div data-items></div>
  <div class="form-grid" style="margin-top:14px"><label class="f">${T('Diskon tambahan (Rp)', 'Extra discount (Rp)')}<input type="number" data-disc value="${inv.discount || 0}" ${editable ? '' : 'disabled'}></label><label class="f">${T('Kode kupon', 'Coupon code')}<input data-coupon value="${esc(inv.coupon || '')}" ${editable ? '' : 'disabled'} style="text-transform:uppercase"></label><label class="f">${T('Penjamin', 'Payer')}<select data-payer ${editable ? '' : 'disabled'}>${PAYERS().map((o) => `<option value="${o[0]}" ${o[0] === inv.payer_type ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label><label class="f">${T('Asuransi', 'Insurer')}<select data-ins ${editable ? '' : 'disabled'}><option value="">—</option>${active(B().insurers).map((x) => `<option value="${x.id}" ${x.id === inv.insurer_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><label class="f" style="grid-column:1/-1">${T('Catatan', 'Notes')}<input data-notes value="${esc(inv.notes || '')}" ${editable ? '' : 'disabled'}></label></div>
  ${editable ? `<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn primary" data-saveinv>${icon('check', '', 16)} ${T('Simpan perubahan', 'Save changes')}</button></div>` : ''}</div>
  <div class="card"><div class="card-h"><h3>${T('Riwayat pembayaran', 'Payments')}</h3></div>${d.payments.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${d.payments.map((py) => `<tr><td class="mono small">${esc(py.payment_no)}<div class="tiny muted">${fdate(py.date)} · ${esc(py.confirmed_by || '')}</div></td><td>${esc(optLabelPay(py.method))}${py.reference ? `<div class="tiny muted">${esc(py.reference)}</div>` : ''}</td><td class="num"><b>${money(py.amount)}</b></td><td>${statusBadge(O().payStatus, py.status)}</td><td class="act">${py.proof ? `<a class="btn sm ghost" href="${fileUrl(py.proof)}" target="_blank">${icon('image', '', 14)}</a>` : ''}${['confirmed', 'refunded'].includes(py.status) ? `<button class="btn sm ghost" data-open="/api/docs/receipt/${py.id}">${icon('receipt', '', 14)} ${T('Kwitansi', 'Receipt')}</button>` : ''}${py.status === 'confirmed' && can('billing:refund') ? `<button class="btn sm ghost danger" data-refund="${py.id}" data-amt="${py.amount}">${icon('rotate', '', 14)} Refund</button>` : ''}</td></tr>`).join('')}${d.refunds.map((r) => `<tr><td class="mono small">${esc(r.refund_no)}</td><td>Refund · ${esc(r.reason)}</td><td class="num" style="color:var(--bad)">-${money(r.amount)}</td><td>${statusBadge([], r.status)}</td><td></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted small">${T('Belum ada pembayaran', 'No payments yet')}</p>`}
  ${d.claims.length ? `<h3 style="margin-top:14px">${T('Klaim', 'Claims')}</h3>${d.claims.map((c) => `<a class="row-between" href="#/data/claims/${c.id}" style="padding:6px 0"><span class="mono small">${esc(c.claim_no)}</span><span>${statusBadge(O().claimStatus, c.status)} ${money(c.amount)}</span></a>`).join('')}` : ''}</div></div>
  <aside class="stack"><div class="card"><div class="total-box" data-tot></div>
  ${due > 0 && inv.status !== 'void' && can('billing:cashier') ? `<h3 style="margin-top:16px">${T('Terima pembayaran', 'Receive payment')}</h3><div class="pay-methods">${[['cash', 'banknote', T('Tunai', 'Cash')], ['qris', 'qr', 'QRIS'], ['transfer', 'send', 'Transfer'], ['card', 'wallet', T('Kartu', 'Card')], ['ewallet', 'smartphone', 'E-wallet'], ['va', 'building', 'VA'], ['insurance', 'shield', T('Asuransi', 'Insurance')]].map(([k, ic, l]) => `<button type="button" data-pm="${k}" class="${k === method ? 'on' : ''}">${icon(ic, '', 20)}${l}</button>`).join('')}</div>
  <label class="f" style="margin-top:12px">${T('Jumlah', 'Amount')}<input type="number" data-amt value="${due}"></label><div class="chips" style="margin-top:6px">${[due, Math.ceil(due / 50000) * 50000, Math.ceil(due / 100000) * 100000].filter((x, i, a) => a.indexOf(x) === i).map((x) => `<button class="chip" data-quick="${x}">${money(x)}</button>`).join('')}</div>
  <label class="f" style="margin-top:10px">${T('Referensi (no. transaksi/approval)', 'Reference')}<input data-ref></label><div data-change class="right small" style="margin:8px 0"></div>
  <button class="btn primary lg block" data-pay>${icon('check-circle', '', 18)} ${T('Terima pembayaran', 'Receive payment')}</button>${S.meta?.env?.midtrans ? `<button class="btn block" data-gw style="margin-top:8px">${icon('external', '', 16)} ${T('Link bayar online (VA/e-wallet/kartu)', 'Online payment link')}</button>` : ''}` : inv.status === 'paid' ? `<div class="alert ok" style="margin-top:14px">${icon('check-circle', '', 18)} ${T('Invoice lunas', 'Invoice paid')}</div>` : ''}</div>
  ${s.qris_image ? `<div class="card center"><h3>QRIS</h3><img src="${esc(s.qris_image)}" alt="QRIS" style="max-width:220px;margin:auto;border-radius:12px"></div>` : ''}</aside></div>`;
  const el = ctx.el;
  const totals = () => {
    const sub = items.reduce((a, i) => a + Math.max(0, (Number(i.qty) || 0) * (Number(i.price) || 0) - (Number(i.discount) || 0)), 0);
    const disc = Math.min(sub, Number(el.querySelector('[data-disc]').value) || 0);
    const tax = Math.round(((sub - disc) * (Number(s.tax_percent) || 0)) / 100);
    return { sub, disc, tax, total: sub - disc + tax };
  };
  const drawTot = () => {
    const t = editable ? totals() : { sub: inv.subtotal, disc: inv.discount, tax: inv.tax, total: inv.total };
    el.querySelector('[data-tot]').innerHTML = `<div><span>Subtotal</span><b>${money(t.sub)}</b></div><div><span>${T('Diskon', 'Discount')}</span><b>-${money(t.disc)}</b></div>${t.tax ? `<div><span>${T('Pajak', 'Tax')}</span><b>${money(t.tax)}</b></div>` : ''}<div><span>Total</span><span class="big">${money(t.total)}</span></div><div><span>${T('Terbayar', 'Paid')}</span><b style="color:var(--ok)">${money(inv.paid)}</b></div><div><span>${T('Sisa', 'Due')}</span><b style="color:${t.total - inv.paid > 0 ? 'var(--bad)' : 'inherit'}">${money(Math.max(0, t.total - inv.paid))}</b></div>`;
  };
  const drawItems = () => {
    el.querySelector('[data-items]').innerHTML = `<div class="tbl-wrap"><table class="tbl items-tbl"><thead><tr><th>${T('Jenis', 'Kind')}</th><th>${T('Deskripsi', 'Description')}</th><th>Qty</th><th>${T('Harga', 'Price')}</th><th>${T('Diskon', 'Discount')}</th><th class="num">${T('Jumlah', 'Amount')}</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map((i, k) => `<tr><td style="width:110px">${editable ? `<select data-ik="${k}">${(O().itemKind || []).map((o) => `<option value="${o[0]}" ${o[0] === i.kind ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : statusBadge(O().itemKind, i.kind)}</td><td>${editable ? `<input data-in="${k}" value="${esc(i.name)}">` : esc(i.name)}${i.auto ? ` <span class="tiny faint">auto</span>` : ''}</td><td style="width:70px">${editable ? `<input type="number" data-iq="${k}" value="${i.qty}">` : num(i.qty)}</td><td style="width:120px">${editable ? `<input type="number" data-ip="${k}" value="${i.price}">` : money(i.price)}</td><td style="width:110px">${editable ? `<input type="number" data-id="${k}" value="${i.discount || 0}">` : money(i.discount || 0)}</td><td class="num"><b>${money(Math.max(0, i.qty * i.price - (i.discount || 0)))}</b></td>${editable ? `<td class="act"><button class="btn sm ghost danger" data-ir="${k}">${icon('x', '', 14)}</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="7" class="muted center">${T('Belum ada item', 'No items')}</td></tr>`}</tbody></table></div>`;
    const bind = (attr, key, numeric) => el.querySelectorAll(`[${attr}]`).forEach((inp) => (inp.oninput = inp.onchange = () => { items[+inp.getAttribute(attr)][key] = numeric ? Number(inp.value) || 0 : inp.value; drawTot(); }));
    bind('data-ik', 'kind'); bind('data-in', 'name'); bind('data-iq', 'qty', 1); bind('data-ip', 'price', 1); bind('data-id', 'discount', 1);
    el.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => { items.splice(+b.dataset.ir, 1); drawItems(); drawTot(); }));
  };
  drawItems();
  drawTot();
  el.querySelector('[data-disc]').oninput = drawTot;
  el.querySelector('[data-addsel]')?.addEventListener('change', (e) => {
    const v = e.target.value;
    e.target.value = '';
    if (v.startsWith('p:')) { const x = byId(B().procedures, v.slice(2)); items.push({ kind: 'procedure', name: x.name, qty: 1, price: priceOf(x, inv.branch_id), discount: 0 }); }
    else if (v.startsWith('l:')) { const x = byId(B().lab_tests, v.slice(2)); items.push({ kind: 'lab', name: `Lab: ${x.name}`, qty: 1, price: x.price, discount: 0 }); }
    else if (v === 'custom') items.push({ kind: 'other', name: '', qty: 1, price: 0, discount: 0 });
    drawItems();
    drawTot();
  });
  el.querySelector('[data-saveinv]')?.addEventListener('click', async () => {
    try {
      await api(`/api/billing/invoices/${id}`, { method: 'PUT', body: { items, discount: Number(el.querySelector('[data-disc]').value) || 0, coupon: el.querySelector('[data-coupon]').value.trim().toUpperCase(), payer_type: el.querySelector('[data-payer]').value, insurer_id: el.querySelector('[data-ins]').value, notes: el.querySelector('[data-notes]').value } });
      toast(T('Invoice diperbarui', 'Invoice updated'));
      ctx.refresh();
    } catch (e) { fail(e); }
  });
  el.querySelector('[data-rebuild]')?.addEventListener('click', async () => { try { await api(`/api/billing/invoices/${id}/rebuild`, { method: 'POST' }); toast(T('Dihitung ulang', 'Rebuilt')); ctx.refresh(); } catch (e) { fail(e); } });
  el.querySelectorAll('[data-pm]').forEach((b) => (b.onclick = () => { method = b.dataset.pm; el.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('on', x === b)); }));
  el.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => { el.querySelector('[data-amt]').value = b.dataset.quick; el.querySelector('[data-amt]').dispatchEvent(new Event('input')); }));
  el.querySelector('[data-amt]')?.addEventListener('input', (e) => { const v = Number(e.target.value) || 0; el.querySelector('[data-change]').innerHTML = v > due ? `${T('Kembalian', 'Change')}: <b>${money(v - due)}</b>` : ''; });
  el.querySelector('[data-pay]')?.addEventListener('click', async (e) => {
    e.target.classList.add('busy');
    try {
      const r = await api(`/api/billing/invoices/${id}/pay`, { method: 'POST', body: { method, amount: Number(el.querySelector('[data-amt]').value) || due, reference: el.querySelector('[data-ref]').value } });
      modal({ title: T('Pembayaran diterima', 'Payment received'), body: `<div class="center stack" style="justify-items:center"><div class="success-ic">${icon('check-circle', '', 40)}</div><div class="bignum" style="font-size:2.2rem">${money(r.payment.amount)}</div>${r.payment.change ? `<div class="alert ok">${T('Kembalian', 'Change')}: <b>${money(r.payment.change)}</b></div>` : ''}<span class="mono small">${esc(r.payment.payment_no)}</span></div>`, actions: [{ label: `${icon('receipt', '', 16)} ${T('Cetak kwitansi', 'Print receipt')}`, onClick: () => { openDoc(`/api/docs/receipt/${r.payment.id}`); return false; } }, { label: 'Invoice PDF', onClick: () => { openDoc(`/api/docs/invoice/${id}`); return false; } }, { label: T('Selesai', 'Done'), cls: 'primary' }], onClose: () => ctx.refresh() });
    } catch (err) { fail(err); } finally { e.target.classList.remove('busy'); }
  });
  el.querySelector('[data-gw]')?.addEventListener('click', async () => { try { const r = await api(`/api/billing/invoices/${id}/gateway`, { method: 'POST' }); navigator.clipboard?.writeText(r.redirect_url); window.open(r.redirect_url, '_blank'); toast(T('Link pembayaran dibuat & disalin', 'Payment link created & copied')); } catch (e) { fail(e); } });
  el.querySelectorAll('[data-refund]').forEach((b) => (b.onclick = () => modal({
    title: 'Refund', body: `<div class="stack"><label class="f">${T('Jumlah refund', 'Refund amount')}<input type="number" data-a value="${b.dataset.amt}"></label><label class="f"><span class="req">${T('Alasan', 'Reason')}</span><input data-r></label></div>`,
    actions: [{ label: T('Batal', 'Cancel') }, { label: T('Proses refund', 'Process refund'), cls: 'danger solid', onClick: async (m) => { await api(`/api/billing/payments/${b.dataset.refund}/refund`, { method: 'POST', body: { amount: Number(m.querySelector('[data-a]').value), reason: m.querySelector('[data-r]').value } }); toast(T('Refund diproses', 'Refund processed')); ctx.refresh(); } }],
  })));
  el.querySelector('[data-void]')?.addEventListener('click', async () => {
    const reason = await confirmBox(T('Batalkan (void) invoice ini?', 'Void this invoice?'), { danger: true, input: T('Alasan', 'Reason') });
    if (!reason) return;
    try { await api(`/api/billing/invoices/${id}/void`, { method: 'POST', body: { reason } }); ctx.refresh(); } catch (e) { fail(e); }
  });
  el.querySelector('[data-claim]')?.addEventListener('click', async () => {
    const sep = await confirmBox(T('Buat klaim ke penjamin untuk invoice ini?', 'Create an insurance claim?'), { input: T('No. SEP / GL (opsional)', 'SEP / GL no. (optional)') });
    if (sep === false) return;
    try { const r = await api(`/api/billing/invoices/${id}/claim`, { method: 'POST', body: { sep_no: sep || '' } }); toast(T('Klaim dibuat', 'Claim created')); location.hash = `#/data/claims/${r.id}`; } catch (e) { fail(e); }
  });
}

// ================================================================== PATIENT 360
export async function patient360(ctx) {
  const d = await api(`/api/clinic/patients/${ctx.params.id}/history`);
  if (!alive(ctx)) return;
  const p = d.patient;
  ctx.title(p.name, `${p.mrn} · ${T('Profil pasien 360°', 'Patient 360°')}`);
  const tier = byId(B().membership_tiers, p.member_tier);
  const tabs = [['visits', T('Kunjungan', 'Visits'), d.visits.length], ['records', T('Rekam medis', 'Records'), d.records.length], ['rx', T('Resep', 'Prescriptions'), d.prescriptions.length], ['labs', 'Lab', d.labs.length], ['inv', 'Invoice', d.invoices.length], ['docs', T('Dokumen', 'Documents'), d.documents.length], ['appts', 'Booking', d.appointments.length], ['points', T('Poin', 'Points'), d.points.length]];
  ctx.el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row-between"><div class="pcard"><span class="av">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><span class="small muted">${esc(p.mrn)} · ${p.gender === 'P' ? T('Perempuan', 'Female') : p.gender === 'L' ? T('Laki-laki', 'Male') : '-'} · ${p.birth_date ? `${fdate(p.birth_date)} (${age(p.birth_date)} th)` : '-'} · ${esc(p.phone || '')}</span><div class="row" style="margin-top:6px">${statusBadge(PAYERS(), p.payer_type)}${p.bpjs_no ? `<span class="badge">BPJS ${esc(p.bpjs_no)}</span>` : ''}${tier ? `<span class="badge gold">${icon('award', '', 12)} ${esc(tier.name)} · ${num(p.points)} ${T('poin', 'pts')}</span>` : `<span class="badge">${num(p.points)} ${T('poin', 'pts')}</span>`}${p.referral_code ? `<span class="badge mono">REF ${esc(p.referral_code)}</span>` : ''}</div></div></div>
  <div class="btn-group">${can('clinic:register') ? `<a class="btn primary" href="#/queue?register=${p.id}">${icon('ticket', '', 16)} ${T('Daftarkan kunjungan', 'Register visit')}</a>` : ''}${can('appointments:create') ? `<a class="btn" href="#/data/appointments/new?patient_id=${p.id}&name=${encodeURIComponent(p.name)}&phone=${encodeURIComponent(p.phone || '')}">${icon('calendar', '', 16)} Booking</a>` : ''}<button class="btn" data-open="/api/docs/card/${p.id}">${icon('id-card', '', 16)} ${T('Kartu pasien', 'Patient card')}</button><button class="btn" data-up>${icon('paperclip', '', 16)} ${T('Unggah dokumen', 'Upload')}</button>${can('patients:update') ? `<a class="btn" href="#/data/patients/${p.id}">${icon('edit', '', 16)} Edit</a>` : ''}</div></div>
  ${p.allergies ? `<div class="alert bad" style="margin-top:12px">${icon('alert', '', 18)} <b>${T('Alergi', 'Allergy')}:</b> ${esc(p.allergies)}</div>` : ''}</div>
  <div class="tabs">${tabs.map(([k, l, n], i) => `<button data-tab="${k}" class="${i ? '' : 'on'}">${l} <span class="badge">${n}</span></button>`).join('')}</div><div data-panel></div>`;
  const panels = {
    visits: () => tbl(['No.', T('Tanggal', 'Date'), 'Poli', T('Dokter', 'Doctor'), 'Status', ''], d.visits.map((v) => [`<b class="mono">${esc(v.visit_no)}</b>`, fdate(v.date), esc(poliName(v.poli_id)), esc(doctorName(v.doctor_id)), vBadge(v.status), `<a class="btn sm" href="#/exam/${v.id}">${icon('stethoscope', '', 14)}</a><button class="btn sm ghost" data-open="/api/docs/record/${v.id}">${icon('file', '', 14)}</button>`])),
    records: () => d.records.length ? `<div class="timeline">${d.records.map((r) => `<div class="tl-item card" style="padding:14px 14px 14px 30px"><b>${fdate(r.date)} · ${esc(doctorName(r.doctor_id))} ${r.status === 'final' ? '<span class="badge ok">Final</span>' : '<span class="badge warn">Draf</span>'}</b><div class="small">${(r.diagnoses || []).map((x) => `<b class="mono">${esc(x.code)}</b> ${esc(x.name)}`).join(' · ') || esc(r.assessment || '')}</div>${r.vitals ? `<div style="margin:6px 0">${vitalsChips(r.vitals)}</div>` : ''}${r.subjective || r.anamnesis ? `<div class="small muted">S: ${esc(r.subjective || r.anamnesis)}</div>` : ''}${r.plan || r.therapy ? `<div class="small muted">P: ${esc(r.plan || r.therapy)}</div>` : ''}<button class="btn sm ghost" data-open="/api/docs/record/${r.visit_id}" style="margin-top:6px">${icon('download', '', 14)} Resume PDF</button></div>`).join('')}</div>` : emptyState(T('Belum ada rekam medis', 'No records'), 'heart'),
    rx: () => tbl(['No.', T('Tanggal', 'Date'), T('Obat', 'Medicines'), 'Status', ''], d.prescriptions.map((r) => [`<b class="mono">${esc(r.rx_no)}</b>`, fdate(r.date), `<span class="small">${(r.items || []).map((i) => `${esc(i.name)} ×${num(i.qty)}`).join(', ')}</span>`, statusBadge(O().rxStatus, r.status), `<button class="btn sm ghost" data-open="/api/docs/prescription/${r.id}">${icon('download', '', 14)}</button>`])),
    labs: () => tbl(['No.', T('Tanggal', 'Date'), T('Hasil', 'Results'), 'Status', ''], d.labs.map((l) => [`<b class="mono">${esc(l.lab_no)}</b>`, fdate(l.date), `<span class="small">${(l.tests || []).map((t) => `${esc(t.name)}${t.result ? `: <b style="${t.flag ? 'color:var(--bad)' : ''}">${esc(t.result)}${t.flag ? ' ' + esc(t.flag) : ''}</b>` : ''}`).join(' · ')}</span>`, statusBadge(O().labStatus, l.status), `<button class="btn sm ghost" data-open="/api/docs/lab/${l.id}">${icon('download', '', 14)}</button>`])),
    inv: () => tbl(['Invoice', T('Tanggal', 'Date'), 'Total', T('Terbayar', 'Paid'), 'Status', ''], d.invoices.map((i) => [`<b class="mono">${esc(i.invoice_no)}</b>`, fdate(i.date), money(i.total), money(i.paid), statusBadge(O().invStatus, i.status), `<a class="btn sm" href="#/cashier/${i.id}">${icon('wallet', '', 14)}</a><button class="btn sm ghost" data-open="/api/docs/invoice/${i.id}">${icon('download', '', 14)}</button>`])),
    docs: () => tbl([T('Judul', 'Title'), T('Kategori', 'Category'), T('Tanggal', 'Date'), ''], d.documents.map((x) => [esc(x.title), statusBadge(O().docCategory, x.category), fdate(x.created_at), `<a class="btn sm" href="${fileUrl(x.file)}" target="_blank" rel="noopener">${icon('download', '', 14)}</a>`])),
    appts: () => tbl(['No.', T('Jadwal', 'Schedule'), T('Dokter', 'Doctor'), 'Status'], d.appointments.map((a) => [`<span class="mono">${esc(a.booking_no)}</span>`, `${fdate(a.date)} ${esc(a.time)}`, esc(doctorName(a.doctor_id)), statusBadge(O().apptStatus, a.status)])),
    points: () => tbl([T('Tanggal', 'Date'), T('Keterangan', 'Reason'), T('Poin', 'Points')], d.points.map((x) => [fdt(x.created_at), esc(x.reason), `<b style="color:${x.points < 0 ? 'var(--bad)' : 'var(--ok)'}">${x.points > 0 ? '+' : ''}${num(x.points)}</b>`])),
  };
  const panel = ctx.el.querySelector('[data-panel]');
  const show = (k) => (panel.innerHTML = panels[k]());
  ctx.el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { ctx.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); show(b.dataset.tab); }));
  ctx.el.querySelector('[data-up]').onclick = () => uploadDocModal(p.id, null, () => ctx.refresh());
  show('visits');
}

function tbl(head, rows) {
  if (!rows.length) return `<div class="card">${emptyState(T('Belum ada data', 'No data yet'))}</div>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 && head[i] === '' ? 'act' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
