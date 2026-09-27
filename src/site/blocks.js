// Reusable website components and page-builder blocks.
import { icon, logoMark } from '../../public/assets/js/icons.js';
import { inline, markdown } from '../../public/assets/js/markdown.js';
import { active, byId, priceFor, sorted } from '../lib/cms.js';
import { DAYS, esc, fmtDate, localDate, money, tr } from '../lib/util.js';
import { t as tt } from './i18n.js';
import { L, avatar, img, waLink } from './layout.js';

const tx = (v, lang) => esc(tr(v, lang));
const md = (v, lang) => markdown(tr(v, lang));
/** Title with *emphasis* rendered as elegant italic accent. */
export const title = (v, lang) => inline(tr(v, lang)).replace(/<em>/g, '<em class="accent">');

export function serviceCard(s, b, lang) {
  const T = tt(lang);
  const poli = byId(b.polis, s.poli_id);
  return `<a class="card svc reveal" href="${L(lang, '/layanan/' + s.slug)}" style="--c:${esc(poli?.color || '#0F766E')}">
  <span class="svc-ic">${icon(s.icon || poli?.icon || 'stethoscope', '', 26)}</span>
  <h3>${tx(s.name, lang)}</h3><p>${tx(s.excerpt, lang)}</p>
  <span class="svc-foot">${s.price ? `<span class="price"><small>${T('from')}</small> ${money(s.price, lang)}</span>` : '<span></span>'}<span class="go">${icon('arrow-right', '', 18)}</span></span>
</a>`;
}

export function doctorCard(d, b, lang) {
  const T = tt(lang);
  const poli = byId(b.polis, d.poli_id);
  const brs = (d.branches || []).map((x) => byId(b.branches, x)?.city).filter(Boolean);
  return `<article class="card doc reveal" data-poli="${esc(d.poli_id)}" data-branches="${esc((d.branches || []).join(' '))}" data-name="${esc(d.name.toLowerCase())}">
  <a href="${L(lang, '/dokter/' + d.slug)}" class="doc-top">${avatar(d.name, d.photo, 'avatar-lg')}${d.telemedicine ? `<span class="badge badge-tele">${icon('video', '', 13)} ${T('telemedicine')}</span>` : ''}</a>
  <div class="doc-body"><span class="doc-poli" style="--c:${esc(poli?.color || '#0F766E')}">${tx(poli?.name, lang)}</span>
  <h3><a href="${L(lang, '/dokter/' + d.slug)}">${esc(d.name)}</a></h3><p class="muted">${tx(d.specialty, lang)}</p>
  <p class="doc-meta">${icon('award', '', 15)} ${esc(d.experience_years || '-')} ${T('experience')} <span>·</span> ${icon('star', 'star', 15)} ${esc(d.rating || '5.0')}</p>
  <p class="doc-meta">${icon('map-pin', '', 15)} ${esc(brs.join(', '))}</p></div>
  <div class="doc-act"><a class="btn btn-ghost btn-sm" href="${L(lang, '/dokter/' + d.slug)}">${T('readMore')}</a><a class="btn btn-primary btn-sm" href="${L(lang, '/booking')}?doctor=${esc(d.id)}">${T('booking')}</a></div>
</article>`;
}

export function promoCard(p, lang) {
  const T = tt(lang);
  return `<a class="card promo reveal" href="${L(lang, '/promo/' + p.slug)}">
  <div class="promo-art">${p.image ? img(p.image, tr(p.title, lang)) : `<div class="promo-pattern"></div>`}${p.badge ? `<span class="promo-badge">${tx(p.badge, lang)}</span>` : ''}</div>
  <div class="promo-body"><h3>${tx(p.title, lang)}</h3><p>${tx(p.excerpt, lang)}</p>
  <div class="promo-foot">${p.coupon_code ? `<span class="code">${icon('ticket', '', 15)} ${esc(p.coupon_code)}</span>` : ''}${p.end_date ? `<small>${T('validUntil')} ${fmtDate(p.end_date, lang)}</small>` : ''}</div></div>
</a>`;
}

