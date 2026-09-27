// Public website pages (server-rendered from the CMS bundle — zero D1 queries).
import { icon, logoMark } from '../../public/assets/js/icons.js';
import { markdown } from '../../public/assets/js/markdown.js';
import { active, byId, getBundle, getHeavy, priceFor, sorted } from '../lib/cms.js';
import { DAYS, esc, fmtDate, html, localDate, money, tr } from '../lib/util.js';
import { branchCard, doctorCard, facilityCard, faqList, postCard, pricingCard, promoCard, renderBlocks, scheduleTable, serviceCard, testiCard, title } from './blocks.js';
import { t as tt } from './i18n.js';
import { L, avatar, img, layout, pageHead, waLink } from './layout.js';

const tx = (v, lang) => esc(tr(v, lang));

function respond(ctx, b, o, status = 200) {
  const body = layout(ctx, b, o);
  return html(body, status, { 'cache-control': 'public, max-age=0, s-maxage=60', 'x-bundle-ver': String(b.ver || '') });
}

async function findPage(ctx, b, slug) {
  const p = (b.pages || []).find((x) => x.slug === slug && x.status !== 'draft');
  if (!p) return null;
  const heavy = await getHeavy(ctx.env, 'pages', p.id);
  return { ...p, ...heavy };
}

export async function home(ctx, lang) {
  const b = await getBundle(ctx.env);
  const p = await findPage(ctx, b, 'home');
  const body = p ? renderBlocks(p.blocks, b, lang, ctx) : renderBlocks([{ type: 'hero', title: b.settings.tagline, text: b.settings.description, cta_label: { id: 'Booking', en: 'Book' }, cta_href: '/booking' }], b, lang, ctx);
  return respond(ctx, b, { lang, body, stamp: true, bodyClass: 'is-home', description: tr(p?.seo_description, lang) });
}

export async function cmsPage(ctx, lang, slug, activePath) {
  const b = await getBundle(ctx.env);
  const p = await findPage(ctx, b, slug);
  if (!p) return null;
  const blocks = p.blocks || [];
  const hasHero = blocks[0]?.type === 'hero';
  const head = hasHero ? '' : pageHead(tx(p.title, lang), '', [['', tr(p.title, lang)]], lang);
  return respond(ctx, b, { lang, title: tr(p.title, lang), description: tr(p.seo_description, lang), body: head + renderBlocks(blocks, b, lang, ctx), active: activePath });
}

export async function about(ctx, lang) {
  return (await cmsPage(ctx, lang, 'tentang', '/tentang')) || notFoundPage(ctx, lang);
}

