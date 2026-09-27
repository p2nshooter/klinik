// Admin: registry-driven CRUD (list + form) for every module, settings, media library, reports, system tools.
import { $, $$, B, ENT, L, S, T, active, api, badge, barChart, branchParam, byId, can, canAny, cell, confirmBox, debounce, drawer, emptyState, esc, exportCSV, exportXLSX, fail, fdate, fdt, fileUrl, hbars, icon, lineChart, loading, markdown, modal, money, num, openDoc, optLabel, optList, parseCSV, pickFile, refText, sorted, today, addDays, toast, tr, uploadFile, uploadMedia } from './lib.js';
import { ICONS } from '/assets/js/icons.js';

const SECTION = {
  identity: ['Identitas', 'Identity'], contact: ['Kontak & Alamat', 'Contact & Address'], guardian: ['Keluarga / Penanggung Jawab', 'Guardian'], medical: ['Data Medis', 'Medical'], payer: ['Penjamin & Asuransi', 'Payer & Insurance'], crm: ['CRM & Lainnya', 'CRM & Other'],
  social: ['Media Sosial', 'Social Media'], stamp: ['Stempel "Website Dijual"', '"For sale" stamp'], seo: ['SEO & Analitik', 'SEO & Analytics'], nav: ['Menu & Footer', 'Menu & Footer'], payment: ['Pembayaran & Invoice', 'Payment & Invoice'], booking: ['Booking & Loyalitas', 'Booking & Loyalty'], integration: ['Integrasi (WA, Email, SATU SEHAT)', 'Integrations'],
};
const FULL_TYPES = new Set(['textarea', 'markdown', 'items', 'blocks', 'perms', 'refs', 'json']);
const BLOCK_FIELDS = {
  hero: [['eyebrow', 'text', 1], ['title', 'text', 1, 'Judul (gunakan *teks* untuk aksen miring)'], ['text', 'textarea', 1], ['cta_label', 'text', 1], ['cta_href', 'text'], ['cta2_label', 'text', 1], ['cta2_href', 'text', 0, 'Isi "wa" untuk tombol WhatsApp'], ['image', 'image']],
  richtext: [['title', 'text', 1], ['text', 'markdown', 1]],
  image: [['image', 'image'], ['caption', 'text', 1]],
  cta: [['title', 'text', 1], ['text', 'textarea', 1], ['cta_label', 'text', 1], ['cta_href', 'text'], ['cta2_label', 'text', 1], ['cta2_href', 'text', 0, 'Isi "wa" untuk tombol WhatsApp']],
  stats: [['items', 'items', 0, '', [['value', 'text'], ['label', 'text', 1]]]],
  features: [['title', 'text', 1], ['text', 'textarea', 1], ['items', 'items', 0, '', [['icon', 'icon'], ['title', 'text', 1], ['text', 'text', 1]]]],
  services: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  doctors: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  promos: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  testimonials: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  faq: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  branches: [['title', 'text', 1], ['text', 'textarea', 1]],
  posts: [['title', 'text', 1], ['text', 'textarea', 1], ['limit', 'number']],
  pricing: [['title', 'text', 1], ['text', 'textarea', 1]],
  facilities: [['title', 'text', 1], ['text', 'textarea', 1]],
  gallery: [['title', 'text', 1], ['images', 'items', 0, '', [['url', 'image']]]],
  booking: [['title', 'text', 1], ['text', 'textarea', 1]],
};
const toField = ([key, type, i18n, help, columns]) => ({ key, type, label: [key.replace(/_/g, ' '), key.replace(/_/g, ' ')], i18n: !!i18n, help, columns: columns?.map(toField) });

// ================================================================== FIELD ENGINE
function isD1Ref(f) {
  return f.type === 'ref' && ENT(f.ref)?.store === 'd1';
}
function cmsOptions(ref) {
  const list = B()[ref] || [];
  const e = ENT(ref);
  const lf = e?.labelField || 'name';
  return sorted(list).map((it) => {
    let label = tr(it[lf]) || it.name || it.id;
    if (ref === 'schedules') label = `${byId(B().doctors, it.doctor_id)?.name || ''} · ${optLabel({ options: S.meta.options.day }, it.day)} ${it.start}-${it.end}`;
    return [it.id, label];
  });
}

