// Notifications: in-app (KV), WhatsApp (gateway or one-click wa.me link), Email (built-in SMTP client), SMS (generic HTTP).
import { getBundle } from './cms.js';
import { sendMail } from './smtp.js';
import { fmtDate, money, normPhone, nowISO, tr } from './util.js';

const T = {
  booking_confirmed: (d) => `Halo ${d.name}, booking Anda di ${d.clinic} TERKONFIRMASI.\n\nNo. booking: *${d.booking_no}*\nJadwal: ${fmtDate(d.date)} pukul ${d.time} WIB\nDokter: ${d.doctor}\nLokasi: ${d.place}\n${d.meet_url ? 'Link video: ' + d.meet_url + '\n' : ''}\nCek/ubah jadwal: ${d.link}`,
  booking_pending: (d) => `Halo ${d.name}, booking ${d.booking_no} untuk ${fmtDate(d.date)} ${d.time} WIB telah kami terima dan menunggu konfirmasi. Cek status: ${d.link}`,
  booking_waitlist: (d) => `Halo ${d.name}, Anda masuk DAFTAR TUNGGU untuk ${d.doctor} tanggal ${fmtDate(d.date)} ${d.time} WIB (No. ${d.booking_no}). Kami akan mengabari bila slot tersedia.`,
  waitlist_promoted: (d) => `Kabar baik, ${d.name}! Slot ${fmtDate(d.date)} ${d.time} WIB bersama ${d.doctor} kini TERSEDIA dan booking ${d.booking_no} sudah terkonfirmasi.`,
  booking_rescheduled: (d) => `Booking ${d.booking_no} berhasil dijadwalkan ulang ke ${fmtDate(d.date)} pukul ${d.time} WIB bersama ${d.doctor}.`,
  booking_cancelled: (d) => `Booking ${d.booking_no} (${fmtDate(d.date)} ${d.time} WIB) telah dibatalkan. Booking ulang kapan saja di ${d.site}.`,
  reminder: (d) => `Pengingat: besok ${fmtDate(d.date)} pukul ${d.time} WIB Anda memiliki jadwal dengan ${d.doctor} di ${d.place}. No. booking ${d.booking_no}. Datang 15 menit lebih awal ya. ${d.meet_url ? 'Link video: ' + d.meet_url : ''}`,
  queue_called: (d) => `Nomor antrian ${d.queue_no} dipanggil ke ${d.poli}. Silakan menuju ruang periksa.`,
  invoice_created: (d) => `Tagihan ${d.invoice_no} sebesar ${money(d.total)} telah terbit. Lihat & unduh di portal pasien: ${d.link}`,
  payment_received: (d) => `Terima kasih, pembayaran ${money(d.amount)} untuk ${d.invoice_no} telah kami terima (${d.payment_no}).`,
  lab_ready: (d) => `Hasil laboratorium ${d.lab_no} sudah tersedia. Unduh di portal pasien: ${d.link}`,
  followup: (d) => `Halo ${d.name}, sudah waktunya kontrol kembali. Booking mudah di ${d.link}`,
  schedule_changed: (d) => `Jadwal praktik Anda diperbarui: ${d.text}`,
};
const SUBJECT = {
  booking_confirmed: 'Booking terkonfirmasi', booking_pending: 'Booking diterima', booking_waitlist: 'Daftar tunggu', waitlist_promoted: 'Slot tersedia',
  booking_rescheduled: 'Jadwal diperbarui', booking_cancelled: 'Booking dibatalkan', reminder: 'Pengingat jadwal', queue_called: 'Antrian dipanggil',
  invoice_created: 'Tagihan baru', payment_received: 'Pembayaran diterima', lab_ready: 'Hasil lab tersedia', followup: 'Pengingat kontrol', schedule_changed: 'Perubahan jadwal',
};

export function render(template, data) {
  return (T[template] || ((d) => d.text || ''))(data);
}

/** Push an in-app notification for a patient (portal). */
export async function pushInApp(env, patientId, item) {
  if (!patientId) return;
  const key = `notif:p:${patientId}`;
  const list = (await env.KV.get(key, { type: 'json' })) || [];
  list.unshift({ id: crypto.randomUUID().slice(0, 8), at: nowISO(), read: false, ...item });
  await env.KV.put(key, JSON.stringify(list.slice(0, 50)));
}