export async function services(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const polis = sorted(active(b.polis));
  const list = sorted(active(b.services));
  const body = `${pageHead(T('services'), lang === 'en' ? 'Complete care for every member of your family — from general practice to specialists, lab and telemedicine.' : 'Perawatan lengkap untuk seluruh keluarga — dari dokter umum, spesialis, laboratorium, hingga telemedicine.', [['', T('services')]], lang)}
<section class="sec"><div class="wrap">
<div class="chips" data-filter-group="svc"><button class="chip on" data-filter="all">${T('all')}</button>${polis.map((p) => `<button class="chip" data-filter="${esc(p.id)}" style="--c:${esc(p.color)}">${icon(p.icon || 'stethoscope', '', 15)} ${tx(p.name, lang)}</button>`).join('')}</div>
<div class="grid g4" data-filter-items="svc">${list.map((s) => `<div data-key="${esc(s.poli_id)}">${serviceCard(s, b, lang)}</div>`).join('')}</div>
</div></section>
<section class="sec sec-alt"><div class="wrap"><div class="grid g3">${polis.map((p) => `<div class="card poli reveal" style="--c:${esc(p.color)}"><span class="svc-ic">${icon(p.icon || 'stethoscope', '', 24)}</span><h3>${tx(p.name, lang)}</h3><p>${tx(p.description, lang)}</p><p class="muted small">${(p.branches || []).map((x) => esc(byId(b.branches, x)?.city)).join(' · ')}</p></div>`).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('services'), body, active: '/layanan' });
}

export async function serviceDetail(ctx, lang, slug) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const s = active(b.services).find((x) => x.slug === slug);
  if (!s) return notFoundPage(ctx, lang);
  const heavy = await getHeavy(ctx.env, 'services', s.id);
  const poli = byId(b.polis, s.poli_id);
  const docs = sorted(active(b.doctors)).filter((d) => d.poli_id === s.poli_id);
  const brs = sorted(active(b.branches)).filter((br) => !(s.branches || []).length || s.branches.includes(br.id));
  const body = `${pageHead(tx(s.name, lang), tx(s.excerpt, lang), [[L(lang, '/layanan'), T('services')], ['', tr(s.name, lang)]], lang)}
<section class="sec"><div class="wrap split">
  <article class="prose reveal">${s.image ? img(s.image, tr(s.name, lang), 'wide-img') : ''}${markdown(tr(heavy.content, lang))}</article>
  <aside class="side">
    <div class="card side-card reveal" style="--c:${esc(poli?.color || '#0F766E')}"><span class="svc-ic">${icon(s.icon || 'stethoscope', '', 26)}</span>
      <h3>${tx(s.name, lang)}</h3><p class="muted">${tx(poli?.name, lang)} · ${esc(s.duration || 30)} ${lang === 'en' ? 'min' : 'menit'}</p>
      ${s.price ? `<div class="amount"><small>${T('from')}</small><b>${money(s.price, lang)}</b></div><p class="muted small">${tx(s.price_note, lang)}</p>` : ''}
      <table class="mini"><tbody>${brs.map((br) => `<tr><td>${esc(br.name)}</td><td>${money(priceFor(s, br.id), lang)}</td></tr>`).join('')}</tbody></table>
      ${s.telemedicine ? `<p class="badge badge-tele">${icon('video', '', 14)} ${T('telemedicine')} ${T('available').toLowerCase()}</p>` : ''}
      <a class="btn btn-primary btn-block" href="${L(lang, '/booking')}?service=${esc(s.id)}">${icon('calendar-check', '', 18)} ${T('bookNow')}</a>
      <a class="btn btn-ghost btn-block" href="${waLink(b.settings.whatsapp, (lang === 'en' ? 'Hello, I would like to ask about ' : 'Halo, saya ingin bertanya tentang ') + tr(s.name, lang))}" target="_blank" rel="noopener">${icon('message', '', 18)} WhatsApp</a>
    </div>
  </aside>
</div></section>
${docs.length ? `<section class="sec sec-alt"><div class="wrap"><div class="sec-head"><h2>${lang === 'en' ? 'Doctors for this service' : 'Dokter untuk layanan ini'}</h2></div><div class="grid g3">${docs.map((d) => doctorCard(d, b, lang)).join('')}</div></div></section>` : ''}`;
  return respond(ctx, b, { lang, title: tr(s.name, lang), description: tr(s.excerpt, lang), body, active: '/layanan', jsonld: [{ '@context': 'https://schema.org', '@type': 'MedicalProcedure', name: tr(s.name, lang), description: tr(s.excerpt, lang) }] });
}

export async function doctors(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const list = sorted(active(b.doctors));
  const body = `${pageHead(T('doctors'), lang === 'en' ? 'Experienced, licensed and caring medical professionals.' : 'Tenaga medis berpengalaman, berlisensi, dan penuh empati.', [['', T('doctors')]], lang)}
<section class="sec"><div class="wrap">
<div class="filters" data-doc-filters>
  <label class="search">${icon('search', '', 18)}<input type="search" placeholder="${T('searchDoctor')}" data-f="q" aria-label="${T('searchDoctor')}"></label>
  <select data-f="poli" aria-label="Poli"><option value="">${T('allPoli')}</option>${sorted(active(b.polis)).map((p) => `<option value="${esc(p.id)}">${tx(p.name, lang)}</option>`).join('')}</select>
  <select data-f="branch" aria-label="Cabang"><option value="">${T('allBranch')}</option>${sorted(active(b.branches)).map((br) => `<option value="${esc(br.id)}">${esc(br.name)}</option>`).join('')}</select>
</div>
<div class="grid g3" data-doc-list>${list.map((d) => doctorCard(d, b, lang)).join('')}</div>
<p class="empty" data-doc-empty hidden>${lang === 'en' ? 'No doctors match your filters.' : 'Tidak ada dokter yang sesuai filter.'}</p>
</div></section>`;
  return respond(ctx, b, { lang, title: T('doctors'), body, active: '/dokter' });
}

export async function doctorDetail(ctx, lang, slug) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const d = active(b.doctors).find((x) => x.slug === slug);
  if (!d) return notFoundPage(ctx, lang);
  const poli = byId(b.polis, d.poli_id);
  const edu = tr(d.education, lang).split('\n').filter(Boolean);
  const body = `<section class="doc-hero"><div class="wrap doc-hero-in">
  <div class="doc-hero-photo reveal">${avatar(d.name, d.photo, 'avatar-xl')}</div>
  <div class="reveal"><nav class="crumbs"><a href="${L(lang, '/')}">${T('home')}</a>${icon('chevron-right', '', 14)}<a href="${L(lang, '/dokter')}">${T('doctors')}</a></nav>
  <span class="doc-poli" style="--c:${esc(poli?.color || '#0F766E')}">${tx(poli?.name, lang)}</span>
  <h1>${esc(d.name)}</h1><p class="lead">${tx(d.specialty, lang)}</p>
  <div class="doc-facts"><span>${icon('award', '', 18)} <b>${esc(d.experience_years || '-')}</b> ${T('experience')}</span><span>${icon('star', 'star on', 18)} <b>${esc(d.rating || '5.0')}</b>/5</span><span>${icon('globe', '', 18)} ${esc(d.languages || '')}</span>${d.telemedicine ? `<span>${icon('video', '', 18)} ${T('telemedicine')}</span>` : ''}</div>
  <div class="row-btns"><a class="btn btn-primary btn-lg" href="${L(lang, '/booking')}?doctor=${esc(d.id)}">${icon('calendar-check', '', 18)} ${T('bookDoctor')}</a>${d.consult_fee ? `<span class="fee">${T('consultFee')} <b>${money(d.consult_fee, lang)}</b></span>` : ''}</div></div>
</div></section>
<section class="sec"><div class="wrap split">
  <article class="prose reveal"><h2>${lang === 'en' ? 'Profile' : 'Profil'}</h2>${markdown(tr(d.bio, lang))}${edu.length ? `<h3>${T('education')}</h3><ul>${edu.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}<p class="muted small">STR ${esc(d.str_no || '-')} · SIP ${esc(d.sip_no || '-')}</p></article>
  <aside class="side"><div class="card side-card reveal"><h3>${icon('calendar', '', 20)} ${T('practiceSchedule')}</h3>${scheduleTable(b, d.id, lang)}<a class="btn btn-primary btn-block" href="${L(lang, '/booking')}?doctor=${esc(d.id)}">${T('bookNow')}</a></div></aside>
</div></section>`;
  return respond(ctx, b, { lang, title: d.name, description: `${d.name} — ${tr(d.specialty, lang)}`, body, active: '/dokter', jsonld: [{ '@context': 'https://schema.org', '@type': 'Physician', name: d.name, medicalSpecialty: tr(d.specialty, 'en'), image: d.photo || undefined }] });
}

export async function schedule(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const branches = sorted(active(b.branches));
  const docs = sorted(active(b.doctors));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = DAYS[lang === 'en' ? 'en' : 'id'];
  const tables = branches.map((br, i) => {
    const rows = docs.filter((d) => active(b.schedules).some((s) => s.doctor_id === d.id && s.branch_id === br.id));
    return `<div class="sched ${i ? '' : 'on'}" data-tab-panel="${esc(br.id)}"><div class="tbl-wrap"><table class="tbl sched-tbl"><thead><tr><th>${T('doctors')}</th>${order.map((dd) => `<th>${dayNames[dd].slice(0, 3)}</th>`).join('')}<th></th></tr></thead><tbody>
${rows.map((d) => `<tr data-poli="${esc(d.poli_id)}"><td><a class="sched-doc" href="${L(lang, '/dokter/' + d.slug)}">${avatar(d.name, d.photo, 'avatar-xs')}<span><b>${esc(d.name)}</b><small>${tx(byId(b.polis, d.poli_id)?.name, lang)}</small></span></a></td>${order.map((dd) => {
      const ss = active(b.schedules).filter((s) => s.doctor_id === d.id && s.branch_id === br.id && Number(s.day) === dd);
      return `<td>${ss.map((s) => `<span class="slot-pill">${esc(s.start)}–${esc(s.end)}</span>`).join('') || '<span class="dash">–</span>'}</td>`;
    }).join('')}<td><a class="btn btn-primary btn-xs" href="${L(lang, '/booking')}?doctor=${esc(d.id)}&branch=${esc(br.id)}">${T('booking')}</a></td></tr>`).join('') || `<tr><td colspan="9" class="muted">${T('noSchedule')}</td></tr>`}
</tbody></table></div></div>`;
  }).join('');
  const body = `${pageHead(T('schedule'), lang === 'en' ? 'Weekly practice schedules per branch. Book an available slot in real-time.' : 'Jadwal praktik mingguan per cabang. Booking slot yang tersedia secara real-time.', [['', T('schedule')]], lang)}
<section class="sec"><div class="wrap">
<div class="tabs" role="tablist">${branches.map((br, i) => `<button class="tab ${i ? '' : 'on'}" data-tab="${esc(br.id)}" role="tab">${icon('building', '', 16)} ${esc(br.name)}</button>`).join('')}</div>
<div class="chips" data-sched-poli><button class="chip on" data-poli="">${T('allPoli')}</button>${sorted(active(b.polis)).map((p) => `<button class="chip" data-poli="${esc(p.id)}">${tx(p.name, lang)}</button>`).join('')}</div>
${tables}
<p class="muted small">${icon('info', '', 15)} ${lang === 'en' ? 'Schedules may change on public holidays. Please book in advance.' : 'Jadwal dapat berubah pada hari libur nasional. Disarankan booking terlebih dahulu.'}</p>
</div></section>`;
  return respond(ctx, b, { lang, title: T('schedule'), body, active: '/jadwal' });
}

export async function facilities(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const body = `${pageHead(T('facilities'), lang === 'en' ? 'Modern, clean and comfortable facilities at every branch.' : 'Fasilitas modern, bersih, dan nyaman di setiap cabang.', [['', T('facilities')]], lang)}<section class="sec"><div class="wrap"><div class="grid g3">${sorted(active(b.facilities)).map((f) => facilityCard(f, lang)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('facilities'), body, active: '/fasilitas' });
}

export async function branches(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const body = `${pageHead(T('branches'), lang === 'en' ? 'Find the Global Klinik branch nearest to you.' : 'Temukan cabang Global Klinik terdekat dari Anda.', [['', T('branches')]], lang)}<section class="sec"><div class="wrap"><div class="grid g3">${sorted(active(b.branches)).map((br) => branchCard(br, lang, true)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('branches'), body, active: '/cabang' });
}

export async function branchDetail(ctx, lang, slug) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const br = active(b.branches).find((x) => x.slug === slug);
  if (!br) return notFoundPage(ctx, lang);
  const docs = sorted(active(b.doctors)).filter((d) => (d.branches || []).includes(br.id));
  const svcs = sorted(active(b.services)).filter((s) => !(s.branches || []).length || s.branches.includes(br.id));
  const body = `${pageHead(esc(br.name), `${icon('map-pin', '', 16)} ${esc(br.address)}`, [[L(lang, '/cabang'), T('branches')], ['', br.name]], lang)}
<section class="sec"><div class="wrap split">
  <div class="map map-lg reveal">${br.maps_url ? `<iframe src="${esc(br.maps_url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="${esc(br.name)}"></iframe>` : ''}</div>
  <aside class="side"><div class="card side-card reveal"><h3>${esc(br.name)}</h3>
    <p>${icon('clock', '', 16)} ${tx(br.hours, lang)}</p><p>${icon('phone', '', 16)} <a href="tel:${esc(br.phone)}">${esc(br.phone)}</a></p><p>${icon('mail', '', 16)} <a href="mailto:${esc(br.email)}">${esc(br.email)}</a></p>
    <a class="btn btn-primary btn-block" href="${L(lang, '/booking')}?branch=${esc(br.id)}">${T('bookNow')}</a>
    <a class="btn btn-ghost btn-block" href="${waLink(br.whatsapp || b.settings.whatsapp)}" target="_blank" rel="noopener">${icon('message', '', 18)} WhatsApp</a>
    <a class="btn btn-ghost btn-block" href="/antrian?branch=${esc(br.id)}">${icon('monitor', '', 18)} ${T('queue')}</a></div></aside>
</div></section>
<section class="sec sec-alt"><div class="wrap"><div class="sec-head"><h2>${T('doctorsHere')}</h2></div><div class="grid g3">${docs.map((d) => doctorCard(d, b, lang)).join('')}</div></div></section>
<section class="sec"><div class="wrap"><div class="sec-head"><h2>${T('servicesHere')}</h2></div><div class="grid g4">${svcs.map((s) => serviceCard(s, b, lang)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: br.name, description: br.address, body, active: '/cabang', jsonld: [{ '@context': 'https://schema.org', '@type': 'MedicalClinic', name: br.name, address: br.address, telephone: br.phone, geo: br.lat ? { '@type': 'GeoCoordinates', latitude: br.lat, longitude: br.lng } : undefined }] });
}

