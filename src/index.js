// Global Klinik — Cloudflare Worker entry point.
// Public website (SSR) · REST API · PDF documents · media from R2 · scheduled jobs.
import * as Auth from './api/auth.js';
import * as Billing from './api/billing.js';
import * as Clinical from './api/clinical.js';
import * as Crud from './api/crud.js';
import * as Docs from './api/documents.js';
import * as Pharmacy from './api/pharmacy.js';
import * as Portal from './api/portal.js';
import * as Public from './api/public.js';
import * as Reports from './api/reports.js';
import * as System from './api/system.js';
import { csrfOk, getSession, rolePerms } from './lib/auth.js';
import { getBundle } from './lib/cms.js';
import { q, run } from './lib/db.js';
import { apptData, notify } from './lib/notify.js';
import { Router } from './lib/router.js';
import { processQueue } from './lib/satusehat.js';
import { HttpError, addDays, clientIP, json, localDate } from './lib/util.js';
import * as Site from './site/pages.js';

const api = new Router()
  .get('/api/health', (ctx) => json({ ok: true, app: 'Global Klinik', version: ctx.env.APP_VERSION, time: new Date().toISOString() }))
  // public
  .get('/api/public/booking-data', Public.bookingData)
  .get('/api/public/slots', Public.slots)
  .post('/api/public/book', Public.book)
  .post('/api/public/booking/lookup', Public.lookup)
  .post('/api/public/booking/reschedule', Public.reschedule)
  .post('/api/public/booking/cancel', Public.cancel)
  .post('/api/public/booking/checkin', Public.checkin)
  .get('/api/public/booking/:no/pdf', Docs.booking)
  .get('/api/public/queue', Public.queueDisplay)
  .post('/api/public/contact', Public.contact)
  .post('/api/public/newsletter', Public.newsletter)
  .post('/api/public/testimonial', Public.testimonial)
  .post('/api/pay/midtrans', Billing.midtransWebhook)
  // auth
  .post('/api/auth/login', Auth.login)
  .post('/api/auth/logout', Auth.logout)
  .post('/api/auth/logout-all', Auth.logoutAll)
  .get('/api/auth/me', Auth.me)
  .post('/api/auth/register', Auth.register)
  .post('/api/auth/password', Auth.changePassword)
  .post('/api/auth/2fa/setup', Auth.totpSetup)
  .post('/api/auth/2fa/enable', Auth.totpEnable)
  .post('/api/auth/2fa/disable', Auth.totpDisable)
  .get('/api/auth/setup', Auth.setupStatus)
  .post('/api/auth/setup', Auth.setup)
  // meta + generic CRUD
  .get('/api/meta', Crud.meta)
  .get('/api/crud/:entity/export', Crud.exportRows)
  .post('/api/crud/:entity/import', Crud.importRows)
  .post('/api/crud/:entity/reorder', Crud.reorder)
  .get('/api/crud/:entity', Crud.list)
  .post('/api/crud/:entity', Crud.create)
  .get('/api/crud/:entity/:id', Crud.getOne)
  .put('/api/crud/:entity/:id', Crud.update)
  .del('/api/crud/:entity/:id', Crud.remove)
  // clinical
  .post('/api/clinic/register', Clinical.register)
  .post('/api/clinic/checkin', Clinical.checkinByCode)
  .get('/api/clinic/queue', Clinical.queueList)
  .get('/api/clinic/queue/snapshot', Clinical.queueSnapshot)
  .post('/api/clinic/queue/next', Clinical.queueNext)
  .post('/api/clinic/queue/:id/:action', Clinical.queueAction)
  .get('/api/clinic/visits/:id', Clinical.visitDetail)
  .put('/api/clinic/visits/:id/record', Clinical.saveRecord)
  .put('/api/clinic/visits/:id/prescription', Clinical.savePrescription)
  .post('/api/clinic/visits/:id/lab', Clinical.orderLab)
  .post('/api/clinic/visits/:id/finish', Clinical.finishVisit)
  .get('/api/clinic/patients/search', Clinical.searchPatients)
  .get('/api/clinic/patients/:id/history', Clinical.patientHistory)
  .get('/api/clinic/doctor/today', Clinical.doctorToday)
  .get('/api/lab/orders', Clinical.labList)
  .put('/api/lab/orders/:id', Clinical.labSave)
  // pharmacy
  .get('/api/pharmacy/stock', Pharmacy.stockList)
  .get('/api/pharmacy/stock/:id/batches', Pharmacy.batches)
  .get('/api/pharmacy/search', Pharmacy.search)
  .get('/api/pharmacy/alerts', Pharmacy.alerts)
  .get('/api/pharmacy/prescriptions', Pharmacy.rxQueue)
  .post('/api/pharmacy/prescriptions/:id/dispense', Pharmacy.dispense)
  .post('/api/pharmacy/sale', Pharmacy.sale)
  .post('/api/pharmacy/stock/in', Pharmacy.receive)
  .post('/api/pharmacy/stock/adjust', Pharmacy.adjust)
  .post('/api/pharmacy/stock/opname', Pharmacy.opname)
  .post('/api/pharmacy/stock/transfer', Pharmacy.transfer)
  .post('/api/pharmacy/po/:id/receive', Pharmacy.receivePO)
  // billing
  .get('/api/billing/cashier', Billing.cashierList)
  .get('/api/billing/invoices/:id', Billing.invoiceDetail)
  .put('/api/billing/invoices/:id', Billing.invoiceEdit)
  .post('/api/billing/invoices/:id/rebuild', Billing.rebuild)
  .post('/api/billing/invoices/:id/pay', Billing.pay)
  .post('/api/billing/invoices/:id/void', Billing.voidInvoice)
  .post('/api/billing/invoices/:id/claim', Billing.createClaim)
  .post('/api/billing/invoices/:id/gateway', Billing.gateway)
  .post('/api/billing/payments/:id/confirm', Billing.confirmPayment)
  .post('/api/billing/payments/:id/refund', Billing.refund)
  // documents (PDF)
  .get('/api/docs/invoice/:id', Docs.invoice)
  .get('/api/docs/receipt/:id', Docs.receipt)
  .get('/api/docs/lab/:id', Docs.lab)
  .get('/api/docs/prescription/:id', Docs.prescription)
  .get('/api/docs/card/:id', Docs.patientCard)
  .get('/api/docs/slip/:id', Docs.visitSlip)
  .get('/api/docs/record/:id', Docs.record)
  // portal
  .get('/api/portal/overview', Portal.overview)
  .put('/api/portal/profile', Portal.updateProfile)
  .get('/api/portal/appointments', Portal.appointments)
  .post('/api/portal/appointments', Portal.book)
  .post('/api/portal/appointments/:id/:action', Portal.apptAction)
  .get('/api/portal/visits', Portal.visits)
  .get('/api/portal/invoices', Portal.invoices)
  .post('/api/portal/invoices/:id/proof', Portal.uploadProof)
  .get('/api/portal/notifications', Portal.notifications)
  .post('/api/portal/notifications/read', Portal.readNotifications)
  .get('/api/portal/points', Portal.points)
  // reports & dashboard
  .get('/api/dashboard', Reports.dashboard)
  .get('/api/reports', (ctx) => json({ rows: Reports.reportList() }))
  .get('/api/reports/:type', Reports.report)
  // system
  .get('/api/media', System.mediaList)
  .post('/api/media', System.mediaUpload)
  .del('/api/media', System.mediaDelete)
  .post('/api/files', System.fileUpload)
  .get('/api/files', System.fileGet)
  .get('/api/system/status', System.status)
  .get('/api/system/blueprint', System.blueprint)
  .post('/api/system/backup', System.backupNow)
  .get('/api/system/backups', System.backupList)
  .get('/api/system/backups/file', System.backupFile)
  .post('/api/system/restore', System.restore)
  .post('/api/system/rebuild-cache', System.rebuildCache)
  .post('/api/system/notify-test', System.notifyTest)
  .get('/api/satusehat/preview/:type/:id', System.satusehatPreview)
  .post('/api/satusehat/run', System.satusehatRun)
  .post('/api/satusehat/queue', System.satusehatQueue);