async function sendWA(env, settings, phone, text) {
  const to = normPhone(phone);
  if (!to) return { status: 'skipped' };
  const provider = settings.wa_provider || 'none';
  const link = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  try {
    if (provider === 'fonnte' && env.WA_TOKEN) {
      const r = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: env.WA_TOKEN }, body: new URLSearchParams({ target: to, message: text, countryCode: '62' }) });
      return { status: r.ok ? 'sent' : 'failed', link };
    }
    if (provider === 'wablas' && env.WA_TOKEN && env.WA_API_URL) {
      const r = await fetch(`${env.WA_API_URL.replace(/\/$/, '')}/api/send-message`, { method: 'POST', headers: { Authorization: env.WA_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ phone: to, message: text }) });
      return { status: r.ok ? 'sent' : 'failed', link };
    }
    if (provider === 'wacloud' && env.WA_TOKEN && env.WA_PHONE_ID) {
      const r = await fetch(`https://graph.facebook.com/v20.0/${env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }) });
      return { status: r.ok ? 'sent' : 'failed', link };
    }
  } catch {
    return { status: 'failed', link };
  }
  return { status: 'manual', link };
}

export const SMTP_PASS_KEY = 'secret:smtp_pass';

/** SMTP settings: host/port/user/sender from Admin -> Pengaturan (or env), password from Worker secret SMTP_PASS or the admin-saved KV value. */
export async function smtpConfig(env, s = {}) {
  const host = s.smtp_host || env.SMTP_HOST;
  const user = s.smtp_user || env.SMTP_USER || '';
  const pass = env.SMTP_PASS || (user ? await env.KV.get(SMTP_PASS_KEY) : '') || '';
  const from = s.email_from || env.SMTP_FROM || user;
  if (!host || !from || (user && !pass)) return null;
  return { host, port: Number(s.smtp_port || env.SMTP_PORT) || 465, user, pass, from, fromName: s.clinic_name || 'Global Klinik' };
}

async function sendEmail(env, settings, to, subject, text) {
  const cfg = to ? await smtpConfig(env, settings) : null;
  if (!cfg) return { status: 'skipped' };
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px"><h2 style="color:#0F766E;margin:0 0 12px">${settings.clinic_name}</h2><p style="white-space:pre-line;color:#0f172a;line-height:1.6">${text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p><p style="color:#64748b;font-size:12px">${settings.address || ''}</p></div>`;
  try {
    await sendMail(cfg, { to, subject, text, html });
    return { status: 'sent' };
  } catch (e) {
    console.error('email', e.message);
    return { status: 'failed', error: 'SMTP: ' + e.message };
  }
}

async function sendSMS(env, phone, text) {
  if (!phone || !env.SMS_API_URL) return { status: 'skipped' };
  try {
    const r = await fetch(env.SMS_API_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.SMS_API_KEY ? { Authorization: `Bearer ${env.SMS_API_KEY}` } : {}) }, body: JSON.stringify({ to: normPhone(phone), message: text }) });
    return { status: r.ok ? 'sent' : 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * notify(env, { template, data, phone, email, patientId, ref, channels })
 * Always logs to notif_log (with a one-click wa.me link when no gateway is configured).
 */
export async function notify(env, { template, data, phone, email, patientId, ref, channels = ['wa', 'email', 'inapp'] }) {
  const bundle = await getBundle(env);
  const settings = bundle.settings || {};
  const text = render(template, { clinic: settings.clinic_name, ...data });
  const subject = SUBJECT[template] || 'Notifikasi';
  const logs = [];
  if (channels.includes('wa') && phone) {
    const r = await sendWA(env, settings, phone, text);
    logs.push(['whatsapp', normPhone(phone), r.status, r.link || '']);
  }
  if (channels.includes('sms') && phone) {
    const r = await sendSMS(env, phone, text);
    if (r.status !== 'skipped') logs.push(['sms', normPhone(phone), r.status, '']);
  }
  if (channels.includes('email') && email) {
    const r = await sendEmail(env, settings, email, `${subject} — ${settings.clinic_name}`, text);
    if (r.status !== 'skipped') logs.push(['email', email, r.status, r.error || '']);
  }
  if (channels.includes('inapp') && patientId) {
    await pushInApp(env, patientId, { title: subject, body: text, template, ref });
    logs.push(['inapp', `patient:${patientId}`, 'sent', '']);
  }
  if (logs.length) {
    const now = nowISO();
    await env.DB.batch(
      logs.map(([ch, to, st, link]) =>
        env.DB.prepare('INSERT INTO notif_log (channel, recipient, subject, body, status, ref, link, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(ch, to, subject, text.slice(0, 2000), st, ref || '', link, now, now)
      )
    );
  }
  return { text, logs };
}

export function apptData(bundle, a, site) {
  const doc = (bundle.doctors || []).find((d) => d.id === a.doctor_id);
  const br = (bundle.branches || []).find((b) => b.id === a.branch_id);
  return {
    name: a.name, booking_no: a.booking_no, date: a.date, time: a.time, doctor: doc?.name || 'Dokter jaga',
    place: a.type === 'telemedicine' ? 'Telemedicine (video call)' : `${br?.name || ''}, ${br?.address || ''}`,
    meet_url: a.type === 'telemedicine' ? a.meet_url : '', link: `${site}/cek-booking?no=${a.booking_no}`, site, poli: tr((bundle.polis || []).find((p) => p.id === a.poli_id)?.name),
  };
}