export async function pricing(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const brs = sorted(active(b.branches));
  const svcs = sorted(active(b.services));
  const procs = active(b.procedures);
  const labs = active(b.lab_tests);
  const body = `${pageHead(T('pricing'), lang === 'en' ? 'Transparent pricing — no hidden fees.' : 'Harga transparan — tanpa biaya tersembunyi.', [['', T('pricing')]], lang)}
<section class="sec"><div class="wrap"><div class="sec-head"><h2>${T('packages')}</h2></div><div class="grid g3 price-grid">${sorted(active(b.pricing)).map((p) => pricingCard(p, lang)).join('')}</div></div></section>
<section class="sec sec-alt"><div class="wrap"><div class="sec-head"><h2>${T('priceList')}</h2></div>
<div class="tabs" role="tablist">${brs.map((br, i) => `<button class="tab ${i ? '' : 'on'}" data-tab="${esc(br.id)}">${esc(br.name)}</button>`).join('')}</div>
${brs.map((br, i) => `<div class="sched ${i ? '' : 'on'}" data-tab-panel="${esc(br.id)}"><div class="grid g2">
  <div class="card"><h3>${T('services')}</h3><table class="tbl"><tbody>${svcs.filter((s) => !(s.branches || []).length || s.branches.includes(br.id)).map((s) => `<tr><td>${tx(s.name, lang)}<small class="muted block">${tx(s.price_note, lang)}</small></td><td class="num">${money(priceFor(s, br.id), lang)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h3>${lang === 'en' ? 'Procedures' : 'Tindakan'}</h3><table class="tbl"><tbody>${procs.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${money(priceFor(p, br.id), lang)}</td></tr>`).join('')}</tbody></table>
  <h3 class="mt">${lang === 'en' ? 'Laboratory' : 'Laboratorium'}</h3><table class="tbl"><tbody>${labs.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${money(p.price, lang)}</td></tr>`).join('')}</tbody></table></div>
</div></div>`).join('')}
<p class="muted small">${icon('info', '', 15)} ${lang === 'en' ? 'Prices may change. Final costs are confirmed by our cashier.' : 'Harga dapat berubah sewaktu-waktu. Biaya final dikonfirmasi oleh kasir.'}</p></div></section>`;
  return respond(ctx, b, { lang, title: T('pricing'), body, active: '/harga' });
}

export async function promos(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const today = localDate();
  const list = active(b.promotions).filter((p) => !p.end_date || p.end_date >= today);
  const body = `${pageHead(T('promos'), lang === 'en' ? 'Special offers to keep you and your family healthy.' : 'Penawaran spesial untuk kesehatan Anda dan keluarga.', [['', T('promos')]], lang)}<section class="sec"><div class="wrap"><div class="grid g3">${list.map((p) => promoCard(p, lang)).join('') || `<p class="empty">${lang === 'en' ? 'No active promotions.' : 'Belum ada promo aktif.'}</p>`}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('promos'), body, active: '/promo' });
}