// Public website routes (path without /en prefix)
const site = [
  [/^\/$/, (c, l) => Site.home(c, l)],
  [/^\/tentang$/, (c, l) => Site.about(c, l)],
  [/^\/layanan$/, (c, l) => Site.services(c, l)],
  [/^\/layanan\/([\w-]+)$/, (c, l, m) => Site.serviceDetail(c, l, m[1])],
  [/^\/dokter$/, (c, l) => Site.doctors(c, l)],
  [/^\/dokter\/([\w-]+)$/, (c, l, m) => Site.doctorDetail(c, l, m[1])],
  [/^\/jadwal$/, (c, l) => Site.schedule(c, l)],
  [/^\/fasilitas$/, (c, l) => Site.facilities(c, l)],
  [/^\/cabang$/, (c, l) => Site.branches(c, l)],
  [/^\/cabang\/([\w-]+)$/, (c, l, m) => Site.branchDetail(c, l, m[1])],
  [/^\/booking$/, (c, l) => Site.bookingPage(c, l)],
  [/^\/cek-booking$/, (c, l) => Site.lookupPage(c, l)],
  [/^\/harga$/, (c, l) => Site.pricing(c, l)],
  [/^\/promo$/, (c, l) => Site.promos(c, l)],
  [/^\/promo\/([\w-]+)$/, (c, l, m) => Site.promoDetail(c, l, m[1])],
  [/^\/testimoni$/, (c, l) => Site.testimonials(c, l)],
  [/^\/blog$/, (c, l) => Site.blog(c, l)],
  [/^\/blog\/([\w-]+)$/, (c, l, m) => Site.post(c, l, m[1])],
  [/^\/faq$/, (c, l) => Site.faq(c, l)],
  [/^\/kontak$/, (c, l) => Site.contact(c, l)],
  [/^\/(kebijakan-privasi|syarat-ketentuan)$/, (c, l, m) => Site.legal(c, l, m[1])],
  [/^\/p\/([\w-]+)$/, async (c, l, m) => (await Site.cmsPage(c, l, m[1], '/p/' + m[1])) || Site.notFoundPage(c, l)],
  [/^\/antrian$/, (c) => Site.queuePage(c)],
];