function control(f, v, refs) {
  const dis = f.readonly ? 'disabled' : '';
  const val = v ?? '';
  const i18nWrap = (tag) => `<div class="i18n">${['id', 'en'].map((lg) => `<div><span>${lg.toUpperCase()}</span>${tag === 'input' ? `<input data-lang="${lg}" value="${esc(tr1(v, lg))}" ${dis}>` : `<textarea data-lang="${lg}" rows="${f.type === 'markdown' ? 6 : 3}" ${dis}>${esc(tr1(v, lg))}</textarea>`}</div>`).join('')}</div>`;
  if (f.i18n && ['text', 'textarea', 'markdown'].includes(f.type)) return i18nWrap(f.type === 'text' ? 'input' : 'textarea') + (f.type === 'markdown' ? `<button type="button" class="btn sm ghost" data-md-prev style="justify-self:start">${icon('eye', '', 14)} ${T('Pratinjau', 'Preview')}</button><div class="md-prev prose hide"></div>` : '');
  switch (f.type) {
    case 'textarea':
      return `<textarea data-in rows="3" ${dis}>${esc(val)}</textarea>`;
    case 'markdown':
      return `<textarea data-in rows="8" ${dis}>${esc(val)}</textarea><button type="button" class="btn sm ghost" data-md-prev style="justify-self:start">${icon('eye', '', 14)} ${T('Pratinjau', 'Preview')}</button><div class="md-prev prose hide"></div>`;
    case 'number':
    case 'money':
      return `<input data-in type="number" step="any" value="${esc(val)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${dis}>`;
    case 'date':
      return `<input data-in type="date" value="${esc(String(val).slice(0, 10))}" ${dis}>`;
    case 'time':
      return `<input data-in type="time" value="${esc(val)}" ${dis}>`;
    case 'datetime':
      return `<input type="text" value="${esc(fdt(val))}" disabled>`;
    case 'email':
      return `<input data-in type="email" value="${esc(val)}" ${dis}>`;
    case 'phone':
      return `<input data-in type="tel" value="${esc(val)}" ${dis}>`;
    case 'url':
      return `<input data-in type="url" value="${esc(val)}" placeholder="https://" ${dis}>`;
    case 'password':
      return `<input data-in type="password" autocomplete="new-password" placeholder="••••••••">`;
    case 'color':
      return `<input data-in type="color" value="${esc(val || '#0F766E')}" ${dis}>`;
    case 'select':
      return `<select data-in ${dis}><option value="">—</option>${optList(f).map((o) => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(S.lang === 'en' ? o[2] || o[1] : o[1])}</option>`).join('')}</select>`;
    case 'icon':
      return `<div class="row" style="flex-wrap:nowrap"><span data-ic-prev>${icon(val || 'star', '', 22)}</span><select data-in ${dis}>${Object.keys(ICONS).map((k) => `<option ${k === val ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`;
    case 'bool':
      return `<label class="switch"><input data-in type="checkbox" ${v ? 'checked' : ''} ${dis}><span>${v ? T('Ya', 'Yes') : T('Tidak', 'No')}</span></label>`;
    case 'tags':
      return `<input data-in value="${esc((v || []).join(', '))}" placeholder="tag1, tag2" ${dis}>`;
    case 'json':
      return `<textarea data-in rows="4" class="mono" ${dis}>${esc(v ? JSON.stringify(v, null, 2) : '')}</textarea>`;
    case 'ref':
      if (isD1Ref(f)) return `<div class="refpick"><div class="row" style="flex-wrap:nowrap"><input data-rp value="${esc(val ? refs?.[f.key]?.[val] || '#' + val : '')}" placeholder="${T('Ketik untuk mencari…', 'Type to search…')}" ${dis}>${!f.readonly ? `<button type="button" class="btn sm ghost" data-rp-clear title="Clear">${icon('x', '', 14)}</button>` : ''}${val && ['patients', 'visits', 'invoices'].includes(f.ref) ? `<a class="btn sm ghost" href="#/${f.ref === 'patients' ? 'patients/' + val : f.ref === 'visits' ? 'exam/' + val : 'cashier/' + val}" title="Buka">${icon('external', '', 14)}</a>` : ''}</div><div class="pop hide"></div></div>`;
      return `<select data-in ${dis}><option value="">—</option>${cmsOptions(f.ref).map(([id, l]) => `<option value="${esc(id)}" ${String(id) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    case 'refs':
      return `<div class="checks">${cmsOptions(f.ref).map(([id, l]) => `<label><input type="checkbox" data-refs value="${esc(id)}" ${(v || []).includes(id) ? 'checked' : ''} ${dis}> ${esc(l)}</label>`).join('')}</div>`;
    case 'image':
      return `<div class="img-field"><div class="prev" style="${v ? `background-image:url('${esc(v)}')` : ''}">${v ? '' : icon('image', '', 22)}</div><div class="ctl"><input data-in value="${esc(val)}" placeholder="https://… atau /media/…" ${dis}><div class="row"><button type="button" class="btn sm" data-upload>${icon('upload', '', 14)} Upload</button><button type="button" class="btn sm ghost" data-library>${icon('image', '', 14)} ${T('Pustaka media', 'Media library')}</button></div></div></div>`;
    case 'file':
      return `<div class="row">${v ? `<a class="btn sm" href="${fileUrl(v)}" target="_blank" rel="noopener">${icon('paperclip', '', 14)} ${esc(String(v).split('/').pop().slice(17) || 'file')}</a>` : `<span class="muted small">${T('Belum ada file', 'No file')}</span>`}${!f.readonly ? `<button type="button" class="btn sm primary" data-fupload>${icon('upload', '', 14)} Upload</button>` : ''}</div>`;
    case 'items':
      return `<div data-items></div>`;
    case 'blocks':
      return `<div data-blocks></div>`;
    case 'perms':
      return `<div data-perms></div>`;
    default:
      return `<input data-in type="text" value="${esc(val)}" ${dis}>`;
  }
}
const tr1 = (v, lg) => (v && typeof v === 'object' ? v[lg] ?? '' : lg === 'id' ? v ?? '' : '');

function fieldHtml(f, v, refs) {
  const full = f.width === 'full' || FULL_TYPES.has(f.type) || (f.i18n && f.type !== 'text');
  const label = typeof f.label === 'string' ? f.label : L(f.label);
  const tag = ['items', 'blocks', 'perms', 'refs', 'image', 'file', 'bool', 'icon'].includes(f.type) || f.i18n || (f.type === 'ref' && isD1Ref(f)) ? 'div' : 'label';
  return `<div class="f-wrap ${full ? 'full' : ''}" style="${full ? 'grid-column:1/-1' : ''}" data-field="${esc(f.key)}"><${tag} class="f"><span class="${f.required ? 'req' : ''}">${esc(label)}</span>${control(f, v, refs)}${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}</${tag}></div>`;
}

function parseVal(f, raw) {
  if (['number', 'money'].includes(f.type)) return raw === '' ? null : Number(raw);
  if (f.type === 'tags') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return raw;
}

/** Render + wire fields into `box`, mutating `obj` as the user edits. */
export function mountFields(box, fields, obj, { refs = {}, cols = 2 } = {}) {
  box.innerHTML = `<div class="form-grid ${cols === 3 ? 'g3' : ''}">${fields.map((f) => fieldHtml(f, obj[f.key], refs)).join('')}</div>`;
  for (const f of fields) {
    const w = box.querySelector(`:scope > .form-grid > [data-field="${CSS.escape(f.key)}"]`);
    if (w) wireField(w, f, obj, refs);
  }
}

function wireField(w, f, obj, refs) {
  const k = f.key;
  if (f.i18n && ['text', 'textarea', 'markdown'].includes(f.type)) {
    const cur = obj[k] && typeof obj[k] === 'object' ? obj[k] : { id: obj[k] || '', en: '' };
    obj[k] = cur;
    w.querySelectorAll('[data-lang]').forEach((i) => i.addEventListener('input', () => (obj[k] = { ...obj[k], [i.dataset.lang]: i.value })));
  }
  const inp = w.querySelector(':scope [data-in]');
  if (inp && !(f.i18n && ['text', 'textarea', 'markdown'].includes(f.type))) {
    inp.addEventListener(f.type === 'bool' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (f.type === 'bool') {
        obj[k] = inp.checked;
        inp.nextElementSibling.textContent = inp.checked ? T('Ya', 'Yes') : T('Tidak', 'No');
      } else if (f.type === 'json') {
        try { obj[k] = inp.value.trim() ? JSON.parse(inp.value) : null; inp.style.borderColor = ''; } catch { inp.style.borderColor = 'var(--bad)'; }
      } else obj[k] = parseVal(f, inp.value);
      if (f.type === 'icon') w.querySelector('[data-ic-prev]').innerHTML = icon(inp.value, '', 22);
      if (f.type === 'image') {
        const p = w.querySelector('.prev');
        p.style.backgroundImage = inp.value ? `url('${inp.value}')` : '';
        p.innerHTML = inp.value ? '' : icon('image', '', 22);
      }
    });
  }
  const mdb = w.querySelector('[data-md-prev]');
  if (mdb) mdb.onclick = () => {
    const pv = w.querySelector('.md-prev');
    pv.classList.toggle('hide');
    const src = f.i18n ? tr1(obj[k], S.lang) || tr1(obj[k], 'id') : obj[k];
    pv.innerHTML = markdown(src || '');
  };
  if (f.type === 'refs') w.querySelectorAll('[data-refs]').forEach((c) => c.addEventListener('change', () => (obj[k] = [...w.querySelectorAll('[data-refs]:checked')].map((x) => x.value))));
  if (f.type === 'image') {
    const setUrl = (u) => {
      const i = w.querySelector('[data-in]');
      i.value = u;
      i.dispatchEvent(new Event('input'));
    };
    w.querySelector('[data-upload]')?.addEventListener('click', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      try { setUrl((await uploadMedia(file)).url); toast(T('Gambar diunggah ke R2', 'Image uploaded to R2')); } catch (e) { fail(e); }
    });
    w.querySelector('[data-library]')?.addEventListener('click', () => mediaPicker(setUrl));
  }
  if (f.type === 'file') w.querySelector('[data-fupload]')?.addEventListener('click', async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const r = await uploadFile(file);
      obj[k] = r.key;
      w.querySelector('.row').innerHTML = `<span class="badge ok">${icon('check', '', 12)} ${esc(r.name)}</span>`;
      toast(T('File diunggah (privat)', 'File uploaded (private)'));
    } catch (e) { fail(e); }
  });
  if (f.type === 'ref' && isD1Ref(f)) wireRefPick(w, f, obj, refs);
  if (f.type === 'items') mountItems(w.querySelector('[data-items]'), f, obj, refs);
  if (f.type === 'blocks') mountBlocks(w.querySelector('[data-blocks]'), obj, k);
  if (f.type === 'perms') mountPerms(w.querySelector('[data-perms]'), obj, k);
}