export async function promoDetail(ctx, lang, slug) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const p = active(b.promotions).find((x) => x.slug === slug);
  if (!p) return notFoundPage(ctx, lang);
  const heavy = await getHeavy(ctx.env, 'promotions', p.id);
  const body = `${pageHead(tx(p.title, lang), tx(p.excerpt, lang), [[L(lang, '/promo'), T('promos')], ['', tr(p.title, lang)]], lang)}
<section class="sec"><div class="wrap split"><article class="prose reveal">${p.image ? img(p.image, tr(p.title, lang), 'wide-img') : ''}${markdown(tr(heavy.content, lang))}</article>
<aside class="side"><div class="card side-card reveal">${p.badge ? `<span class="promo-badge static">${tx(p.badge, lang)}</span>` : ''}${p.coupon_code ? `<p>${T('useCode')}</p><button class="code code-lg" data-copy="${esc(p.coupon_code)}">${icon('copy', '', 18)} ${esc(p.coupon_code)}</button>` : ''}${p.end_date ? `<p class="muted">${T('validUntil')} ${fmtDate(p.end_date, lang)}</p>` : ''}<a class="btn btn-primary btn-block" href="${L(lang, '/booking')}${p.coupon_code ? '?coupon=' + esc(p.coupon_code) : ''}">${T('bookNow')}</a></div></aside></div></section>`;
  return respond(ctx, b, { lang, title: tr(p.title, lang), description: tr(p.excerpt, lang), body, active: '/promo' });
}