function securityHeaders(res, ctx, isHtml) {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('permissions-policy', 'camera=(self), microphone=(), geolocation=(self), payment=()');
  h.set('cross-origin-opener-policy', 'same-origin');
  if (isHtml) {
    h.set('x-frame-options', 'SAMEORIGIN');
    h.set(
      'content-security-policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${ctx.nonce}' https://www.googletagmanager.com`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
        'frame-src https://www.google.com https://maps.google.com https://meet.jit.si',
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; ')
    );
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function handle(request, env, exec) {
  const url = new URL(request.url);
  const path = url.pathname;
  const ctx = {
    req: request, env, exec, url, params: {}, ip: clientIP(request), site: url.origin,
    nonce: crypto.randomUUID().replace(/-/g, ''),
    session: null, perms: [],
    waitUntil: (p) => exec.waitUntil(Promise.resolve(p).catch(() => {})),
  };

  // Media (public R2 images)
  if (path.startsWith('/media/')) {
    ctx.params.path = decodeURIComponent(path.slice(7));
    return System.serveMedia(ctx);
  }

  if (path.startsWith('/api/')) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (!csrfOk(request, url) && !path.startsWith('/api/pay/')) return json({ error: 'Permintaan ditolak (CSRF)' }, 403);
    ctx.session = await getSession(request, env);
    if (ctx.session) {
      const bundle = await getBundle(env);
      ctx.perms = rolePerms(bundle, ctx.session.role);
    }
    const m = api.match(request.method, path);
    if (!m) return json({ error: 'Endpoint tidak ditemukan' }, 404);
    ctx.params = m.params;
    return m.handler(ctx);
  }

  if (path === '/sitemap.xml') return Site.sitemap(ctx);
  if (path === '/robots.txt') return Site.robots(ctx);
  if (path === '/app' ) return Response.redirect(url.origin + '/app/', 301);

  // Website (optionally /en/...)
  let lang = 'id';
  let p = path.replace(/\/+$/, '') || '/';
  if (p === '/en' || p.startsWith('/en/')) {
    lang = 'en';
    p = p.slice(3) || '/';
  }
  for (const [re, fn] of site) {
    const m = p.match(re);
    if (m) return securityHeaders(await fn(ctx, lang, m), ctx, true);
  }
  // static assets are served before the Worker; anything else is a 404 page
  return securityHeaders(await Site.notFoundPage(ctx, lang), ctx, true);
}

export default {
  async fetch(request, env, exec) {
    try {
      return await handle(request, env, exec);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('Unhandled error', err?.stack || err);
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
        return json({ error: status >= 500 ? 'Terjadi kesalahan pada server. Silakan coba lagi.' : err.message, ...(err.extra || {}) }, status);
      }
      return new Response(`<!doctype html><meta charset="utf-8"><title>Error</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Maaf, terjadi kesalahan</h1><p>${status}</p><a href="/">Kembali</a></body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  },

  async scheduled(event, env, exec) {
    const ctx = { env, waitUntil: (p) => exec.waitUntil(p), site: env.SITE_URL || '' };
    if (event.cron === '30 17 * * *') {
      exec.waitUntil(System.runBackup(env, { full: false }).catch((e) => console.error('backup', e)));
      exec.waitUntil(System.archiveAudit(env).catch((e) => console.error('archive', e)));
      return;
    }
    // hourly: H-1 reminders for tomorrow's appointments (sent once) + SATU SEHAT queue + queue snapshot cleanup
    const bundle = await getBundle(env);
    const tomorrow = addDays(localDate(), 1);
    const rows = await q(env, "SELECT * FROM appointments WHERE date = ? AND status IN ('confirmed','pending') AND COALESCE(reminded,0) = 0 LIMIT 200", tomorrow);
    for (const a of rows) {
      try {
        await notify(env, { template: 'reminder', data: apptData(bundle, a, ctx.site || 'https://global-klinik.app-desa.workers.dev'), phone: a.phone, email: a.email, patientId: a.patient_id, ref: a.booking_no });
        await run(env, 'UPDATE appointments SET reminded = 1 WHERE id = ?', a.id);
      } catch (e) {
        console.error('reminder', a.booking_no, e);
      }
    }
    exec.waitUntil(processQueue(env).catch((e) => console.error('satusehat', e)));
    // mark yesterday's unchecked appointments as no-show
    exec.waitUntil(run(env, "UPDATE appointments SET status = 'no_show', updated_at = datetime('now') WHERE date < ? AND status IN ('confirmed','pending')", localDate()).catch(() => {}));
  },
};
