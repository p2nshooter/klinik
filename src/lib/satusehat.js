// SATU SEHAT (Kemenkes) FHIR R4 integration: resource mapping, sync queue and API client.
import { byId, getBundle } from './cms.js';
import { q, q1, run } from './db.js';
import { nowISO, parseJSON } from './util.js';

const BASE = {
  sandbox: { auth: 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1', fhir: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1' },
  production: { auth: 'https://api-satusehat.kemkes.go.id/oauth2/v1', fhir: 'https://api-satusehat.kemkes.go.id/fhir-r4/v1' },
};
const NIK = 'https://fhir.kemkes.go.id/id/nik';
const LOINC = 'http://loinc.org';
const VITALS = [
  ['temp', '8310-5', 'Body temperature', 'Cel', '°C'],
  ['hr', '8867-4', 'Heart rate', '/min', 'beats/minute'],
  ['rr', '9279-1', 'Respiratory rate', '/min', 'breaths/minute'],
  ['spo2', '59408-5', 'Oxygen saturation', '%', '%'],
  ['weight', '29463-7', 'Body weight', 'kg', 'kg'],
  ['height', '8302-2', 'Body height', 'cm', 'cm'],
];

export async function queueResource(env, resource, localId) {
  const bundle = await getBundle(env);
  if (!bundle.settings?.satusehat_enabled) return;
  const now = nowISO();
  const exists = await q1(env, "SELECT id FROM satusehat_sync WHERE resource = ? AND local_id = ? AND status IN ('pending','sent')", resource, String(localId));
  if (exists) return;
  await run(env, "INSERT INTO satusehat_sync (resource, local_id, status, attempts, created_at, updated_at) VALUES (?, ?, 'pending', 0, ?, ?)", resource, String(localId), now, now);
}