export async function testimonials(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const list = (b.testimonials || []).filter((x) => x.status !== 'pending');
  const avg = list.length ? (list.reduce((a, x) => a + (Number(x.rating) || 5), 0) / list.length).toFixed(1) : '5.0';
  const body = `${pageHead(T('testimonials'), `${icon('star', 'star on', 18)} <b>${avg}</b>/5 · ${list.length} ${lang === 'en' ? 'reviews' : 'ulasan'}`, [['', T('testimonials')]], lang)}
<section class="sec"><div class="wrap"><div class="masonry">${list.map((x) => testiCard(x, lang)).join('')}</div></div></section>
<section class="sec sec-alt"><div class="wrap narrow"><div class="card form-card reveal"><h2>${T('writeTesti')}</h2>
<form data-form="testimonial" class="form" novalidate><div class="form-grid"><label>${T('name')}<input name="name" required maxlength="80"></label><label>${T('yourRating')}<select name="rating">${[5, 4, 3, 2, 1].map((r) => `<option value="${r}">${'★'.repeat(r)}</option>`).join('')}</select></label></div>
<label>${lang === 'en' ? 'Caption (optional)' : 'Keterangan (opsional)'}<input name="caption" maxlength="80" placeholder="${lang === 'en' ? 'e.g. Dental patient' : 'mis. Pasien Poli Gigi'}"></label><label>${T('yourStory')}<textarea name="content" rows="4" required maxlength="1000"></textarea></label><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off">
<button class="btn btn-primary" type="submit">${icon('send', '', 16)} ${T('send')}</button><p class="form-msg" role="status"></p></form></div></div></section>`;
  return respond(ctx, b, { lang, title: T('testimonials'), body, active: '/testimoni', jsonld: [{ '@context': 'https://schema.org', '@type': 'MedicalClinic', name: b.settings.clinic_name, aggregateRating: { '@type': 'AggregateRating', ratingValue: avg, reviewCount: list.length } }] });
}

export async function blog(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const cat = ctx.url.searchParams.get('kategori') || '';
  const all = (b.posts || []).filter((p) => p.status !== 'draft').sort((a, c) => String(c.published_at).localeCompare(String(a.published_at)));
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const list = cat ? all.filter((p) => p.category === cat) : all;
  const [first, ...rest] = list;
  const body = `${pageHead(T('blog'), lang === 'en' ? 'Trusted health information written by our doctors.' : 'Informasi kesehatan terpercaya dari para dokter kami.', [['', T('blog')]], lang)}
<section class="sec"><div class="wrap"><div class="chips"><a class="chip ${cat ? '' : 'on'}" href="${L(lang, '/blog')}">${T('all')}</a>${cats.map((c) => `<a class="chip ${c === cat ? 'on' : ''}" href="${L(lang, '/blog')}?kategori=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
${first ? `<a class="card post post-feature reveal" href="${L(lang, '/blog/' + first.slug)}"><div class="post-art">${first.cover ? img(first.cover, tr(first.title, lang)) : `<div class="post-pattern">${icon('file', '', 48)}</div>`}</div><div class="post-body"><span class="chip">${esc(first.category)}</span><time>${fmtDate(first.published_at, lang)}</time><h2>${tx(first.title, lang)}</h2><p>${tx(first.excerpt, lang)}</p><span class="more">${T('readMore')} ${icon('arrow-right', '', 16)}</span></div></a>` : ''}
<div class="grid g3">${rest.map((p) => postCard(p, lang)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('blog'), body, active: '/blog' });
}

