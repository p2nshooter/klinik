// CMS store: R2 is the source of truth (strongly consistent, conditional writes by ETag),
// KV holds a compact "bundle" of every collection for the public site (0 D1 reads per page view),
// heavy fields (long markdown, page blocks) are served per item from KV (lazy-filled from R2).
import { ENTITIES } from '../schema/entities.js';
import { SEED } from '../seed/content.js';
import { conflict, notFound, rid, slugify } from './util.js';

export const CMS_NAMES = Object.keys(ENTITIES).filter((n) => ENTITIES[n].store === 'cms');
const HEAVY = Object.fromEntries(CMS_NAMES.map((n) => [n, ENTITIES[n].fields.filter((f) => f.heavy).map((f) => f.key)]));
const BUNDLE_KEY = 'cms:bundle';
const MEM_TTL = 15_000;
const mem = { bundle: null, at: 0, items: new Map() };
const JSON_META = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };

const r2key = (name) => `cms/${name}.json`;
const empty = (name) => (ENTITIES[name].single ? {} : []);

export async function readCollection(env, name) {
  if (!ENTITIES[name] || ENTITIES[name].store !== 'cms') throw notFound('Koleksi tidak dikenal');
  const obj = await env.R2.get(r2key(name));
  if (obj) {
    let data = await obj.json();
    if (ENTITIES[name].single) data = { ...(SEED[name] || {}), ...data };
    return { data, etag: obj.etag };
  }
  // first boot: seed from defaults
  const seed = structuredClone(SEED[name] ?? empty(name));
  const put = await env.R2.put(r2key(name), JSON.stringify(seed), JSON_META);
  return { data: seed, etag: put.etag };
}

/** Atomically modify a collection. `mutate(data)` returns the new data (sync or async). */
export async function writeCollection(env, name, mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readCollection(env, name);
    const next = await mutate(structuredClone(cur.data));
    const res = await env.R2.put(r2key(name), JSON.stringify(next), { ...JSON_META, onlyIf: { etagMatches: cur.etag } });
    if (res) {
      await rebuildBundle(env);
      return next;
    }
  }
  throw conflict('Data sedang diubah pengguna lain, silakan coba lagi');
}

function stripHeavy(name, data) {
  const heavy = HEAVY[name];
  if (!heavy?.length || !Array.isArray(data)) return data;
  return data.map((it) => {
    const o = { ...it };
    for (const k of heavy) delete o[k];
    return o;
  });
}

export async function rebuildBundle(env) {
  const bundle = { ver: Date.now() };
  await Promise.all(
    CMS_NAMES.map(async (n) => {
      const { data } = await readCollection(env, n);
      bundle[n] = stripHeavy(n, data);
    })
  );
  await env.KV.put(BUNDLE_KEY, JSON.stringify(bundle));
  mem.bundle = bundle;
  mem.at = Date.now();
  mem.items.clear();
  return bundle;
}

export async function getBundle(env) {
  if (mem.bundle && Date.now() - mem.at < MEM_TTL) return mem.bundle;
  let b = await env.KV.get(BUNDLE_KEY, { type: 'json' });
  if (!b) b = await rebuildBundle(env);
  mem.bundle = b;
  mem.at = Date.now();
  return b;
}

/** Heavy fields for one item (e.g. article body). KV first, R2 fallback, then cached back to KV. */
export async function getHeavy(env, name, id) {
  const heavy = HEAVY[name];
  if (!heavy?.length) return {};
  const key = `cms:item:${name}:${id}`;
  const m = mem.items.get(key);
  if (m && Date.now() - m.at < MEM_TTL) return m.v;
  let v = await env.KV.get(key, { type: 'json' });
  if (!v) {
    const { data } = await readCollection(env, name);
    const it = data.find((x) => x.id === id);
    v = {};
    if (it) for (const k of heavy) v[k] = it[k];
    await env.KV.put(key, JSON.stringify(v), { expirationTtl: 86400 * 30 });
  }
  mem.items.set(key, { v, at: Date.now() });
  return v;
}

async function dropHeavy(env, name, id) {
  if (HEAVY[name]?.length) await env.KV.delete(`cms:item:${name}:${id}`);
}

// ---------- CRUD used by the generic API ----------
export async function cmsList(env, name, { full = false } = {}) {
  const { data } = await readCollection(env, name);
  return full ? data : stripHeavy(name, data);
}

export async function cmsGet(env, name, id) {
  const { data } = await readCollection(env, name);
  if (ENTITIES[name].single) return data;
  const it = data.find((x) => x.id === id);
  if (!it) throw notFound();
  return it;
}

function makeId(name, item) {
  const e = ENTITIES[name];
  if (e.idFrom && item[e.idFrom]) return slugify(item[e.idFrom]).replace(/-/g, '_');
  return `${name.slice(0, 3)}-${rid(8)}`;
}

function ensureSlug(name, item, all) {
  const e = ENTITIES[name];
  if (!e.fields.some((f) => f.key === 'slug')) return;
  let base = item.slug ? slugify(item.slug) : '';
  if (!base && e.slugFrom) {
    const src = item[e.slugFrom];
    base = slugify(typeof src === 'object' ? src.id || src.en : src);
  }
  if (!base) base = item.id;
  let s = base, i = 2;
  while (all.some((x) => x.slug === s && x.id !== item.id)) s = `${base}-${i++}`;
  item.slug = s;
}

export async function cmsCreate(env, name, item) {
  let created;
  await writeCollection(env, name, (data) => {
    const it = { ...item };
    it.id = it.id && !data.some((x) => x.id === it.id) ? it.id : makeId(name, it);
    if (data.some((x) => x.id === it.id)) it.id = `${it.id}-${rid(4)}`;
    ensureSlug(name, it, data);
    it.created_at = new Date().toISOString();
    it.updated_at = it.created_at;
    data.push(it);
    created = it;
    return data;
  });
  return created;
}

export async function cmsUpdate(env, name, id, patch) {
  let updated;
  await writeCollection(env, name, (data) => {
    if (ENTITIES[name].single) {
      updated = { ...data, ...patch, updated_at: new Date().toISOString() };
      return updated;
    }
    const i = data.findIndex((x) => x.id === id);
    if (i < 0) throw notFound();
    const it = { ...data[i], ...patch, id, updated_at: new Date().toISOString() };
    ensureSlug(name, it, data);
    data[i] = it;
    updated = it;
    return data;
  });
  await dropHeavy(env, name, id);
  return updated;
}

export async function cmsDelete(env, name, id) {
  await writeCollection(env, name, (data) => {
    const i = data.findIndex((x) => x.id === id);
    if (i < 0) throw notFound();
    if (data[i].system) throw conflict('Data sistem tidak dapat dihapus');
    data.splice(i, 1);
    return data;
  });
  await dropHeavy(env, name, id);
}

export async function cmsReorder(env, name, ids) {
  return writeCollection(env, name, (data) => {
    ids.forEach((id, idx) => {
      const it = data.find((x) => x.id === id);
      if (it) it.order = idx + 1;
    });
    return data;
  });
}

// ---------- helpers for public site & business logic ----------
export const byId = (list, id) => (list || []).find((x) => x.id === id);
export const active = (list) => (list || []).filter((x) => x.active !== false);
export const sorted = (list) => [...(list || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function priceFor(item, branchId) {
  const bp = (item?.branch_prices || []).find((p) => p.branch_id === branchId && p.price !== '' && p.price != null);
  return Number(bp ? bp.price : item?.price) || 0;
}