async function token(env, envName) {
  const cached = await env.KV.get(`ss:token:${envName}`);
  if (cached) return cached;
  if (!env.SATUSEHAT_CLIENT_ID || !env.SATUSEHAT_CLIENT_SECRET) throw new Error('Kredensial SATU SEHAT belum diisi (SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET)');
  const r = await fetch(`${BASE[envName].auth}/accesstoken?grant_type=client_credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.SATUSEHAT_CLIENT_ID, client_secret: env.SATUSEHAT_CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error(`Auth SATU SEHAT gagal (${r.status})`);
  const d = await r.json();
  await env.KV.put(`ss:token:${envName}`, d.access_token, { expirationTtl: Math.max(60, Number(d.expires_in || 3600) - 120) });
  return d.access_token;
}

async function api(env, envName, method, path, body) {
  const t = await token(env, envName);
  const r = await fetch(`${BASE[envName].fhir}${path}`, { method, headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = parseJSON(text, { raw: text });
  if (!r.ok) throw new Error(`FHIR ${method} ${path} ${r.status}: ${text.slice(0, 400)}`);
  return data;
}

async function lookupIhs(env, envName, type, nik, cacheKey) {
  if (!nik) return null;
  const c = await env.KV.get(cacheKey);
  if (c) return c;
  const d = await api(env, envName, 'GET', `/${type}?identifier=${encodeURIComponent(`${NIK}|${nik}`)}`);
  const id = d?.entry?.[0]?.resource?.id || null;
  if (id) await env.KV.put(cacheKey, id, { expirationTtl: 86400 * 30 });
  return id;
}

/** Build a FHIR transaction Bundle for a finished visit (Encounter + Condition + vital-sign Observations + MedicationRequest). */
export async function buildEncounterBundle(env, visitId, refs = {}) {
  const bundle = await getBundle(env);
  const s = bundle.settings || {};
  const v = await q1(env, 'SELECT * FROM visits WHERE id = ?', Number(visitId));
  if (!v) throw new Error('Kunjungan tidak ditemukan');
  const [p, rec, rxs] = await Promise.all([
    q1(env, 'SELECT * FROM patients WHERE id = ?', v.patient_id),
    q1(env, 'SELECT * FROM medical_records WHERE visit_id = ?', v.id),
    q(env, "SELECT * FROM prescriptions WHERE visit_id = ? AND status != 'cancelled'", v.id),
  ]);
  const doc = byId(bundle.doctors, v.doctor_id);
  const br = byId(bundle.branches, v.branch_id);
  const patientRef = { reference: `Patient/${refs.patient || p?.satusehat_id || 'IHS-PATIENT'}`, display: p?.name };
  const pracRef = { reference: `Practitioner/${refs.practitioner || 'IHS-PRACTITIONER'}`, display: doc?.name };
  const encId = crypto.randomUUID();
  const start = `${v.date}T${(v.created_at || '').slice(11, 19) || '08:00:00'}+00:00`;
  const end = v.finished_at ? v.finished_at.replace('Z', '+00:00') : start;
  const entries = [];
  const diagnoses = parseJSON(rec?.diagnoses, []);
  const condIds = diagnoses.map(() => crypto.randomUUID());
  entries.push({
    fullUrl: `urn:uuid:${encId}`,
    resource: {
      resourceType: 'Encounter', status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      subject: patientRef,
      participant: [{ type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND', display: 'attender' }] }], individual: pracRef }],
      period: { start, end },
      location: [{ location: { reference: `Location/${br?.satusehat_location_id || 'LOCATION-ID'}`, display: br?.name } }],
      diagnosis: diagnoses.map((d, i) => ({ condition: { reference: `urn:uuid:${condIds[i]}`, display: d.name }, use: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role', code: 'DD', display: 'Discharge diagnosis' }] }, rank: i + 1 })),
      statusHistory: [{ status: 'finished', period: { start, end } }],
      serviceProvider: { reference: `Organization/${s.satusehat_org_id || 'ORG-ID'}` },
      identifier: [{ system: `http://sys-ids.kemkes.go.id/encounter/${s.satusehat_org_id || 'ORG-ID'}`, value: v.visit_no }],
    },
    request: { method: 'POST', url: 'Encounter' },
  });
  diagnoses.forEach((d, i) =>
    entries.push({
      fullUrl: `urn:uuid:${condIds[i]}`,
      resource: {
        resourceType: 'Condition',
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' }] },
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: d.code, display: d.name }] },
        subject: patientRef, encounter: { reference: `urn:uuid:${encId}` },
      },
      request: { method: 'POST', url: 'Condition' },
    })
  );
  const vitals = parseJSON(rec?.vitals, {}) || {};
  const obs = (code, display, value, unit, ucode) => ({
    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
    resource: {
      resourceType: 'Observation', status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
      code: { coding: [{ system: LOINC, code, display }] }, subject: patientRef, performer: [pracRef], encounter: { reference: `urn:uuid:${encId}` },
      effectiveDateTime: start, valueQuantity: { value: Number(value), unit, system: 'http://unitsofmeasure.org', code: ucode },
    },
    request: { method: 'POST', url: 'Observation' },
  });
  for (const [k, code, display, ucode, unit] of VITALS) if (vitals[k] !== undefined && vitals[k] !== '' && Number.isFinite(Number(vitals[k]))) entries.push(obs(code, display, vitals[k], unit, ucode));
  if (vitals.bp && /^\d+\/\d+$/.test(vitals.bp)) {
    const [sys, dia] = vitals.bp.split('/');
    entries.push(obs('8480-6', 'Systolic blood pressure', sys, 'mm[Hg]', 'mm[Hg]'));
    entries.push(obs('8462-4', 'Diastolic blood pressure', dia, 'mm[Hg]', 'mm[Hg]'));
  }
  for (const rx of rxs) {
    for (const it of parseJSON(rx.items, [])) {
      const med = it.medicine_id ? await q1(env, 'SELECT kfa_code, name FROM medicines WHERE id = ?', it.medicine_id) : null;
      entries.push({
        fullUrl: `urn:uuid:${crypto.randomUUID()}`,
        resource: {
          resourceType: 'MedicationRequest', status: 'completed', intent: 'order',
          identifier: [{ system: `http://sys-ids.kemkes.go.id/prescription/${s.satusehat_org_id || 'ORG-ID'}`, value: rx.rx_no }],
          medicationCodeableConcept: { coding: [{ system: 'http://sys-ids.kemkes.go.id/kfa', code: med?.kfa_code || 'KFA-CODE', display: it.name }] },
          subject: patientRef, encounter: { reference: `urn:uuid:${encId}` }, requester: pracRef, authoredOn: start,
          dosageInstruction: [{ text: it.dose || '' }], dispenseRequest: { quantity: { value: Number(it.qty) || 1, unit: it.unit || '' } },
        },
        request: { method: 'POST', url: 'MedicationRequest' },
      });
    }
  }
  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