function wireRefPick(w, f, obj, refs, onPick) {
  const inp = w.querySelector('[data-rp]');
  const pop = w.querySelector('.pop');
  if (!inp) return;
  const target = ENT(f.ref);
  const search = debounce(async () => {
    const qv = inp.value.trim();
    try {
      const url = f.ref === 'patients' ? `/api/clinic/patients/search?q=${encodeURIComponent(qv)}` : f.ref === 'medicines' ? `/api/pharmacy/search?q=${encodeURIComponent(qv)}&branch=${branchParam()}` : `/api/crud/${f.ref}?q=${encodeURIComponent(qv)}&limit=10`;
      const { rows } = await api(url);
      pop.innerHTML = rows.length ? rows.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r[target.labelField] ?? r.name ?? r.id)}</b> <span class="muted small">${esc([r[target.labelExtra], r.mrn, r.phone, r.stock !== undefined ? 'stok ' + r.stock : ''].filter(Boolean).join(' · '))}</span></button>`).join('') : `<div class="empty small">${T('Tidak ditemukan', 'Not found')}</div>`;
      pop.classList.remove('hide');
      pop.querySelectorAll('[data-i]').forEach((b) => (b.onmousedown = (e) => {
        e.preventDefault();
        const r = rows[b.dataset.i];
        obj[f.key] = r.id;
        inp.value = `${r[target.labelField] ?? r.name}${r[target.labelExtra] ? ' · ' + r[target.labelExtra] : r.mrn ? ' · ' + r.mrn : ''}`;
        pop.classList.add('hide');
        onPick && onPick(r);
      }));
    } catch (e) { fail(e); }
  }, 250);
  inp.addEventListener('input', search);
  inp.addEventListener('focus', () => inp.value.length === 0 && search());
  inp.addEventListener('blur', () => setTimeout(() => pop.classList.add('hide'), 200));
  w.querySelector('[data-rp-clear]')?.addEventListener('click', () => { obj[f.key] = null; inp.value = ''; });
}

// ---------------------------------------------------------------- items (sub-table) editor
function mountItems(box, f, obj, refs) {
  obj[f.key] = Array.isArray(obj[f.key]) ? obj[f.key] : [];
  const rows = obj[f.key];
  const cols = f.columns || [];
  const draw = () => {
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl items-tbl"><thead><tr>${cols.map((c) => `<th>${esc(typeof c.label === 'string' ? c.label : L(c.label))}${c.i18n ? ' (ID/EN)' : ''}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr data-row="${i}">${cols.map((c) => `<td data-col="${c.key}" style="min-width:${c.type === 'ref' || c.type === 'text' ? 150 : c.type === 'image' ? 220 : 90}px">${itemCell(c, r[c.key], r)}</td>`).join('')}<td class="act"><button type="button" class="btn sm ghost" data-up="${i}" title="Up">${icon('chevron-down', '', 14).replace('m6 9 6 6 6-6', 'm18 15-6-6-6 6')}</button><button type="button" class="btn sm ghost danger" data-del="${i}">${icon('trash', '', 14)}</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="muted center small">${T('Belum ada baris', 'No rows')}</td></tr>`}</tbody></table></div><button type="button" class="btn sm" data-add style="margin-top:8px">${icon('plus', '', 14)} ${T('Tambah baris', 'Add row')}</button>${f.key === 'items' && rows.some((r) => r.price !== undefined && r.qty !== undefined) ? `<div class="right small" style="margin-top:6px">${T('Subtotal', 'Subtotal')}: <b>${money(rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.price) || 0) - (Number(r.discount) || 0), 0))}</b></div>` : ''}`;
    box.querySelector('[data-add]').onclick = () => { rows.push({}); draw(); };
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { rows.splice(+b.dataset.del, 1); draw(); }));
    box.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }));
    box.querySelectorAll('tr[data-row]').forEach((tr) => {
      const r = rows[+tr.dataset.row];
      cols.forEach((c) => {
        const td = tr.querySelector(`[data-col="${c.key}"]`);
        if (c.type === 'ref' && isD1Ref(c)) {
          td.innerHTML = `<div class="refpick"><input data-rp value="${esc(r.name && c.key.endsWith('_id') ? r.name : r[c.key] ? '#' + r[c.key] : '')}" placeholder="${T('Cari…', 'Search…')}"><div class="pop hide"></div></div>`;
          wireRefPick(td, c, r, refs, (picked) => {
            if ('name' in r || cols.some((x) => x.key === 'name')) r.name = `${picked.name}${picked.strength ? ' ' + picked.strength : ''}`;
            if (picked.price_sell !== undefined && cols.some((x) => x.key === 'price' || x.key === 'cost')) { if (cols.some((x) => x.key === 'price')) r.price = picked.price_sell; }
            if (picked.unit_name && cols.some((x) => x.key === 'unit')) r.unit = picked.unit_name;
            draw();
          });
          return;
        }
        if (c.type === 'image') {
          td.querySelector('[data-img-up]')?.addEventListener('click', async () => { const file = await pickFile('image/*'); if (file) { try { r[c.key] = (await uploadMedia(file)).url; draw(); } catch (e) { fail(e); } } });
        }
        td.querySelectorAll('input,select,textarea').forEach((inp) => inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
          if (c.i18n) r[c.key] = { ...(typeof r[c.key] === 'object' ? r[c.key] : { id: r[c.key] || '' }), [inp.dataset.lang]: inp.value };
          else if (c.type === 'bool') r[c.key] = inp.checked;
          else r[c.key] = parseVal(c, inp.value);
          if (c.type === 'ref' && !isD1Ref(c)) {
            const it = byId(B()[c.ref], inp.value);
            if (it) {
              if (cols.some((x) => x.key === 'name')) r.name = it.name && typeof it.name === 'object' ? tr(it.name) : it.name;
              if (c.ref === 'lab_tests') Object.assign(r, { unit: it.unit, ref: it.ref_text || (it.ref_low != null ? `${it.ref_low} – ${it.ref_high}` : ''), price: it.price });
              if (c.ref === 'procedures') r.price = it.price;
              draw();
            }
          }
        }));
      });
    });
  };
  draw();
}
function itemCell(c, v, r) {
  if (c.i18n) return ['id', 'en'].map((lg) => `<input data-lang="${lg}" value="${esc(tr1(v, lg))}" placeholder="${lg.toUpperCase()}" style="margin-bottom:3px">`).join('');
  switch (c.type) {
    case 'number': case 'money': return `<input type="number" step="any" value="${esc(v ?? '')}">`;
    case 'bool': return `<input type="checkbox" ${v ? 'checked' : ''}>`;
    case 'date': return `<input type="date" value="${esc(v ?? '')}">`;
    case 'select': return `<select><option value="">—</option>${optList(c).map((o) => `<option value="${esc(o[0])}" ${String(o[0]) === String(v ?? '') ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    case 'icon': return `<select>${Object.keys(ICONS).map((k) => `<option ${k === v ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
    case 'image': return `<div class="row" style="flex-wrap:nowrap">${v ? `<img src="${esc(v)}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">` : ''}<input value="${esc(v ?? '')}" placeholder="URL"><button type="button" class="btn sm" data-img-up>${icon('upload', '', 14)}</button></div>`;
    case 'ref': return isD1Ref(c) ? '' : `<select><option value="">—</option>${cmsOptions(c.ref).map(([id, l]) => `<option value="${esc(id)}" ${String(id) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    default: return `<input value="${esc(v ?? '')}">`;
  }
}

// ---------------------------------------------------------------- page blocks editor
function mountBlocks(box, obj, k) {
  obj[k] = Array.isArray(obj[k]) ? obj[k] : [];
  const list = obj[k];
  const types = S.meta.blockTypes;
  const draw = () => {
    box.innerHTML = `${list.map((b, i) => `<section class="block-ed" data-b="${i}"><header>${icon('layout', '', 16)}<b>${i + 1}. ${esc(L((types.find((t) => t[0] === b.type) || [b.type, b.type]).slice(1)))}</b><button type="button" class="btn sm ghost" data-mv="${i}:-1">↑</button><button type="button" class="btn sm ghost" data-mv="${i}:1">↓</button><button type="button" class="btn sm ghost" data-col="${i}">${icon('chevron-down', '', 14)}</button><button type="button" class="btn sm ghost danger" data-rm="${i}">${icon('trash', '', 14)}</button></header><div data-bf class="${b._open ? '' : 'hide'}"></div></section>`).join('')}
    <div class="row" style="margin-top:8px"><select data-newtype style="width:auto">${types.map((t) => `<option value="${t[0]}">${esc(L(t.slice(1)))}</option>`).join('')}</select><button type="button" class="btn sm primary" data-addb>${icon('plus', '', 14)} ${T('Tambah blok', 'Add block')}</button></div>`;
    list.forEach((b, i) => {
      const sec = box.querySelector(`[data-b="${i}"]`);
      if (b._open) mountFields(sec.querySelector('[data-bf]'), (BLOCK_FIELDS[b.type] || []).map(toField), b);
      sec.querySelector(`[data-col="${i}"]`).onclick = () => { b._open = !b._open; draw(); };
      sec.querySelector(`[data-rm="${i}"]`).onclick = async () => { if (await confirmBox(T('Hapus blok ini?', 'Remove this block?'), { danger: true })) { list.splice(i, 1); draw(); } };
      sec.querySelectorAll('[data-mv]').forEach((m) => (m.onclick = () => { const [a, d] = m.dataset.mv.split(':').map(Number); const j = a + d; if (j >= 0 && j < list.length) { [list[a], list[j]] = [list[j], list[a]]; draw(); } }));
    });
    box.querySelector('[data-addb]').onclick = () => { list.push({ type: box.querySelector('[data-newtype]').value, _open: true }); draw(); };
  };
  draw();
}

// ---------------------------------------------------------------- permission matrix
function mountPerms(box, obj, k) {
  obj[k] = Array.isArray(obj[k]) ? obj[k] : [];
  const ACTS = [['view', 'Lihat', 'View'], ['create', 'Tambah', 'Create'], ['update', 'Ubah', 'Edit'], ['delete', 'Hapus', 'Delete'], ['export', 'Ekspor', 'Export']];
  const ents = Object.entries(S.meta.entities).filter(([, e]) => !e.readonly || true);
  const has = (p) => {
    const perms = obj[k];
    const [ent, act] = p.split(':');
    const m = (x) => x === '*' || x === p || x === `${ent}:*` || x === `*:${act}`;
    if (perms.some((x) => x.startsWith('!') && m(x.slice(1)))) return false;
    return perms.some((x) => !x.startsWith('!') && m(x));
  };
  const draw = () => {
    const full = obj[k].includes('*');
    const extra = obj[k].filter((p) => p.startsWith('!') || p.startsWith('*:'));
    box.innerHTML = `<label class="switch" style="margin-bottom:10px"><input type="checkbox" data-full ${full ? 'checked' : ''}><span><b>${T('Akses penuh (semua modul)', 'Full access (all modules)')}</b></span></label>
    <div class="tbl-wrap" style="max-height:420px"><table class="tbl perm-tbl"><thead><tr><th>${T('Modul', 'Module')}</th>${ACTS.map((a) => `<th>${L(a.slice(1))}</th>`).join('')}</tr></thead><tbody>${S.meta.groups.map(([g, gid, gen]) => {
      const rows = ents.filter(([, e]) => e.group === g);
      return rows.length ? `<tr><td colspan="6" style="background:var(--surface2);font-weight:800;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase">${esc(S.lang === 'en' ? gen : gid)}</td></tr>` + rows.map(([n, e]) => `<tr><td>${esc(L(e.label))}</td>${ACTS.map(([a]) => `<td><input type="checkbox" data-p="${n}:${a}" ${has(`${n}:${a}`) ? 'checked' : ''} ${full ? 'disabled' : ''}></td>`).join('')}</tr>`).join('') : '';
    }).join('')}</tbody></table></div>
    <h3 style="margin-top:14px">${T('Fitur khusus', 'Special features')}</h3><div class="checks">${S.meta.specialPerms.map(([p, id, en]) => `<label><input type="checkbox" data-p="${p}" ${has(p) ? 'checked' : ''} ${full ? 'disabled' : ''}> ${esc(S.lang === 'en' ? en : id)}</label>`).join('')}</div>
    <label class="f" style="margin-top:12px">${T('Aturan tambahan (lanjutan)', 'Advanced rules')}<input data-extra value="${esc(extra.join(', '))}" placeholder="*:view, !system:backup"><span class="help">${T('Wildcard (*:view = lihat semua) dan pengecualian (!modul:aksi).', 'Wildcards (*:view) and denials (!module:action).')}</span></label>`;
    box.querySelector('[data-full]').onchange = (e) => { obj[k] = e.target.checked ? ['*', ...obj[k].filter((p) => p.startsWith('!'))] : obj[k].filter((p) => p !== '*'); draw(); };
    box.querySelectorAll('[data-p]').forEach((c) => (c.onchange = () => {
      const extraNow = box.querySelector('[data-extra]').value.split(',').map((s) => s.trim()).filter(Boolean);
      obj[k] = [...extraNow, ...[...box.querySelectorAll('[data-p]:checked')].map((x) => x.dataset.p)];
    }));
    box.querySelector('[data-extra]').onchange = (e) => {
      const extraNow = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      obj[k] = [...(obj[k].includes('*') ? ['*'] : []), ...extraNow, ...[...box.querySelectorAll('[data-p]:checked:not(:disabled)')].map((x) => x.dataset.p)];
      draw();
    };
  };
  draw();
}

// ---------------------------------------------------------------- media picker
export async function mediaPicker(onPick) {
  const m = modal({ title: T('Pustaka media (R2)', 'Media library (R2)'), size: 'wide', body: `<div class="drop" data-drop>${icon('upload', '', 26)}<div>${T('Klik atau seret gambar ke sini untuk upload', 'Click or drop images to upload')}</div></div><div class="media-grid" data-grid style="margin-top:14px">${loading()}</div>` });
  const grid = m.el.querySelector('[data-grid]');
  const load = async () => {
    const { rows } = await api('/api/media');
    grid.innerHTML = rows.map((r) => `<figure><img src="${esc(r.url)}" data-u="${esc(r.url)}" alt="" loading="lazy"><figcaption><span class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span></figcaption></figure>`).join('') || emptyState(T('Belum ada media', 'No media yet'), 'image');
    grid.querySelectorAll('[data-u]').forEach((i) => (i.onclick = () => { onPick(i.dataset.u); m.close(); }));
  };
  const drop = m.el.querySelector('[data-drop]');
  const up = async (files) => {
    for (const f of files) { try { await uploadMedia(f); } catch (e) { fail(e); } }
    load();
  };
  drop.onclick = async () => { const f = await pickFile('image/*'); if (f) up([f]); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); up([...e.dataTransfer.files]); };
  load().catch(fail);
}

// ================================================================== QUICK ACTIONS per entity
export function quickActions(name, row) {
  const a = [];
  const pdf = (url, label, ic = 'download') => a.push(`<button class="btn sm ghost" data-open="${url}" title="${esc(label)}">${icon(ic, '', 15)}</button>`);
  switch (name) {
    case 'patients':
      a.push(`<a class="btn sm ghost" href="#/patients/${row.id}" title="${T('Riwayat lengkap', 'Full history')}">${icon('clipboard', '', 15)}</a>`);
      pdf(`/api/docs/card/${row.id}`, T('Kartu pasien', 'Patient card'), 'id-card');
      break;
    case 'visits':
      a.push(`<a class="btn sm ghost" href="#/exam/${row.id}" title="${T('Pemeriksaan', 'Examine')}">${icon('stethoscope', '', 15)}</a>`);
      pdf(`/api/docs/slip/${row.id}`, T('Bukti daftar', 'Slip'), 'ticket');
      pdf(`/api/docs/record/${row.id}`, T('Resume medis', 'Summary'));
      break;
    case 'medical_records': pdf(`/api/docs/record/${row.visit_id}`, T('Resume medis', 'Summary')); break;
    case 'invoices':
      a.push(`<a class="btn sm ghost" href="#/cashier/${row.id}" title="${T('Buka di kasir', 'Open in cashier')}">${icon('wallet', '', 15)}</a>`);
      pdf(`/api/docs/invoice/${row.id}`, 'Invoice PDF');
      break;
    case 'payments': pdf(`/api/docs/receipt/${row.id}`, T('Kwitansi', 'Receipt'), 'receipt'); break;
    case 'lab_orders': pdf(`/api/docs/lab/${row.id}`, T('Hasil lab', 'Lab result')); break;
    case 'prescriptions': pdf(`/api/docs/prescription/${row.id}`, T('Resep', 'Prescription')); break;
    case 'appointments': pdf(`/api/public/booking/${row.booking_no}/pdf`, T('Bukti booking', 'Booking slip'), 'ticket'); break;
    case 'documents': if (row.file) a.push(`<a class="btn sm ghost" href="${fileUrl(row.file)}" target="_blank" rel="noopener">${icon('paperclip', '', 15)}</a>`); break;
    case 'notif_log': if (row.link) a.push(`<a class="btn sm ghost" href="${esc(row.link)}" target="_blank" rel="noopener" title="Kirim via WhatsApp">${icon('message', '', 15)}</a>`); break;
    case 'purchase_orders': if (row.status !== 'received' && row.status !== 'cancelled' && can('pharmacy:stock')) a.push(`<button class="btn sm ghost" data-po-recv="${row.id}" title="${T('Terima barang', 'Receive')}">${icon('truck', '', 15)}</button>`); break;
  }
  return a.join('');
}
document.addEventListener('click', async (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { e.stopPropagation(); openDoc(o.dataset.open); return; }
  const r = e.target.closest('[data-po-recv]');
  if (r) {
    e.stopPropagation();
    if (!(await confirmBox(T('Terima semua item PO ini ke stok? Pastikan No. batch & tanggal kedaluwarsa sudah diisi.', 'Receive all PO items into stock?')))) return;
    try { await api(`/api/pharmacy/po/${r.dataset.poRecv}/receive`, { method: 'POST', body: {} }); toast(T('Barang diterima & stok bertambah', 'Received')); location.hash = location.hash; window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (err) { fail(err); }
  }
});

// ================================================================== LIST
export async function list(ctx) {
  const name = ctx.params.entity;
  const e = ENT(name);
  if (!e) throw new Error(T('Modul tidak dikenal', 'Unknown module'));
  if (e.single) { location.replace('#/settings'); return; }
  const grp = S.meta.groups.find((g) => g[0] === e.group);
  ctx.title(L(e.label), grp ? (S.lang === 'en' ? grp[2] : grp[1]) : '');
  const cols = e.fields.filter((f) => f.list && !f.hidden).slice(0, 8);
  const st = { q: ctx.query.q || '', page: 1, sort: e.store === 'cms' ? 'order' : 'id', dir: e.store === 'cms' ? 'asc' : 'desc', filters: {}, from: ctx.query.from || '', to: ctx.query.to || '' };
  for (const [k, v] of Object.entries(ctx.query)) if (k.startsWith('f_')) st.filters[k.slice(2)] = v;
  const filterFields = e.fields.filter((f) => f.filter);
  const canCreate = can(`${name}:create`) && !e.readonly && !e.noCreate;
  ctx.el.innerHTML = `<div class="toolbar">
    ${e.fields.some((f) => f.search) ? `<div class="search">${icon('search', '', 16)}<input type="search" data-q placeholder="${T('Cari…', 'Search…')}" value="${esc(st.q)}"></div>` : ''}
    ${filterFields.map((f) => `<select data-filter="${f.key}"><option value="">${esc(L(f.label))}: ${T('semua', 'all')}</option>${(f.type === 'ref' ? cmsOptions(f.ref) : optList(f).map((o) => [o[0], S.lang === 'en' ? o[2] || o[1] : o[1]])).map(([v, l]) => `<option value="${esc(v)}" ${st.filters[f.key] === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
    ${e.dateField ? `<input type="date" data-from value="${st.from}" title="${T('Dari', 'From')}"><input type="date" data-to value="${st.to}" title="${T('Sampai', 'To')}">` : ''}
    <span class="grow"></span>
    <button class="btn" data-refresh title="Refresh">${icon('refresh', '', 16)}</button>
    ${can(`${name}:export`) ? `<button class="btn" data-xlsx>${icon('download', '', 16)} Excel</button><button class="btn" data-csv>${icon('download', '', 16)} CSV</button>` : ''}
    ${canCreate ? `<button class="btn" data-import>${icon('upload', '', 16)} ${T('Impor', 'Import')}</button><a class="btn primary" href="#/data/${name}/new">${icon('plus', '', 16)} ${T('Tambah', 'Add')}</a>` : ''}
  </div><div data-table>${loading()}</div>`;
  const tbl = ctx.el.querySelector('[data-table]');
  let cmsAll = null;

  const load = async () => {
    let rows, hasMore = false, refs = {};
    if (e.store === 'cms') {
      if (!cmsAll) cmsAll = (await api(`/api/crud/${name}`)).rows;
      const qv = st.q.toLowerCase();
      rows = cmsAll.filter((r) => (!qv || e.fields.filter((f) => f.search).some((f) => JSON.stringify(r[f.key] ?? '').toLowerCase().includes(qv))) && Object.entries(st.filters).every(([k, v]) => !v || String(r[k]) === v || (Array.isArray(r[k]) && r[k].includes(v))));
      rows.sort((a, b) => { const x = a[st.sort] ?? '', y = b[st.sort] ?? ''; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(tr(x)).localeCompare(String(tr(y))); return st.dir === 'asc' ? c : -c; });
      const total = rows.length;
      hasMore = total > st.page * 50;
      rows = rows.slice((st.page - 1) * 50, st.page * 50);
      st.total = total;
    } else {
      const p = new URLSearchParams({ page: st.page, limit: 25, sort: st.sort, dir: st.dir });
      if (st.q) p.set('q', st.q);
      if (st.from) p.set('from', st.from);
      if (st.to) p.set('to', st.to);
      for (const [k, v] of Object.entries(st.filters)) if (v) p.set('f_' + k, v);
      const r = await api(`/api/crud/${name}?${p}`);
      rows = r.rows;
      hasMore = r.hasMore;
      refs = r.refs || {};
    }
    if (ctx.stale()) return;
    tbl.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((f) => `<th class="sortable ${['money', 'number'].includes(f.type) ? 'num' : ''}" data-sort="${f.key}">${esc(L(f.label))} ${st.sort === f.key ? (st.dir === 'asc' ? '↑' : '↓') : ''}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r) => `<tr class="click" data-id="${esc(r.id)}">${cols.map((f) => `<td class="${['money', 'number'].includes(f.type) ? 'num' : ''}">${cell(f, r, refs)}</td>`).join('')}<td class="act">${quickActions(name, r)}${can(`${name}:update`) && !e.readonly ? `<a class="btn sm ghost" href="#/data/${name}/${encodeURIComponent(r.id)}" title="Edit">${icon('edit', '', 15)}</a>` : `<a class="btn sm ghost" href="#/data/${name}/${encodeURIComponent(r.id)}">${icon('eye', '', 15)}</a>`}${can(`${name}:delete`) && !e.readonly && !r.system ? `<button class="btn sm ghost danger" data-del="${esc(r.id)}" title="${T('Hapus', 'Delete')}">${icon('trash', '', 15)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>${e.store === 'cms' ? `${num(st.total)} ${T('data', 'records')}` : `${T('Halaman', 'Page')} ${st.page}`}</span><span class="btn-group"><button class="btn sm" data-prev ${st.page <= 1 ? 'disabled' : ''}>${icon('chevron-left', '', 14)} ${T('Sebelumnya', 'Prev')}</button><button class="btn sm" data-next ${hasMore ? '' : 'disabled'}>${T('Berikutnya', 'Next')} ${icon('chevron-right', '', 14)}</button></span></div>` : `<div class="card">${emptyState(st.q || Object.values(st.filters).some(Boolean) ? T('Tidak ada data yang cocok', 'No matching records') : T('Belum ada data. Klik "Tambah" untuk membuat data pertama.', 'No records yet.'), e.icon || 'inbox')}</div>`;
    tbl.querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', (ev) => { if (ev.target.closest('button,a')) return; location.hash = `#/data/${name}/${encodeURIComponent(tr.dataset.id)}`; }));
    tbl.querySelectorAll('[data-sort]').forEach((th) => (th.onclick = () => { st.dir = st.sort === th.dataset.sort && st.dir === 'desc' ? 'asc' : 'desc'; st.sort = th.dataset.sort; load(); }));
    tbl.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async (ev) => {
      ev.stopPropagation();
      if (!(await confirmBox(T('Hapus data ini? Tindakan tidak dapat dibatalkan.', 'Delete this record? This cannot be undone.'), { danger: true, okLabel: T('Hapus', 'Delete') }))) return;
      try { await api(`/api/crud/${name}/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); toast(T('Data dihapus', 'Deleted')); cmsAll = null; await reloadMeta(e); load(); } catch (err) { fail(err); }
    }));
    tbl.querySelector('[data-prev]')?.addEventListener('click', () => { st.page--; load(); });
    tbl.querySelector('[data-next]')?.addEventListener('click', () => { st.page++; load(); });
  };
  const qi = ctx.el.querySelector('[data-q]');
  if (qi) qi.oninput = debounce(() => { st.q = qi.value.trim(); st.page = 1; load().catch(fail); }, 300);
  ctx.el.querySelectorAll('[data-filter]').forEach((s) => (s.onchange = () => { st.filters[s.dataset.filter] = s.value; st.page = 1; load().catch(fail); }));
  ctx.el.querySelector('[data-from]')?.addEventListener('change', (ev) => { st.from = ev.target.value; st.page = 1; load().catch(fail); });
  ctx.el.querySelector('[data-to]')?.addEventListener('change', (ev) => { st.to = ev.target.value; st.page = 1; load().catch(fail); });
  ctx.el.querySelector('[data-refresh]').onclick = () => { cmsAll = null; load().catch(fail); };
  const exp = async (kind) => {
    try {
      const p = new URLSearchParams();
      if (st.q) p.set('q', st.q);
      if (st.from) p.set('from', st.from);
      if (st.to) p.set('to', st.to);
      for (const [k, v] of Object.entries(st.filters)) if (v) p.set('f_' + k, v);
      const r = await api(`/api/crud/${name}/export?${p}`);
      const fields = e.fields.filter((f) => !f.hidden && !['password', 'blocks', 'perms', 'json'].includes(f.type));
      const xcols = [{ key: 'id', label: 'ID' }, ...fields.map((f) => ({ key: f.key, label: L(f.label), type: f.type, get: (row) => exportVal(f, row, r.refs) }))];
      const fn = `${name}-${today()}`;
      kind === 'csv' ? exportCSV(r.rows, xcols, fn) : exportXLSX(r.rows, xcols, fn, L(e.label));
      toast(`${r.rows.length} ${T('baris diekspor', 'rows exported')}`);
    } catch (err) { fail(err); }
  };
  ctx.el.querySelector('[data-xlsx]')?.addEventListener('click', () => exp('xlsx'));
  ctx.el.querySelector('[data-csv]')?.addEventListener('click', () => exp('csv'));
  ctx.el.querySelector('[data-import]')?.addEventListener('click', () => importDialog(name, e, () => { cmsAll = null; load(); }));
  await load();
}

function exportVal(f, row, refs) {
  const v = row[f.key];
  if (v === null || v === undefined) return '';
  if (f.type === 'ref') return refText(f, v, refs);
  if (f.type === 'refs') return (v || []).map((x) => refText({ ...f, type: 'ref' }, x, refs)).join(', ');
  if (f.type === 'select') return optLabel(f, v);
  if (f.type === 'bool') return v ? 'Ya' : 'Tidak';
  if (f.type === 'items') return (v || []).map((i) => [i.name, i.qty, i.price].filter((x) => x !== undefined).join(' x ')).join('; ');
  if (f.type === 'tags') return (v || []).join(', ');
  if (typeof v === 'object') return tr(v);
  return v;
}

function importDialog(name, e, done) {
  const fields = e.fields.filter((f) => !f.hidden && !f.readonly && !['items', 'blocks', 'perms', 'json', 'file'].includes(f.type));
  const m = modal({
    title: `${T('Impor data', 'Import data')} — ${esc(L(e.label))}`, size: 'wide',
    body: `<p class="muted">${T('Unggah file CSV (Excel → Simpan sebagai CSV). Baris pertama berisi judul kolom sesuai kunci atau label di bawah. Maksimal 1000 baris.', 'Upload a CSV file. First row = column headers (keys or labels). Max 1000 rows.')}</p>
    <div class="tbl-wrap" style="max-height:220px"><table class="tbl"><thead><tr><th>${T('Kunci', 'Key')}</th><th>Label</th><th>${T('Wajib', 'Required')}</th></tr></thead><tbody>${fields.map((f) => `<tr><td class="mono">${f.key}</td><td>${esc(L(f.label))}</td><td>${f.required ? '✓' : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:12px"><button class="btn" data-tpl>${icon('download', '', 16)} ${T('Unduh template CSV', 'Download CSV template')}</button><button class="btn primary" data-pick>${icon('upload', '', 16)} ${T('Pilih file CSV', 'Choose CSV file')}</button></div><div data-res style="margin-top:12px"></div>`,
  });
  m.el.querySelector('[data-tpl]').onclick = () => exportCSV([], fields.map((f) => ({ key: f.key, label: f.key })), `template-${name}`);
  m.el.querySelector('[data-pick]').onclick = async () => {
    const file = await pickFile('.csv,text/csv');
    if (!file) return;
    const raw = parseCSV(await file.text());
    const byLabel = Object.fromEntries(fields.map((f) => [L(f.label).toLowerCase(), f]));
    const rows = raw.map((r) => {
      const o = {};
      for (const [h, v] of Object.entries(r)) {
        const f = fields.find((x) => x.key === h) || byLabel[h.toLowerCase()];
        if (!f || v === '') continue;
        o[f.key] = f.type === 'bool' ? /^(1|ya|yes|true)$/i.test(v) : f.type === 'refs' || f.type === 'tags' ? v.split(',').map((s) => s.trim()) : f.i18n ? { id: v, en: v } : v;
      }
      return o;
    });
    try {
      const res = await api(`/api/crud/${name}/import`, { method: 'POST', body: { rows } });
      m.el.querySelector('[data-res]').innerHTML = `<div class="alert ${res.errors.length ? 'warn' : 'ok'}">${res.ok} ${T('baris berhasil diimpor', 'rows imported')}${res.errors.length ? `<br>${res.errors.map(esc).join('<br>')}` : ''}</div>`;
      done();
    } catch (err) { fail(err); }
  };
}

async function reloadMeta(e) {
  if (e.store === 'cms') S.meta = await api('/api/meta');
}

// ================================================================== FORM
export async function form(ctx) {
  const name = ctx.params.entity;
  const e = ENT(name);
  if (!e) throw new Error(T('Modul tidak dikenal', 'Unknown module'));
  const id = ctx.params.id;
  const isNew = !id;
  let row = {}, refs = {};
  if (!isNew) ({ row, refs = {} } = await api(`/api/crud/${name}/${encodeURIComponent(id)}`));
  else {
    for (const f of e.fields) if (f.default !== undefined) row[f.key] = structuredClone(f.default);
    for (const [k, v] of Object.entries(ctx.query)) if (e.fields.some((f) => f.key === k)) row[k] = v;
    if (e.branch && branchParam()) row[e.branch] ??= branchParam();
    if (e.dateField === 'date') row.date ??= today();
  }
  const canEdit = isNew ? can(`${name}:create`) : can(`${name}:update`) && !e.readonly;
  const titleText = isNew ? `${T('Tambah', 'New')} ${L(e.label)}` : `${L(e.label)} · ${tr(row[e.labelField]) || row.name || row.id}`;
  ctx.title(titleText, L(e.label));
  const data = structuredClone(row);
  const fields = e.fields.filter((f) => !f.hidden && !f.secret && !(isNew && f.readonly)).map((f) => (canEdit ? f : { ...f, readonly: true }));
  const sections = [];
  for (const f of fields) {
    const s = f.section || '_';
    let sec = sections.find((x) => x.id === s);
    if (!sec) sections.push((sec = { id: s, fields: [] }));
    sec.fields.push(f);
  }
  ctx.el.innerHTML = `<div class="row-between" style="margin-bottom:14px"><a class="btn ghost" href="#/data/${name}">${icon('arrow-left', '', 16)} ${T('Kembali ke daftar', 'Back to list')}</a><div class="btn-group">${!isNew ? quickActions(name, row) : ''}</div></div>
  ${name === 'users' && !isNew ? `<div class="alert" style="margin-bottom:14px">${icon('info', '', 18)} ${T('Kosongkan password bila tidak ingin mengganti. Mengganti password/peran akan mengeluarkan sesi aktif pengguna.', 'Leave password empty to keep it.')}</div>` : ''}
  <form data-form novalidate>${sections.map((s) => `<div class="card form-sec">${s.id !== '_' ? `<h3>${esc(L(SECTION[s.id] || [s.id, s.id]))}</h3>` : ''}<div data-sec="${s.id}"></div></div>`).join('')}
  ${!isNew ? `<p class="muted tiny">ID: <span class="mono">${esc(row.id)}</span>${row.created_at ? ` · ${T('Dibuat', 'Created')} ${fdt(row.created_at)}` : ''}${row.updated_at ? ` · ${T('Diubah', 'Updated')} ${fdt(row.updated_at)}` : ''}</p>` : ''}
  <div class="form-actions">${!isNew && can(`${name}:delete`) && !e.readonly && !row.system ? `<button type="button" class="btn danger" data-delete>${icon('trash', '', 16)} ${T('Hapus', 'Delete')}</button><span class="grow"></span>` : ''}<a class="btn" href="#/data/${name}">${T('Batal', 'Cancel')}</a>${canEdit ? `<button type="button" class="btn" data-save-stay>${icon('check', '', 16)} ${T('Simpan', 'Save')}</button><button type="submit" class="btn primary">${icon('check', '', 16)} ${T('Simpan & kembali', 'Save & back')}</button>` : ''}</div></form>`;
  for (const s of sections) mountFields(ctx.el.querySelector(`[data-sec="${s.id}"]`), s.fields, data, { refs });
  const f = ctx.el.querySelector('[data-form]');
  const save = async (back) => {
    const payload = {};
    for (const fl of fields) if (!fl.readonly && data[fl.key] !== undefined) payload[fl.key] = data[fl.key];
    if (payload.blocks) payload.blocks = payload.blocks.map(({ _open, ...b }) => b);
    for (const fl of fields) if (fl.required && !fl.readonly && (payload[fl.key] === undefined || payload[fl.key] === null || payload[fl.key] === '' || (fl.i18n && !payload[fl.key]?.id && !payload[fl.key]?.en))) return toast(`${L(fl.label)} ${T('wajib diisi', 'is required')}`, 'bad');
    try {
      const r = isNew ? await api(`/api/crud/${name}`, { method: 'POST', body: payload }) : await api(`/api/crud/${name}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
      toast(T('Tersimpan', 'Saved'));
      await reloadMeta(e);
      if (back) location.hash = `#/data/${name}`;
      else if (isNew) location.hash = `#/data/${name}/${encodeURIComponent(r.row.id)}`;
      else ctx.refresh();
    } catch (err) { fail(err); }
  };
  f.onsubmit = (ev) => { ev.preventDefault(); save(true); };
  f.querySelector('[data-save-stay]')?.addEventListener('click', () => save(false));
  f.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!(await confirmBox(T('Hapus data ini?', 'Delete this record?'), { danger: true, okLabel: T('Hapus', 'Delete') }))) return;
    try { await api(`/api/crud/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast(T('Data dihapus', 'Deleted')); await reloadMeta(e); location.hash = `#/data/${name}`; } catch (err) { fail(err); }
  });
}

// ================================================================== SETTINGS
export async function settings(ctx) {
  ctx.title(T('Pengaturan Klinik', 'Clinic Settings'), T('Sistem', 'System'));
  const e = ENT('settings');
  const { row } = await api('/api/crud/settings');
  const data = structuredClone(row);
  const secs = [...new Set(e.fields.map((f) => f.section))];
  ctx.el.innerHTML = `<div class="tabs" data-tabs>${secs.map((s, i) => `<button type="button" class="${i ? '' : 'on'}" data-t="${s}">${esc(L(SECTION[s] || [s, s]))}</button>`).join('')}</div>
  ${secs.map((s, i) => `<div class="card form-sec ${i ? 'hide' : ''}" data-p="${s}"><div data-sec></div>${s === 'integration' ? `<div class="card-f"><div class="alert">${icon('info', '', 18)} ${T('Token rahasia (WA_TOKEN, RESEND_API_KEY, MIDTRANS_SERVER_KEY, SATUSEHAT_CLIENT_ID/SECRET) disimpan sebagai Secret Worker di Cloudflare, bukan di sini.', 'Secret tokens are stored as Cloudflare Worker secrets.')}</div><div class="row" style="margin-top:10px"><button type="button" class="btn" data-test-notif>${icon('send', '', 16)} ${T('Tes notifikasi', 'Test notification')}</button></div></div>` : ''}${s === 'stamp' ? `<div class="card-f"><a class="btn" href="/" target="_blank">${icon('eye', '', 16)} ${T('Lihat beranda', 'View homepage')}</a></div>` : ''}</div>`).join('')}
  <div class="form-actions"><button type="button" class="btn" data-rebuild>${icon('refresh', '', 16)} ${T('Bangun ulang cache website', 'Rebuild website cache')}</button><button class="btn primary" data-save>${icon('check', '', 16)} ${T('Simpan pengaturan', 'Save settings')}</button></div>`;
  for (const s of secs) mountFields(ctx.el.querySelector(`[data-p="${s}"] [data-sec]`), e.fields.filter((f) => f.section === s), data);
  ctx.el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
    ctx.el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
    ctx.el.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('hide', p.dataset.p !== b.dataset.t));
  }));
  ctx.el.querySelector('[data-save]').onclick = async () => {
    try { await api('/api/crud/settings/main', { method: 'PUT', body: data }); S.meta = await api('/api/meta'); toast(T('Pengaturan tersimpan. Website diperbarui.', 'Settings saved. Website updated.')); } catch (err) { fail(err); }
  };
  ctx.el.querySelector('[data-rebuild]').onclick = async () => { try { await api('/api/system/rebuild-cache', { method: 'POST' }); toast(T('Cache website dibangun ulang', 'Website cache rebuilt')); } catch (err) { fail(err); } };
  ctx.el.querySelector('[data-test-notif]')?.addEventListener('click', () => {
    modal({ title: T('Tes notifikasi', 'Test notification'), body: `<div class="stack"><label class="f">No. WhatsApp<input data-ph placeholder="08…"></label><label class="f">Email<input data-em type="email"></label></div>`, actions: [{ label: T('Batal', 'Cancel') }, { label: T('Kirim', 'Send'), cls: 'primary', onClick: async (el) => {
      const r = await api('/api/system/notify-test', { method: 'POST', body: { phone: el.querySelector('[data-ph]').value, email: el.querySelector('[data-em]').value } });
      const wa = r.logs.find((l) => l[0] === 'whatsapp');
      if (wa?.[3]) window.open(wa[3], '_blank');
      toast(r.logs.map((l) => `${l[0]}: ${l[2]}`).join(' · ') || T('Tidak ada kanal aktif', 'No active channel'));
    } }] });
  });
}

// ================================================================== MEDIA
export async function media(ctx) {
  ctx.title(T('Media (Cloudflare R2)', 'Media (Cloudflare R2)'), T('Sistem', 'System'));
  ctx.el.innerHTML = `<div class="card"><div class="drop" data-drop>${icon('upload', '', 30)}<div><b>${T('Klik atau seret gambar ke sini', 'Click or drop images here')}</b></div><div class="small">PNG, JPG, WEBP, SVG, GIF · maks 10 MB · ${T('disimpan di R2 & dilayani via CDN', 'stored in R2 and served via CDN')}</div></div></div><div class="media-grid" data-grid style="margin-top:16px">${loading()}</div><div class="center" style="margin-top:14px"><button class="btn hide" data-more>${T('Muat lagi', 'Load more')}</button></div>`;
  const grid = ctx.el.querySelector('[data-grid]');
  let cursor = null;
  const load = async (append) => {
    const r = await api('/api/media' + (append && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''));
    cursor = r.cursor;
    const html = r.rows.map((m) => `<figure><img src="${esc(m.url)}" alt="" loading="lazy" data-view="${esc(m.url)}"><figcaption><span class="small" title="${esc(m.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px">${esc(m.name)}</span><span class="btn-group"><button class="btn sm ghost" data-copy="${esc(location.origin + m.url)}" title="Copy URL">${icon('copy', '', 14)}</button><button class="btn sm ghost danger" data-rm="${esc(m.key)}">${icon('trash', '', 14)}</button></span></figcaption></figure>`).join('');
    grid.innerHTML = append ? grid.innerHTML + html : html || emptyState(T('Belum ada media', 'No media yet'), 'image');
    ctx.el.querySelector('[data-more]').classList.toggle('hide', !cursor);
  };
  grid.addEventListener('click', async (ev) => {
    const c = ev.target.closest('[data-copy]');
    if (c) { navigator.clipboard?.writeText(c.dataset.copy); toast(T('URL disalin', 'URL copied')); }
    const r = ev.target.closest('[data-rm]');
    if (r && (await confirmBox(T('Hapus gambar ini dari R2? Halaman yang memakainya akan kehilangan gambar.', 'Delete this image from R2?'), { danger: true }))) {
      try { await api('/api/media?key=' + encodeURIComponent(r.dataset.rm), { method: 'DELETE' }); load(); } catch (err) { fail(err); }
    }
    const v = ev.target.closest('[data-view]');
    if (v) window.open(v.dataset.view, '_blank');
  });
  const drop = ctx.el.querySelector('[data-drop]');
  const up = async (files) => { for (const f of files) { try { await uploadMedia(f); toast(`${f.name} ${T('diunggah', 'uploaded')}`); } catch (err) { fail(err); } } load(); };
  drop.onclick = async () => { const f = await pickFile('image/*'); if (f) up([f]); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); up([...e.dataTransfer.files]); };
  ctx.el.querySelector('[data-more]').onclick = () => load(true);
  await load();
}

// ================================================================== REPORTS
const REPORT_ICONS = { visits: 'clipboard', patients: 'users', doctors: 'doctor', polis: 'grid', diagnoses: 'heart', procedures: 'activity', medicines: 'pill', stock: 'box', inventory: 'repeat', sales: 'cart', payments: 'wallet', revenue: 'banknote', lab: 'flask', appointments: 'calendar-check', claims: 'shield' };
export async function reports(ctx) {
  ctx.title(T('Laporan & Analitik', 'Reports & Analytics'));
  const { rows } = await api('/api/reports');
  ctx.el.innerHTML = `<div class="grid g4">${rows.map((r) => `<a class="kpi" href="#/reports/${r.id}"><span class="ico">${icon(REPORT_ICONS[r.id] || 'chart', '', 18)}</span><span class="lbl">${T('Laporan', 'Report')}</span><span style="font-weight:700;font-size:1rem;padding-right:40px">${esc(r.title.replace(/^Laporan /, ''))}</span><span class="sub">${T('Excel · CSV · PDF', 'Excel · CSV · PDF')}</span></a>`).join('')}</div>`;
}

export async function report(ctx) {
  const type = ctx.params.type;
  const st = { from: ctx.query.from || addDays(today(), -29), to: ctx.query.to || today(), branch: branchParam() };
  ctx.el.innerHTML = `<div class="toolbar"><a class="btn ghost" href="#/reports">${icon('arrow-left', '', 16)}</a><label class="row small">${T('Dari', 'From')} <input type="date" data-from value="${st.from}"></label><label class="row small">${T('Sampai', 'To')} <input type="date" data-to value="${st.to}"></label>
  <div class="chips">${[[7, '7H'], [30, '30H'], [90, '90H'], [365, '1TH']].map(([d, l]) => `<button class="chip" data-range="${d}">${l}</button>`).join('')}</div><span class="grow"></span>
  ${can('reports:export') ? `<button class="btn" data-xlsx>${icon('download', '', 16)} Excel</button><button class="btn" data-csv>${icon('download', '', 16)} CSV</button><button class="btn" data-pdf>${icon('file', '', 16)} PDF</button>` : ''}</div><div data-out>${loading()}</div>`;
  const out = ctx.el.querySelector('[data-out]');
  let last;
  const run = async () => {
    const p = new URLSearchParams({ from: st.from, to: st.to });
    if (st.branch) p.set('branch', st.branch);
    last = await api(`/api/reports/${type}?${p}`);
    ctx.title(last.title, `${fdate(last.from)} – ${fdate(last.to)} · ${st.branch ? B().branches?.find((b) => b.id === st.branch)?.name : T('Semua cabang', 'All branches')}`);
    const isMoney = (k) => last.columns.find((c) => c.key === k)?.type === 'money';
    const chartVal = last.chart && last.chart.length ? (last.chart.length > 20 || /^\d{4}-/.test(String(last.chart[0].label)) ? lineChart(last.chart.map((d) => ({ label: /^\d{4}-/.test(d.label) ? fdate(d.label).slice(0, 6) : d.label, value: d.value })), { labelEvery: Math.ceil(last.chart.length / 8) }) : hbars(last.chart.map((d) => ({ label: String(d.label ?? '-'), value: d.value })), { fmt: (v) => (Object.values(last.totals || {}).length && isMoney('amount') ? money(v) : num(v)) })) : '';
    out.innerHTML = `${chartVal ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${esc(last.title)}</h3><span class="muted small">${num(last.rows.length)} ${T('baris', 'rows')}</span></div>${chartVal}</div>` : ''}
    <div class="tbl-wrap"><table class="tbl"><thead><tr>${last.columns.map((c) => `<th class="${c.type ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${last.rows.slice(0, 1000).map((r) => `<tr>${last.columns.map((c) => `<td class="${c.type ? 'num' : ''}">${c.type === 'money' ? money(r[c.key]) : c.type === 'number' ? num(r[c.key]) : /date/.test(c.key) || c.key === 'date' ? fdate(r[c.key]) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${last.columns.length}">${emptyState(T('Tidak ada data pada periode ini', 'No data for this period'), 'chart')}</td></tr>`}</tbody>${last.totals ? `<tfoot><tr>${last.columns.map((c, i) => `<td class="${c.type ? 'num' : ''}">${i === 0 ? 'TOTAL' : last.totals[c.key] !== undefined ? (c.type === 'money' ? money(last.totals[c.key]) : num(last.totals[c.key])) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>${last.rows.length > 1000 ? `<p class="muted small">${T('Menampilkan 1000 baris pertama. Ekspor untuk data lengkap.', 'Showing first 1000 rows. Export for full data.')}</p>` : ''}${last.note ? `<p class="muted small">${esc(last.note)}</p>` : ''}`;
  };
  const rerun = () => run().catch(fail);
  ctx.el.querySelector('[data-from]').onchange = (e) => { st.from = e.target.value; rerun(); };
  ctx.el.querySelector('[data-to]').onchange = (e) => { st.to = e.target.value; rerun(); };
  ctx.el.querySelectorAll('[data-range]').forEach((b) => (b.onclick = () => { st.to = today(); st.from = addDays(st.to, -(+b.dataset.range - 1)); ctx.el.querySelector('[data-from]').value = st.from; ctx.el.querySelector('[data-to]').value = st.to; rerun(); }));
  const cols = () => last.columns.map((c) => ({ ...c, get: (r) => r[c.key] }));
  ctx.el.querySelector('[data-xlsx]')?.addEventListener('click', () => last && exportXLSX(last.rows, cols(), `${type}-${st.from}-${st.to}`, last.title.slice(0, 30)));
  ctx.el.querySelector('[data-csv]')?.addEventListener('click', () => last && exportCSV(last.rows, cols(), `${type}-${st.from}-${st.to}`));
  ctx.el.querySelector('[data-pdf]')?.addEventListener('click', () => openDoc(`/api/reports/${type}?from=${st.from}&to=${st.to}${st.branch ? '&branch=' + st.branch : ''}&format=pdf`));
  await run();
}

// ================================================================== SYSTEM
export async function system(ctx) {
  ctx.title(T('Sistem, Backup & Integrasi', 'System, Backup & Integrations'), T('Sistem', 'System'));
  const [stat, backups] = await Promise.all([api('/api/system/status'), can('system:backup') ? api('/api/system/backups') : Promise.resolve({ rows: [] })]);
  const flag = (b) => (b ? `<span class="badge ok">${icon('check', '', 12)} ${T('Aktif', 'Active')}</span>` : `<span class="badge warn">${T('Belum diatur', 'Not set')}</span>`);
  ctx.el.innerHTML = `<div class="grid g4" style="margin-bottom:16px">
    ${['d1', 'kv', 'r2'].map((k) => `<div class="kpi"><span class="ico">${icon(k === 'd1' ? 'database' : k === 'kv' ? 'zap' : 'cloud', '', 18)}</span><span class="lbl">${k.toUpperCase()} ${T('latensi', 'latency')}</span><span class="val">${esc(stat.latency_ms[k])} ms</span><span class="sub">${esc(k === 'd1' ? stat.storage.d1 : k === 'kv' ? stat.storage.kv.join(', ') : stat.storage.r2)}</span></div>`).join('')}
    <div class="kpi"><span class="ico">${icon('shield', '', 18)}</span><span class="lbl">${T('Versi', 'Version')}</span><span class="val">${esc(stat.version)}</span><span class="sub">bundle ${esc(stat.bundle_ver)}</span></div></div>
  <div class="grid g2">
  <div class="card"><div class="card-h"><h2>${icon('database', '', 20)} Backup & Restore</h2>${can('system:backup') ? `<div class="btn-group"><button class="btn" data-bk-inc>${T('Backup inkremental', 'Incremental backup')}</button><button class="btn primary" data-bk-full>${icon('download', '', 16)} ${T('Backup penuh', 'Full backup')}</button></div>` : ''}</div>
  <p class="muted small">${T('Backup otomatis setiap hari 00:30 WIB (inkremental) ke R2. D1 juga memiliki Time Travel 30 hari untuk pemulihan bencana.', 'Automatic daily incremental backups to R2 at 00:30 WIB. D1 Time Travel keeps 30 days.')}</p>
  ${stat.backup ? `<div class="alert ok" style="margin-bottom:10px">${icon('check-circle', '', 18)} ${T('Backup terakhir', 'Last backup')}: ${fdt(stat.backup.at)} · ${esc(stat.backup.type)} · ${num(stat.backup.rows)} ${T('baris', 'rows')}</div>` : ''}
  <div class="tbl-wrap" style="max-height:340px"><table class="tbl"><thead><tr><th>Backup</th><th class="num">${T('Ukuran', 'Size')}</th><th></th></tr></thead><tbody>${backups.rows.map((b) => `<tr><td><b class="mono small">${esc(b.prefix.replace('backups/', ''))}</b><div class="tiny muted">${b.files.length} file</div></td><td class="num">${(b.size / 1024).toFixed(1)} KB</td><td class="act"><button class="btn sm ghost" data-files="${esc(b.prefix)}">${icon('list', '', 14)}</button>${S.user.role === 'superadmin' ? `<button class="btn sm ghost danger" data-restore="${esc(b.prefix)}">${icon('rotate', '', 14)} Restore</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="3">${emptyState(T('Belum ada backup', 'No backups yet'), 'database')}</td></tr>`}</tbody></table></div></div>
  <div class="card"><div class="card-h"><h2>${icon('zap', '', 20)} ${T('Integrasi', 'Integrations')}</h2></div>
  <dl class="kv"><dt>WhatsApp gateway</dt><dd>${flag(stat.integrations.whatsapp)}</dd><dt>Email (Resend)</dt><dd>${flag(stat.integrations.resend)}</dd><dt>SMS</dt><dd>${flag(stat.integrations.sms)}</dd><dt>Midtrans</dt><dd>${flag(stat.integrations.midtrans)}</dd><dt>SATU SEHAT</dt><dd>${flag(stat.integrations.satusehat)}</dd></dl>
  <p class="muted small" style="margin-top:12px">${T('Tanpa gateway WA, sistem membuat tombol kirim 1-klik (wa.me) di Log Notifikasi.', 'Without a WA gateway, one-click wa.me links are generated in the Notification Log.')}</p>
  <div class="card-f btn-group"><button class="btn" data-rebuild>${icon('refresh', '', 16)} ${T('Bangun ulang cache', 'Rebuild cache')}</button><a class="btn" href="#/data/notif_log">${icon('bell', '', 16)} ${T('Log notifikasi', 'Notification log')}</a><a class="btn" href="#/data/audit_logs">${icon('list', '', 16)} Audit log</a></div></div>
  <div class="card"><div class="card-h"><h2>${icon('refresh', '', 20)} SATU SEHAT (FHIR R4)</h2><a class="btn sm" href="#/data/satusehat_sync">${T('Antrean sinkron', 'Sync queue')}</a></div>
  <p class="muted small">${T('Pemetaan Patient, Practitioner, Encounter, Condition, Observation, MedicationRequest & DiagnosticReport. Aktifkan di Pengaturan → Integrasi, lalu isi secret SATUSEHAT_CLIENT_ID & SATUSEHAT_CLIENT_SECRET.', 'Maps FHIR resources. Enable in Settings → Integrations and set Worker secrets.')}</p>
  <div class="row"><input data-ssid placeholder="${T('ID kunjungan', 'Visit ID')}" style="width:140px"><button class="btn" data-ss-prev>${icon('eye', '', 16)} ${T('Pratinjau FHIR', 'Preview FHIR')}</button>${can('system:satusehat') ? `<button class="btn primary" data-ss-run>${icon('send', '', 16)} ${T('Kirim antrean', 'Send queue')}</button>` : ''}</div></div>
  <div class="card"><div class="card-h"><h2>${icon('cloud', '', 20)} ${T('Infrastruktur', 'Infrastructure')}</h2></div><dl class="kv"><dt>Hosting</dt><dd>Cloudflare Workers (edge)</dd><dt>Database</dt><dd>D1 · ${esc(stat.storage.d1)}</dd><dt>Cache & sesi</dt><dd>KV · ${esc(stat.storage.kv.join(', '))}</dd><dt>File & PDF</dt><dd>R2 · ${esc(stat.storage.r2)}</dd><dt>Cron</dt><dd>${T('Tiap jam (pengingat, SATU SEHAT), harian 00:30 WIB (backup)', 'Hourly & daily')}</dd><dt>${T('Waktu server', 'Server time')}</dt><dd>${fdt(stat.time)}</dd></dl></div></div>`;
  const el = ctx.el;
  const bk = (full) => async () => {
    toast(T('Backup berjalan…', 'Backup running…'));
    try { const r = await api('/api/system/backup', { method: 'POST', body: { full } }); toast(`${T('Backup selesai', 'Backup done')}: ${r.prefix}`); ctx.refresh(); } catch (e) { fail(e); }
  };
  el.querySelector('[data-bk-full]')?.addEventListener('click', bk(true));
  el.querySelector('[data-bk-inc]')?.addEventListener('click', bk(false));
  el.querySelectorAll('[data-files]').forEach((b) => (b.onclick = () => {
    const set = backups.rows.find((x) => x.prefix === b.dataset.files);
    drawer({ title: set.prefix.replace('backups/', ''), body: `<div class="stack">${set.files.map((f) => `<a class="btn" href="/api/system/backups/file?key=${encodeURIComponent(f.key)}">${icon('download', '', 16)} ${esc(f.name)} <span class="muted small">${(f.size / 1024).toFixed(1)} KB</span></a>`).join('')}</div>` });
  }));
  el.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => {
    const txt = await confirmBox(T('Restore akan menimpa data yang sama dengan isi backup ini. Ketik RESTORE untuk melanjutkan.', 'Restore overwrites matching records. Type RESTORE to continue.'), { danger: true, input: 'Konfirmasi', okLabel: 'Restore' });
    if (txt !== 'RESTORE') return txt && toast(T('Konfirmasi tidak sesuai', 'Confirmation mismatch'), 'bad');
    try { const r = await api('/api/system/restore', { method: 'POST', body: { prefix: b.dataset.restore, confirm: 'RESTORE', cms: true } }); toast(`Restore OK: ${Object.entries(r.result).map(([k, v]) => `${k}=${v}`).join(', ')}`); } catch (e) { fail(e); }
  }));
  el.querySelector('[data-rebuild]').onclick = async () => { try { await api('/api/system/rebuild-cache', { method: 'POST' }); toast(T('Cache dibangun ulang', 'Cache rebuilt')); } catch (e) { fail(e); } };
  el.querySelector('[data-ss-prev]').onclick = async () => {
    try { const j = await api(`/api/satusehat/preview/encounter/${encodeURIComponent(el.querySelector('[data-ssid]').value)}`); modal({ title: 'FHIR Bundle (preview)', size: 'wide', body: `<pre class="prose" style="max-height:60vh;overflow:auto;font-size:.78rem">${esc(JSON.stringify(j, null, 2))}</pre>` }); } catch (e) { fail(e); }
  };
  el.querySelector('[data-ss-run]')?.addEventListener('click', async () => { try { const r = await api('/api/satusehat/run', { method: 'POST' }); toast(r.skipped ? T('SATU SEHAT belum diaktifkan di Pengaturan', 'SATU SEHAT disabled') : `Terkirim ${r.sent}, gagal ${r.failed}`); } catch (e) { fail(e); } });
}
