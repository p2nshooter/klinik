// HTML shell for the public website: <head> (SEO, OG, JSON-LD), header, footer, sale stamp, floating actions.
import { icon, logoMark } from '../../public/assets/js/icons.js';
import { active, sorted } from '../lib/cms.js';
import { esc, normPhone, tr } from '../lib/util.js';
import { t as tt } from './i18n.js';

export const ASSET_VER = '1.0.0';

export function L(lang, path) {
  const p = path.startsWith('/') ? path : '/' + path;
  return lang === 'en' ? (p === '/' ? '/en' : '/en' + p) : p;
}

export function waLink(num, text = '') {
  const n = normPhone(num);
  return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

export function img(src, alt, cls = '', attrs = '') {
  if (!src) return '';
  return `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async" ${attrs}>`;
}

export function avatar(name, photo, cls = '') {
  if (photo) return `<div class="avatar ${cls}">${img(photo, name)}</div>`;
  const initials = String(name || '?').replace(/^(dr|drg)\.?\s+/i, '').split(/[\s,]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<div class="avatar avatar-initials ${cls}" style="--h:${h}"><span>${esc(initials || 'GK')}</span></div>`;
}

function saleStamp(s, lang) {
  if (s.sale_stamp_enabled === false) return '';
  const phone = s.sale_stamp_phone || '+6285691234561';
  const pretty = phone.replace(/^\+?62/, '+62 ').replace(/(\d{3})(\d{4})(\d+)$/, '$1-$2-$3');
  const text = s.sale_stamp_text || 'WEBSITE INI DIJUAL';
  return `<a class="sale-stamp" href="${waLink(phone, `Halo, saya tertarik membeli website ${s.clinic_name || 'Global Klinik'}.`)}" target="_blank" rel="noopener" aria-label="${esc(text)} — ${esc(pretty)}">
  <svg class="sale-stamp-filter" width="0" height="0" aria-hidden="true"><filter id="stamp-rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter></svg>
  <span class="sale-stamp-inner">
    <span class="sale-stamp-top">★ ★ ★ ${lang === 'en' ? 'FOR SALE' : 'DIJUAL'} ★ ★ ★</span>
    <span class="sale-stamp-main">${esc(text)}</span>
    <span class="sale-stamp-line">${lang === 'en' ? 'Contact' : 'Hubungi'}</span>
    <span class="sale-stamp-phone">${esc(pretty)}</span>
    <span class="sale-stamp-cta">${icon('message', '', 14)} ${tt(lang)('saleStamp')}</span>
  </span></a>`;
}

function header(ctx, b, lang, activePath, path) {
  const T = tt(lang);
  const s = b.settings || {};
  const nav = (s.nav || []).map((n) => {
    const href = L(lang, n.href);
    const on = activePath && (activePath === n.href || activePath.startsWith(n.href + '/'));
    return `<a href="${href}" class="${on ? 'on' : ''}">${esc(tr(n.label, lang))}</a>`;
  }).join('');
  const other = lang === 'en' ? path.replace(/^\/en/, '') || '/' : '/en' + (path === '/' ? '' : path);
  return `<a class="skip" href="#main">Skip to content</a>
<div class="topbar"><div class="wrap topbar-in">
  <span>${icon('clock', '', 15)} ${esc(tr(s.hours, lang))}</span>
  <span class="topbar-r"><a href="tel:${esc(s.phone)}">${icon('phone', '', 15)} ${esc(s.phone)}</a><a href="${L(lang, '/cek-booking')}">${icon('ticket', '', 15)} ${T('checkBooking')}</a><a href="/antrian">${icon('monitor', '', 15)} ${T('queue')}</a><span class="em">${icon('alert', '', 15)} ${T('emergency')} ${esc(s.emergency || '119')}</span></span>
</div></div>
<header class="hdr" id="top"><div class="wrap hdr-in">
  <a class="brand" href="${L(lang, '/')}" aria-label="${esc(s.clinic_name)}">${s.logo ? img(s.logo, s.clinic_name, 'brand-img') : logoMark(42, 'hd')}<span class="brand-t"><b>${esc((s.clinic_name || 'Global Klinik').split(' ')[0])}</b> <i>${esc((s.clinic_name || 'Global Klinik').split(' ').slice(1).join(' ') || '')}</i></span></a>
  <nav class="nav" id="nav" aria-label="Menu utama">${nav}<a href="${L(lang, '/kontak')}" class="${activePath === '/kontak' ? 'on' : ''}">${T('contact')}</a></nav>
  <div class="hdr-act">
    <a class="icon-btn lang" href="${other}" hreflang="${lang === 'en' ? 'id' : 'en'}" title="${lang === 'en' ? 'Bahasa Indonesia' : 'English'}">${icon('globe', '', 18)}<span>${lang === 'en' ? 'ID' : 'EN'}</span></a>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Dark / light">${icon('moon', 'i-moon', 18)}${icon('sun', 'i-sun', 18)}</button>
    <a class="btn btn-ghost btn-sm hide-sm" href="/app/">${icon('user', '', 16)} ${T('login')}</a>
    <a class="btn btn-primary btn-sm" href="${L(lang, '/booking')}">${icon('calendar-check', '', 16)} <span>${T('booking')}</span></a>
    <button class="icon-btn menu-btn" type="button" data-menu aria-label="Menu" aria-expanded="false">${icon('menu', 'i-open', 22)}${icon('x', 'i-close', 22)}</button>
  </div>
</div></header>`;
}

function footer(b, lang) {
  const T = tt(lang);
  const s = b.settings || {};
  const year = new Date().getUTCFullYear();
  const svc = sorted(active(b.services)).slice(0, 7).map((x) => `<li><a href="${L(lang, '/layanan/' + x.slug)}">${esc(tr(x.name, lang))}</a></li>`).join('');
  const links = [['/tentang', 'about'], ['/dokter', 'doctors'], ['/jadwal', 'schedule'], ['/fasilitas', 'facilities'], ['/cabang', 'branches'], ['/harga', 'pricing'], ['/promo', 'promos'], ['/testimoni', 'testimonials'], ['/blog', 'blog'], ['/faq', 'faq'], ['/kontak', 'contact']].map(([h, k]) => `<li><a href="${L(lang, h)}">${T(k)}</a></li>`).join('');
  const social = [['instagram', s.instagram], ['facebook', s.facebook], ['youtube', s.youtube], ['tiktok', s.tiktok]].filter(([, u]) => u).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}">${icon(n, '', 18)}</a>`).join('');
  const branches = sorted(active(b.branches)).map((br) => `<li><b>${esc(br.name)}</b><span>${esc(br.address)}</span><a href="tel:${esc(br.phone)}">${esc(br.phone)}</a></li>`).join('');
  return `<footer class="ftr"><div class="wrap">
  <div class="ftr-grid">
    <div class="ftr-brand">
      <a class="brand brand-light" href="${L(lang, '/')}">${logoMark(44, 'ft')}<span class="brand-t"><b>${esc((s.clinic_name || 'Global Klinik').split(' ')[0])}</b> <i>${esc((s.clinic_name || '').split(' ').slice(1).join(' '))}</i></span></a>
      <p>${esc(tr(s.footer_about, lang))}</p>
      <div class="social">${social}</div>
      <form class="news" data-form="newsletter" novalidate><label for="nl-email">${T('newsletter')}</label><div class="news-row"><input id="nl-email" type="email" name="email" placeholder="${T('emailPh')}" required autocomplete="email"><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off"><button class="btn btn-gold btn-sm" type="submit">${T('newsletterBtn')}</button></div><p class="form-msg" role="status"></p></form>
    </div>
    <div><h4>${T('footerServices')}</h4><ul>${svc}</ul></div>
    <div><h4>${T('footerLinks')}</h4><ul class="cols2">${links}<li><a href="${L(lang, '/kebijakan-privasi')}">${T('privacy')}</a></li><li><a href="${L(lang, '/syarat-ketentuan')}">${T('terms')}</a></li></ul></div>
    <div><h4>${T('footerContact')}</h4><ul class="ftr-branches">${branches}</ul><p class="ftr-contact"><a href="mailto:${esc(s.email)}">${icon('mail', '', 16)} ${esc(s.email)}</a><a href="${waLink(s.whatsapp)}" target="_blank" rel="noopener">${icon('message', '', 16)} WhatsApp</a></p></div>
  </div>
  <div class="ftr-bottom"><span>© ${year} ${esc(s.clinic_name)}. ${T('rights')}</span><span class="ftr-bottom-r"><a href="/app/">${T('portal')}</a><button type="button" class="linkish" data-install hidden>${icon('smartphone', '', 16)} ${T('installApp')}</button></span></div>
</div></footer>
<a class="fab-wa" href="${waLink(s.whatsapp, lang === 'en' ? 'Hello, I would like to ask about Global Klinik services.' : 'Halo, saya ingin bertanya tentang layanan Global Klinik.')}" target="_blank" rel="noopener" aria-label="${T('whatsapp')}">${icon('message', '', 26)}<span>${T('whatsapp')}</span></a>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

export function layout(ctx, b, o) {
  const lang = o.lang || 'id';
  const s = b.settings || {};
  const T = tt(lang);
  const site = ctx.site;
  const title = o.title ? `${o.title} — ${s.clinic_name}` : tr(s.seo_title, lang) || s.clinic_name;
  const desc = (o.description || tr(s.seo_description, lang) || tr(s.description, lang) || '').replace(/\s+/g, ' ').slice(0, 300);
  const path = ctx.url.pathname;
  const basePath = lang === 'en' ? path.replace(/^\/en/, '') || '/' : path;
  const canonical = site + path;
  const ogImage = o.image || s.og_image || '/assets/img/og-image.png';
  const ga = s.ga_id && /^G-[A-Z0-9]+$/.test(s.ga_id) ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${s.ga_id}"></script><script nonce="${ctx.nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${s.ga_id}');</script>` : '';
  const org = {
    '@context': 'https://schema.org', '@type': 'MedicalClinic', name: s.clinic_name, url: site, logo: site + '/assets/img/logo.svg', image: site + ogImage, telephone: s.phone, email: s.email,
    address: { '@type': 'PostalAddress', streetAddress: s.address, addressCountry: 'ID' }, openingHours: tr(s.hours, 'en'), medicalSpecialty: ['PrimaryCare', 'Dentistry', 'Pediatric', 'Obstetric', 'Dermatology'],
    sameAs: [s.instagram, s.facebook, s.youtube, s.tiktok].filter(Boolean),
  };
  const ld = [org, ...(o.jsonld || [])].map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('');
  const html = `<!doctype html>
<html lang="${lang}" data-lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="id" href="${esc(site + basePath)}"><link rel="alternate" hreflang="en" href="${esc(site + (basePath === '/' ? '/en' : '/en' + basePath))}"><link rel="alternate" hreflang="x-default" href="${esc(site + basePath)}">
<meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:site_name" content="${esc(s.clinic_name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(ogImage.startsWith('http') ? ogImage : site + ogImage)}"><meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'id_ID'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F766E" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#081413" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml"><link rel="icon" href="/assets/img/icon-192.png" sizes="192x192"><link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(s.clinic_name)}"><meta name="mobile-web-app-capable" content="yes">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_VER}">
<script nonce="${ctx.nonce}">(function(){try{var t=localStorage.getItem('gk-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();</script>
${ld}${ga}
</head>
<body class="${o.bodyClass || ''}">
${o.bare ? '' : header(ctx, b, lang, o.active, path)}
<main id="main">${o.stamp ? saleStamp(s, lang) : ''}${o.body}</main>
${o.bare ? '' : footer(b, lang)}
<script nonce="${ctx.nonce}">window.GK=${JSON.stringify({ lang, wa: normPhone(s.whatsapp), ...(o.data || {}) }).replace(/</g, '\\u003c')};</script>
<script type="module" src="/assets/js/site.js?v=${ASSET_VER}"></script>
</body></html>`;
  return html;
}

export function pageHead(title, sub, crumbs = [], lang = 'id', extra = '') {
  const T = tt(lang);
  const bc = [[L(lang, '/'), T('home')], ...crumbs];
  return `<section class="page-head"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb">${bc.map(([h, n], i) => (i < bc.length - 1 || crumbs.length === 0 ? `<a href="${h}">${esc(n)}</a>` : `<span>${esc(n)}</span>`)).join(icon('chevron-right', '', 14))}</nav>
  <h1>${title}</h1>${sub ? `<p class="lead">${sub}</p>` : ''}${extra}
</div><div class="page-head-art" aria-hidden="true"></div></section>`;
}