export async function buildLabBundle(env, labId, refs = {}) {
  const l = await q1(env, 'SELECT * FROM lab_orders WHERE id = ?', Number(labId));
  if (!l) throw new Error('Order lab tidak ditemukan');
  const p = await q1(env, 'SELECT name, satusehat_id FROM patients WHERE id = ?', l.patient_id);
  const bundle = await getBundle(env);
  const patientRef = { reference: `Patient/${refs.patient || p?.satusehat_id || 'IHS-PATIENT'}`, display: p?.name };
  const entries = [];
  const obsIds = [];
  for (const t of parseJSON(l.tests, [])) {
    const m = byId(bundle.lab_tests, t.test_id);
    const id = crypto.randomUUID();
    obsIds.push(id);
    const num = Number(String(t.result).replace(',', '.'));
    entries.push({
      fullUrl: `urn:uuid:${id}`,
      resource: {
        resourceType: 'Observation', status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
        code: { coding: [{ system: LOINC, code: m?.loinc || 'LOINC', display: t.name }] }, subject: patientRef, effectiveDateTime: (l.result_at || nowISO()).replace('Z', '+00:00'),
        ...(Number.isFinite(num) ? { valueQuantity: { value: num, unit: t.unit || '' } } : { valueString: String(t.result || '') }),
        ...(t.flag ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: t.flag === 'A' ? 'A' : t.flag }] }] } : {}),
      },
      request: { method: 'POST', url: 'Observation' },
    });
  }
  entries.push({
    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
    resource: {
      resourceType: 'DiagnosticReport', status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      code: { text: `Hasil laboratorium ${l.lab_no}` }, subject: patientRef, issued: (l.result_at || nowISO()).replace('Z', '+00:00'),
      result: obsIds.map((i) => ({ reference: `urn:uuid:${i}` })),
    },
    request: { method: 'POST', url: 'DiagnosticReport' },
  });
  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

export async function processQueue(env, limit = 10) {
  const bundle = await getBundle(env);
  const s = bundle.settings || {};
  if (!s.satusehat_enabled) return { skipped: true };
  const envName = s.satusehat_env === 'production' ? 'production' : 'sandbox';
  const rows = await q(env, "SELECT * FROM satusehat_sync WHERE status IN ('pending','failed') AND attempts < 5 ORDER BY id LIMIT ?", limit);
  let sent = 0, failed = 0;
  for (const r of rows) {
    try {
      let body;
      if (r.resource === 'Encounter') {
        const v = await q1(env, 'SELECT patient_id, doctor_id FROM visits WHERE id = ?', Number(r.local_id));
        const p = await q1(env, 'SELECT id, nik, satusehat_id FROM patients WHERE id = ?', v?.patient_id);
        let ihs = p?.satusehat_id || (await lookupIhs(env, envName, 'Patient', p?.nik, `ss:pat:${p?.id}`));
        if (ihs && !p.satusehat_id) await run(env, 'UPDATE patients SET satusehat_id = ? WHERE id = ?', ihs, p.id);
        const prac = await lookupIhs(env, envName, 'Practitioner', byId(bundle.doctors, v?.doctor_id)?.nik, `ss:prac:${v?.doctor_id}`);
        if (!ihs) throw new Error('IHS pasien tidak ditemukan (pastikan NIK pasien terisi)');
        if (!prac) throw new Error('IHS dokter tidak ditemukan (isi NIK dokter di data Dokter)');
        body = await buildEncounterBundle(env, r.local_id, { patient: ihs, practitioner: prac });
      } else if (r.resource === 'DiagnosticReport') {
        const l = await q1(env, 'SELECT patient_id FROM lab_orders WHERE id = ?', Number(r.local_id));
        const p = await q1(env, 'SELECT id, nik, satusehat_id FROM patients WHERE id = ?', l?.patient_id);
        const ihs = p?.satusehat_id || (await lookupIhs(env, envName, 'Patient', p?.nik, `ss:pat:${p?.id}`));
        if (!ihs) throw new Error('IHS pasien tidak ditemukan');
        body = await buildLabBundle(env, r.local_id, { patient: ihs });
      } else throw new Error('Resource tidak didukung');
      const res = await api(env, envName, 'POST', '', body);
      const fhirId = res?.entry?.[0]?.response?.resourceID || res?.entry?.[0]?.response?.location || '';
      await run(env, "UPDATE satusehat_sync SET status = 'sent', fhir_id = ?, error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?", String(fhirId).slice(0, 200), nowISO(), r.id);
      sent++;
    } catch (e) {
      await run(env, "UPDATE satusehat_sync SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?", String(e.message || e).slice(0, 1000), nowISO(), r.id);
      failed++;
    }
  }
  return { sent, failed, total: rows.length };
}