export function testiCard(x, lang) {
  return `<figure class="card testi reveal"><div class="stars" aria-label="${x.rating}/5">${Array.from({ length: 5 }, (_, i) => icon('star', i < (x.rating || 5) ? 'star on' : 'star', 16)).join('')}</div>
  <blockquote>“${tx(x.content, lang)}”</blockquote>
  <figcaption>${avatar(x.name, x.photo, 'avatar-sm')}<span><b>${esc(x.name)}</b><small>${tx(x.caption, lang)}</small></span></figcaption></figure>`;
}

export function postCard(p, lang) {
  return `<a class="card post reveal" href="${L(lang, '/blog/' + p.slug)}">
  <div class="post-art">${p.cover ? img(p.cover, tr(p.title, lang)) : `<div class="post-pattern" data-cat="${esc(p.category)}">${icon('file', '', 34)}</div>`}<span class="chip">${esc(p.category || '')}</span></div>
  <div class="post-body"><time datetime="${esc(p.published_at)}">${fmtDate(p.published_at, lang)}</time><h3>${tx(p.title, lang)}</h3><p>${tx(p.excerpt, lang)}</p><span class="more">${tt(lang)('readMore')} ${icon('arrow-right', '', 16)}</span></div>
</a>`;
}

export function branchCard(br, lang, withMap = false) {
  const T = tt(lang);
  return `<article class="card branch reveal">
  ${withMap && br.maps_url ? `<div class="map"><iframe src="${esc(br.maps_url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="${esc(br.name)}"></iframe></div>` : `<div class="branch-art">${br.image ? img(br.image, br.name) : `<div class="branch-pattern">${icon('building', '', 40)}<span>${esc(br.city)}</span></div>`}${br.is_main ? '<span class="chip chip-gold">Pusat</span>' : ''}</div>`}
  <div class="branch-body"><h3><a href="${L(lang, '/cabang/' + br.slug)}">${esc(br.name)}</a></h3>
  <p>${icon('map-pin', '', 16)} ${esc(br.address)}</p><p>${icon('clock', '', 16)} ${tx(br.hours, lang)}</p><p>${icon('phone', '', 16)} <a href="tel:${esc(br.phone)}">${esc(br.phone)}</a></p>
  <div class="row-btns"><a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(br.lat && br.lng ? br.lat + ',' + br.lng : br.address)}" target="_blank" rel="noopener">${icon('map', '', 16)} ${T('openMap')}</a><a class="btn btn-primary btn-sm" href="${L(lang, '/booking')}?branch=${esc(br.id)}">${T('booking')}</a></div></div>