export async function post(ctx, lang, slug) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const p = (b.posts || []).find((x) => x.slug === slug && x.status !== 'draft');
  if (!p) return notFoundPage(ctx, lang);
  const heavy = await getHeavy(ctx.env, 'posts', p.id);
  const content = tr(heavy.content, lang);
  const mins = Math.max(1, Math.round(content.split(/\s+/).length / 200));
  const related = (b.posts || []).filter((x) => x.id !== p.id && x.status !== 'draft').sort((a, c) => (c.category === p.category) - (a.category === p.category)).slice(0, 3);
  const body = `<article><header class="article-head"><div class="wrap narrow"><nav class="crumbs"><a href="${L(lang, '/')}">${T('home')}</a>${icon('chevron-right', '', 14)}<a href="${L(lang, '/blog')}">${T('blog')}</a></nav>
<span class="chip">${esc(p.category)}</span><h1>${tx(p.title, lang)}</h1><p class="lead">${tx(p.excerpt, lang)}</p>
<p class="article-meta">${icon('user', '', 16)} ${esc(p.author)} · ${icon('calendar', '', 16)} ${fmtDate(p.published_at, lang)} · ${icon('clock', '', 16)} ${mins} ${T('minutesRead')}</p></div></header>
${p.cover ? `<div class="wrap narrow">${img(p.cover, tr(p.title, lang), 'wide-img')}</div>` : ''}
<div class="wrap narrow"><div class="prose prose-lg">${markdown(content)}</div>
<div class="share">${lang === 'en' ? 'Share' : 'Bagikan'}: <a href="https://wa.me/?text=${encodeURIComponent(tr(p.title, lang) + ' ' + ctx.site + ctx.url.pathname)}" target="_blank" rel="noopener">${icon('message', '', 18)} WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ctx.site + ctx.url.pathname)}" target="_blank" rel="noopener">${icon('facebook', '', 18)} Facebook</a><button class="linkish" data-copy="${esc(ctx.site + ctx.url.pathname)}">${icon('copy', '', 18)} Link</button></div>
<div class="cta-band cta-soft"><div><h3>${lang === 'en' ? 'Need a consultation?' : 'Butuh konsultasi?'}</h3><p>${lang === 'en' ? 'Book a doctor online in 60 seconds.' : 'Booking dokter online dalam 60 detik.'}</p></div><a class="btn btn-primary" href="${L(lang, '/booking')}">${T('bookNow')}</a></div></div></article>
<section class="sec sec-alt"><div class="wrap"><div class="sec-head"><h2>${T('related')}</h2></div><div class="grid g3">${related.map((x) => postCard(x, lang)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: tr(p.title, lang), description: tr(p.excerpt, lang), body, active: '/blog', ogType: 'article', image: p.cover, jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: tr(p.title, lang), datePublished: p.published_at, author: { '@type': 'Person', name: p.author }, publisher: { '@type': 'Organization', name: b.settings.clinic_name } }] });
}

export async function faq(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const list = sorted(active(b.faqs));
  const cats = [...new Set(list.map((f) => f.category || 'Umum'))];
  const body = `${pageHead(T('faq'), lang === 'en' ? 'Answers to the questions we hear most.' : 'Jawaban atas pertanyaan yang paling sering diajukan.', [['', T('faq')]], lang)}
<section class="sec"><div class="wrap narrow">${cats.map((c) => `<h2 class="faq-cat reveal">${esc(c)}</h2>${faqList(list.filter((f) => (f.category || 'Umum') === c), lang)}`).join('')}
<div class="cta-band cta-soft"><div><h3>${lang === 'en' ? 'Still have questions?' : 'Masih ada pertanyaan?'}</h3><p>${lang === 'en' ? 'Our team is ready to help via WhatsApp.' : 'Tim kami siap membantu via WhatsApp.'}</p></div><a class="btn btn-primary" href="${waLink(b.settings.whatsapp)}" target="_blank" rel="noopener">${icon('message', '', 18)} WhatsApp</a></div></div></section>`;
  return respond(ctx, b, { lang, title: T('faq'), body, active: '/faq', jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: tr(f.question, lang), acceptedAnswer: { '@type': 'Answer', text: tr(f.answer, lang) } })) }] });
}

export async function contact(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const s = b.settings;
  const main = sorted(active(b.branches)).find((x) => x.is_main) || active(b.branches)[0];
  const body = `${pageHead(T('contactTitle'), T('contactText'), [['', T('contact')]], lang)}
<section class="sec"><div class="wrap split">
<div class="card form-card reveal"><h2>${lang === 'en' ? 'Send a message' : 'Kirim pesan'}</h2>
<form data-form="contact" class="form" novalidate><div class="form-grid"><label>${T('name')}<input name="name" required maxlength="120" autocomplete="name"></label><label>${T('phoneNo')}<input name="phone" type="tel" required maxlength="30" autocomplete="tel"></label></div>
<div class="form-grid"><label>Email<input name="email" type="email" maxlength="120" autocomplete="email"></label><label>${T('interest')}<select name="interest"><option>${lang === 'en' ? 'General question' : 'Pertanyaan umum'}</option><option>${lang === 'en' ? 'Booking' : 'Booking / jadwal'}</option><option>Medical Check-up</option><option>${lang === 'en' ? 'Corporate partnership' : 'Kerja sama korporat'}</option><option>${lang === 'en' ? 'Insurance' : 'Asuransi / BPJS'}</option><option>${lang === 'en' ? 'Complaint' : 'Keluhan layanan'}</option></select></label></div>
<label>${T('message')}<textarea name="message" rows="5" maxlength="3000"></textarea></label><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off"><input type="hidden" name="source" value="kontak">
<button class="btn btn-primary btn-lg" type="submit">${icon('send', '', 18)} ${T('send')}</button><p class="form-msg" role="status"></p></form></div>
<aside class="side"><div class="card side-card reveal"><h3>${esc(s.clinic_name)}</h3><p>${icon('map-pin', '', 16)} ${esc(s.address)}</p><p>${icon('phone', '', 16)} <a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></p><p>${icon('mail', '', 16)} <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p><p>${icon('clock', '', 16)} ${tx(s.hours, lang)}</p>
<a class="btn btn-primary btn-block" href="${waLink(s.whatsapp)}" target="_blank" rel="noopener">${icon('message', '', 18)} ${T('whatsapp')}</a></div>
${main?.maps_url ? `<div class="map reveal"><iframe src="${esc(main.maps_url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe></div>` : ''}</aside>
</div></section>
<section class="sec sec-alt"><div class="wrap"><div class="grid g3">${sorted(active(b.branches)).map((br) => branchCard(br, lang)).join('')}</div></div></section>`;
  return respond(ctx, b, { lang, title: T('contact'), body, active: '/kontak' });
}

const LEGAL = {
  'kebijakan-privasi': {
    id: ['Kebijakan Privasi', `Global Klinik berkomitmen melindungi data pribadi dan data kesehatan Anda sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi dan peraturan rekam medis yang berlaku.\n\n## Data yang kami kumpulkan\n\n- Identitas: nama, NIK, tanggal lahir, jenis kelamin, alamat, kontak\n- Data kesehatan: keluhan, riwayat, hasil pemeriksaan, diagnosis, resep, hasil laboratorium\n- Data transaksi: tagihan dan pembayaran\n- Data teknis: alamat IP dan log akses untuk keamanan\n\n## Penggunaan data\n\nData digunakan untuk pelayanan kesehatan, administrasi, penagihan, pengingat jadwal, pelaporan wajib (termasuk SATU SEHAT Kemenkes), serta peningkatan layanan.\n\n## Keamanan\n\nSeluruh koneksi terenkripsi (HTTPS), password disimpan dalam bentuk hash, akses dibatasi sesuai peran, tersedia autentikasi dua faktor, dan setiap akses ke rekam medis tercatat dalam audit log.\n\n## Hak Anda\n\nAnda berhak mengakses, memperbarui, dan meminta salinan data Anda melalui Portal Pasien atau dengan menghubungi kami.\n\n## Kontak\n\nPertanyaan terkait privasi dapat dikirim ke email resmi kami yang tercantum di halaman Kontak.`],
    en: ['Privacy Policy', `Global Klinik is committed to protecting your personal and health data in accordance with Indonesian Law No. 27/2022 on Personal Data Protection and medical record regulations.\n\n## Data we collect\n\n- Identity: name, national ID, date of birth, gender, address, contact\n- Health data: complaints, history, examinations, diagnoses, prescriptions, lab results\n- Transaction data: invoices and payments\n- Technical data: IP address and access logs for security\n\n## How we use data\n\nFor healthcare delivery, administration, billing, appointment reminders, mandatory reporting (including the Ministry of Health SATU SEHAT platform) and service improvement.\n\n## Security\n\nAll connections are encrypted (HTTPS), passwords are hashed, access is role-restricted, two-factor authentication is available and every medical-record access is audit-logged.\n\n## Your rights\n\nYou may access, update and request a copy of your data via the Patient Portal or by contacting us.`],
  },
  'syarat-ketentuan': {
    id: ['Syarat & Ketentuan', `Dengan menggunakan website dan aplikasi Global Klinik, Anda menyetujui ketentuan berikut.\n\n## Booking\n\n- Booking online bersifat reservasi slot waktu; mohon datang 15 menit lebih awal.\n- Reschedule/pembatalan dapat dilakukan melalui menu Cek Booking.\n- Keterlambatan lebih dari 15 menit dapat menyebabkan antrian dialihkan.\n\n## Telemedicine\n\nKonsultasi telemedicine tidak menggantikan penanganan gawat darurat. Dalam kondisi darurat hubungi 119 atau IGD terdekat.\n\n## Pembayaran\n\nHarga dapat berubah sewaktu-waktu. Tagihan final mengikuti tindakan dan obat yang diberikan. Refund diproses sesuai kebijakan klinik.\n\n## Informasi kesehatan\n\nArtikel di website bersifat edukatif dan bukan pengganti konsultasi dengan dokter.`],
    en: ['Terms & Conditions', `By using the Global Klinik website and app you agree to the following terms.\n\n## Booking\n\n- Online booking reserves a time slot; please arrive 15 minutes early.\n- Reschedule/cancellation is available via Check Booking.\n- Arriving more than 15 minutes late may cause your queue to be moved.\n\n## Telemedicine\n\nTelemedicine does not replace emergency care. In an emergency call 119 or visit the nearest ER.\n\n## Payment\n\nPrices may change. Final bills follow the procedures and medicines provided. Refunds follow clinic policy.\n\n## Health information\n\nArticles are educational and not a substitute for consulting a doctor.`],
  },
};

export async function legal(ctx, lang, slug) {
  const custom = await cmsPage(ctx, lang, slug, '/' + slug);
  if (custom) return custom;
  const b = await getBundle(ctx.env);
  const [ttl, text] = LEGAL[slug][lang === 'en' ? 'en' : 'id'];
  const body = `${pageHead(esc(ttl), '', [['', ttl]], lang)}<section class="sec"><div class="wrap narrow"><div class="prose">${markdown(text)}</div></div></section>`;
  return respond(ctx, b, { lang, title: ttl, body });
}