</article>`;
}

export function pricingCard(p, lang) {
  const T = tt(lang);
  const feats = tr(p.features, lang).split('\n').filter(Boolean);
  return `<article class="card price-card reveal ${p.highlight ? 'hl' : ''}">${p.highlight ? `<span class="ribbon">${T('mostPopular')}</span>` : ''}
  <h3>${tx(p.name, lang)}</h3><p class="muted">${tx(p.description, lang)}</p>
  <div class="amount">${p.price_old ? `<s>${money(p.price_old, lang)}</s>` : ''}<b>${money(p.price, lang)}</b></div>
  <ul class="checks">${feats.map((f) => `<li>${icon('check', '', 16)} ${esc(f)}</li>`).join('')}</ul>
  <a class="btn ${p.highlight ? 'btn-gold' : 'btn-primary'} btn-block" href="${L(lang, '/booking')}${p.service_id ? '?service=' + esc(p.service_id) : ''}">${T('choose')}</a></article>`;
}

export function facilityCard(f, lang) {
  return `<article class="card fac reveal">${f.image ? `<div class="fac-img">${img(f.image, tr(f.name, lang))}</div>` : `<span class="fac-ic">${icon(f.icon || 'star', '', 28)}</span>`}<h3>${tx(f.name, lang)}</h3><p>${tx(f.description, lang)}</p></article>`;
}

export function faqList(items, lang) {
  return `<div class="faq">${items.map((f, i) => `<details class="faq-item reveal" ${i === 0 ? 'open' : ''}><summary><span>${tx(f.question, lang)}</span>${icon('plus', 'faq-ic', 20)}</summary><div class="faq-a prose">${md(f.answer, lang)}</div></details>`).join('')}</div>`;
}

export function scheduleTable(b, doctorId, lang) {
  const T = tt(lang);
  const rows = sorted(active(b.schedules)).filter((s) => s.doctor_id === doctorId);
  if (!rows.length) return `<p class="muted">${T('noSchedule')}</p>`;
  const order = [1, 2, 3, 4, 5, 6, 0];
  rows.sort((a, c) => order.indexOf(Number(a.day)) - order.indexOf(Number(c.day)) || a.start.localeCompare(c.start));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${T('day')}</th><th>${T('time')}</th><th>${tt(lang)('branches')}</th></tr></thead><tbody>${rows.map((s) => `<tr><td><b>${DAYS[lang === 'en' ? 'en' : 'id'][Number(s.day)]}</b></td><td>${esc(s.start)}–${esc(s.end)}</td><td>${esc(byId(b.branches, s.branch_id)?.name || '')}${s.type === 'telemedicine' ? ' · ' + T('telemedicine') : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function sectionHead(o, lang, link) {
  const T = tt(lang);
  if (!o.title && !o.text) return '';
  return `<div class="sec-head reveal">${o.eyebrow ? `<span class="eyebrow">${tx(o.eyebrow, lang)}</span>` : ''}<div class="sec-head-row"><div>${o.title ? `<h2>${title(o.title, lang)}</h2>` : ''}${o.text ? `<p class="lead">${tx(o.text, lang)}</p>` : ''}</div>${link ? `<a class="btn btn-ghost" href="${L(lang, link)}">${T('seeAll')} ${icon('arrow-right', '', 16)}</a>` : ''}</div></div>`;
}

function heroArt(b, lang) {
  const s = b.settings || {};
  const d = sorted(active(b.doctors)).find((x) => x.featured) || active(b.doctors)[0];
  const today = localDate();
  return `<div class="hero-art" aria-hidden="true">
  <div class="orb orb1"></div><div class="orb orb2"></div>
  <div class="hero-card hc-main">
    <div class="hc-head">${logoMark(34, 'hr')}<div><b>${esc(s.clinic_name)}</b><small>${lang === 'en' ? 'Digital Clinic Platform' : 'Platform Klinik Digital'}</small></div></div>
    <div class="hc-doc">${avatar(d?.name || 'Dokter', d?.photo, 'avatar-md')}<div><b>${esc(d?.name || '')}</b><small>${tx(d?.specialty, lang)}</small><span class="stars-mini">${icon('star', 'star on', 13)} ${esc(d?.rating || '4.9')}</span></div></div>
    <div class="hc-slots"><span>08:20</span><span class="on">09:00</span><span>09:40</span><span>10:20</span><span class="off">11:00</span><span>11:40</span></div>
    <div class="hc-btn">${icon('calendar-check', '', 16)} ${lang === 'en' ? 'Confirm booking' : 'Konfirmasi booking'}</div>
  </div>
  <div class="hero-card hc-float hc-ok">${icon('check-circle', '', 22)}<div><b>${lang === 'en' ? 'Booking confirmed' : 'Booking terkonfirmasi'}</b><small>GK${today.slice(2).replace(/-/g, '')}-7KQ2 · 09:00</small></div></div>
  <div class="hero-card hc-float hc-queue"><small>${lang === 'en' ? 'Your queue' : 'Antrian Anda'}</small><b>A-012</b><span class="pulse"></span></div>
  <div class="hero-card hc-float hc-lab">${icon('flask', '', 20)}<div><b>${lang === 'en' ? 'Lab results ready' : 'Hasil lab siap'}</b><small>PDF · ${lang === 'en' ? 'Download' : 'Unduh'}</small></div></div>
</div>`;
}

// ------------------------------------------------------------------ blocks
const BLOCKS = {
  hero(o, b, lang, ctx) {
    const T = tt(lang);
    const cta2 = o.cta2_href === 'wa' ? waLink(b.settings?.whatsapp) : L(lang, o.cta2_href || '/jadwal');
    return `<section class="hero"><div class="wrap hero-in">
  <div class="hero-txt">${o.eyebrow ? `<span class="eyebrow eyebrow-pill">${icon('sparkles', '', 15)} ${tx(o.eyebrow, lang)}</span>` : ''}
  <h1>${title(o.title, lang)}</h1><p class="lead">${tx(o.text, lang)}</p>
  <div class="row-btns">${o.cta_label ? `<a class="btn btn-primary btn-lg" href="${L(lang, o.cta_href || '/booking')}">${icon('calendar-check', '', 18)} ${tx(o.cta_label, lang)}</a>` : ''}${o.cta2_label ? `<a class="btn btn-ghost btn-lg" href="${cta2}">${tx(o.cta2_label, lang)} ${icon('arrow-right', '', 18)}</a>` : ''}</div>
  <div class="hero-trust"><span>${icon('shield', '', 18)} ${lang === 'en' ? 'Licensed doctors' : 'Dokter berlisensi'}</span><span>${icon('lock', '', 18)} ${lang === 'en' ? 'Encrypted records' : 'Rekam medis terenkripsi'}</span><span>${icon('clock', '', 18)} ${lang === 'en' ? 'Book in 60 seconds' : 'Booking 60 detik'}</span></div>
  </div>${o.image ? `<div class="hero-photo">${img(o.image, tr(o.title, lang), '', 'loading="eager" fetchpriority="high"')}</div>` : heroArt(b, lang)}
</div></section>`;
  },
  richtext(o, b, lang) {
    return `<section class="sec"><div class="wrap narrow">${o.title ? `<h2 class="reveal">${title(o.title, lang)}</h2>` : ''}<div class="prose reveal">${md(o.text, lang)}</div></div></section>`;
  },
  image(o, b, lang) {
    return `<section class="sec"><div class="wrap">${img(o.image, tr(o.caption || o.title, lang), 'wide-img reveal')}${o.caption ? `<p class="caption">${tx(o.caption, lang)}</p>` : ''}</div></section>`;
  },
  cta(o, b, lang) {
    const cta2 = o.cta2_href === 'wa' ? waLink(b.settings?.whatsapp) : L(lang, o.cta2_href || '/kontak');
    return `<section class="sec"><div class="wrap"><div class="cta-band reveal"><div><h2>${title(o.title, lang)}</h2><p>${tx(o.text, lang)}</p></div><div class="row-btns">${o.cta_label ? `<a class="btn btn-gold btn-lg" href="${L(lang, o.cta_href || '/booking')}">${tx(o.cta_label, lang)}</a>` : ''}${o.cta2_label ? `<a class="btn btn-light btn-lg" href="${cta2}" ${o.cta2_href === 'wa' ? 'target="_blank" rel="noopener"' : ''}>${o.cta2_href === 'wa' ? icon('message', '', 18) : ''} ${tx(o.cta2_label, lang)}</a>` : ''}</div></div></div></section>`;
  },
  stats(o, b, lang) {
    return `<section class="sec sec-tight"><div class="wrap"><div class="stats">${(o.items || []).map((x) => `<div class="stat reveal"><b data-count>${esc(x.value)}</b><span>${tx(x.label, lang)}</span></div>`).join('')}</div></div></section>`;
  },
  features(o, b, lang) {
    return `<section class="sec sec-alt"><div class="wrap">${sectionHead(o, lang)}<div class="grid g4">${(o.items || []).map((x) => `<div class="feat reveal"><span class="feat-ic">${icon(x.icon || 'check', '', 24)}</span><h3>${tx(x.title, lang)}</h3><p>${tx(x.text, lang)}</p></div>`).join('')}</div></div></section>`;
  },
  services(o, b, lang) {
    const list = sorted(active(b.services)).filter((s) => !o.featured_only || s.featured).slice(0, o.limit || 8);
    return `<section class="sec"><div class="wrap">${sectionHead(o, lang, '/layanan')}<div class="grid g4">${list.map((s) => serviceCard(s, b, lang)).join('')}</div></div></section>`;
  },
  doctors(o, b, lang) {
    const list = sorted(active(b.doctors)).filter((d) => d.featured !== false).slice(0, o.limit || 6);
    return `<section class="sec sec-alt"><div class="wrap">${sectionHead(o, lang, '/dokter')}<div class="grid g3">${list.map((d) => doctorCard(d, b, lang)).join('')}</div></div></section>`;
  },
  promos(o, b, lang) {
    const today = localDate();
    const list = active(b.promotions).filter((p) => (!p.start_date || p.start_date <= today) && (!p.end_date || p.end_date >= today)).slice(0, o.limit || 3);
    if (!list.length) return '';
    return `<section class="sec"><div class="wrap">${sectionHead(o, lang, '/promo')}<div class="grid g3">${list.map((p) => promoCard(p, lang)).join('')}</div></div></section>`;
  },
  testimonials(o, b, lang) {
    const list = (b.testimonials || []).filter((x) => x.status !== 'pending').slice(0, o.limit || 6);
    return `<section class="sec sec-dark"><div class="wrap">${sectionHead(o, lang, '/testimoni')}<div class="testi-track">${list.map((x) => testiCard(x, lang)).join('')}</div></div></section>`;
  },
  faq(o, b, lang) {
    const list = sorted(active(b.faqs)).slice(0, o.limit || 6);
    return `<section class="sec"><div class="wrap narrow">${sectionHead(o, lang, '/faq')}${faqList(list, lang)}</div></section>`;
  },
  branches(o, b, lang) {
    return `<section class="sec sec-alt"><div class="wrap">${sectionHead(o, lang, '/cabang')}<div class="grid g3">${sorted(active(b.branches)).map((br) => branchCard(br, lang)).join('')}</div></div></section>`;
  },
  posts(o, b, lang) {
    const list = (b.posts || []).filter((p) => p.status !== 'draft').sort((a, c) => String(c.published_at).localeCompare(String(a.published_at))).slice(0, o.limit || 3);
    return `<section class="sec"><div class="wrap">${sectionHead(o, lang, '/blog')}<div class="grid g3">${list.map((p) => postCard(p, lang)).join('')}</div></div></section>`;
  },
  pricing(o, b, lang) {
    return `<section class="sec sec-alt"><div class="wrap">${sectionHead(o, lang, '/harga')}<div class="grid g3 price-grid">${sorted(active(b.pricing)).map((p) => pricingCard(p, lang)).join('')}</div></div></section>`;
  },
  facilities(o, b, lang) {
    return `<section class="sec"><div class="wrap">${sectionHead(o, lang, '/fasilitas')}<div class="grid g3">${sorted(active(b.facilities)).map((f) => facilityCard(f, lang)).join('')}</div></div></section>`;
  },
  gallery(o, b, lang) {
    const imgs = (o.images || []).filter(Boolean);
    if (!imgs.length) return '';
    return `<section class="sec"><div class="wrap">${sectionHead(o, lang)}<div class="gallery">${imgs.map((u) => img(typeof u === 'string' ? u : u.url, tr(o.title, lang), 'reveal')).join('')}</div></div></section>`;
  },
  booking(o, b, lang) {
    const T = tt(lang);
    return `<section class="sec"><div class="wrap"><div class="cta-band cta-soft reveal"><div><h2>${title(o.title || { id: 'Booking dokter dalam 60 detik', en: 'Book a doctor in 60 seconds' }, lang)}</h2><p>${tx(o.text || { id: 'Pilih cabang, dokter, dan jam yang tersedia secara real-time.', en: 'Choose a branch, doctor and time with real-time availability.' }, lang)}</p></div><a class="btn btn-primary btn-lg" href="${L(lang, '/booking')}">${T('bookNow')}</a></div></div></section>`;
  },
};

export function renderBlocks(blocks, b, lang, ctx) {
  return (blocks || []).map((o) => (BLOCKS[o.type] ? BLOCKS[o.type](o, b, lang, ctx) : '')).join('\n');
}