export async function bookingPage(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const steps = ['stepService', 'stepDoctor', 'stepTime', 'stepData', 'stepConfirm'];
  const body = `<section class="book-head"><div class="wrap"><h1>${T('bookDoctor')}</h1><p class="lead">${lang === 'en' ? 'Real-time availability. Instant confirmation.' : 'Ketersediaan real-time. Konfirmasi instan.'}</p>
<ol class="steps" data-steps>${steps.map((s, i) => `<li class="${i ? '' : 'on'}"><span>${i + 1}</span>${T(s)}</li>`).join('')}</ol></div></section>
<section class="sec sec-tight"><div class="wrap"><div class="book" id="booking-app" data-lang="${lang}"><div class="book-loading"><span class="spinner"></span></div></div></div></section>`;
  return respond(ctx, b, { lang, title: T('booking'), body, active: '/booking', data: { page: 'booking', days: Number(b.settings.booking_days_ahead) || 30 } });
}

export async function lookupPage(ctx, lang) {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const no = esc(ctx.url.searchParams.get('no') || '');
  const body = `${pageHead(T('checkBooking'), T('lookupTitle'), [['', T('checkBooking')]], lang)}
<section class="sec"><div class="wrap narrow"><div class="card form-card reveal"><form data-lookup class="form"><div class="form-grid"><label>${T('bookingNo')}<input name="booking_no" required value="${no}" placeholder="GK260927-XXXX" autocapitalize="characters"></label><label>${T('phoneNo')}<input name="phone" type="tel" required placeholder="08xxxxxxxxxx" autocomplete="tel"></label></div><button class="btn btn-primary btn-lg" type="submit">${icon('search', '', 18)} ${T('lookup')}</button><p class="form-msg" role="status"></p></form></div>
<div id="lookup-result"></div></div></section>`;
  return respond(ctx, b, { lang, title: T('checkBooking'), body, data: { page: 'lookup' }, noindex: true });
}

export async function queuePage(ctx) {
  const b = await getBundle(ctx.env);
  const br = ctx.url.searchParams.get('branch') || active(b.branches)[0]?.id;
  const branch = byId(b.branches, br);
  const body = `<div class="qd" data-branch="${esc(br)}">
<header class="qd-head"><div class="qd-brand">${logoMark(54, 'qd')}<div><b>${esc(b.settings.clinic_name)}</b><span>${esc(branch?.name || '')}</span></div></div>
<div class="qd-branches">${sorted(active(b.branches)).map((x) => `<a class="${x.id === br ? 'on' : ''}" href="/antrian?branch=${esc(x.id)}">${esc(x.city)}</a>`).join('')}</div>
<div class="qd-clock"><b data-clock>--:--</b><span data-date></span></div></header>
<main class="qd-main"><section class="qd-now"><span class="qd-label">SEDANG DIPANGGIL · NOW SERVING</span><div class="qd-num" data-now>—</div><div class="qd-poli" data-now-poli></div><div class="qd-doc" data-now-doc></div></section>
<section class="qd-polis" data-polis></section></main>
<footer class="qd-foot"><div class="qd-marquee"><span>${esc(tr(b.settings.tagline, 'id'))} · Booking online di ${esc(ctx.url.host)} · Pantau antrian dari HP Anda · ${esc(tr(b.settings.hours, 'id'))}</span></div><button class="qd-sound" data-sound>${icon('volume', '', 18)} Aktifkan suara</button></footer></div>`;
  return html(layout(ctx, b, { lang: 'id', title: 'Layar Antrian', body, bare: true, bodyClass: 'qd-body', noindex: true, data: { page: 'queue', branch: br } }));
}

export async function notFoundPage(ctx, lang = 'id') {
  const b = await getBundle(ctx.env);
  const T = tt(lang);
  const body = `<section class="nf"><div class="wrap narrow"><span class="nf-code">404</span><h1>${T('notFound')}</h1><p class="lead">${T('notFoundText')}</p><div class="row-btns"><a class="btn btn-primary" href="${L(lang, '/')}">${T('backHome')}</a><a class="btn btn-ghost" href="${L(lang, '/booking')}">${T('bookNow')}</a></div></div></section>`;
  return html(layout(ctx, b, { lang, title: T('notFound'), body, noindex: true }), 404);
}

export async function sitemap(ctx) {
  const b = await getBundle(ctx.env);
  const base = ctx.site;
  const paths = ['/', '/tentang', '/layanan', '/dokter', '/jadwal', '/fasilitas', '/cabang', '/booking', '/harga', '/promo', '/testimoni', '/blog', '/faq', '/kontak', '/kebijakan-privasi', '/syarat-ketentuan'];
  active(b.services).forEach((s) => paths.push('/layanan/' + s.slug));
  active(b.doctors).forEach((s) => paths.push('/dokter/' + s.slug));
  active(b.branches).forEach((s) => paths.push('/cabang/' + s.slug));
  active(b.promotions).forEach((s) => paths.push('/promo/' + s.slug));
  (b.posts || []).filter((p) => p.status !== 'draft').forEach((s) => paths.push('/blog/' + s.slug));
  (b.pages || []).filter((p) => p.status !== 'draft' && !['home', 'tentang', 'kebijakan-privasi', 'syarat-ketentuan'].includes(p.slug)).forEach((p) => paths.push('/p/' + p.slug));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${paths.map((p) => `<url><loc>${base}${p}</loc><xhtml:link rel="alternate" hreflang="id" href="${base}${p}"/><xhtml:link rel="alternate" hreflang="en" href="${base}${p === '/' ? '/en' : '/en' + p}"/><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export function robots(ctx) {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\nDisallow: /cek-booking\nSitemap: ${ctx.site}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}
