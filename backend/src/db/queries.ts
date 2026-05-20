import { pool } from './pool';
import type {
  Patient, Visit, VitalSigns, Intervention,
  Medication, Narrative, ConversationMessage,
  SuctionEvent, SuctionRoute,
} from '../types';

// ─── Patients ────────────────────────────────────────────────

export async function getPatientById(patientId: string): Promise<Patient | null> {
  const { rows } = await pool.query(
    `SELECT id, kantime_patient_id, full_name, date_of_birth,
            age_months, age_years, allergies, primary_diagnosis,
            cpr_code, last_weight_lbs, last_height_inches,
            last_vitals_date, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation,
            photo_url
     FROM patients WHERE id = $1`,
    [patientId],
  );
  return rows[0] ?? null;
}

export async function getPatients(): Promise<Patient[]> {
  const { rows } = await pool.query(
    `SELECT id, kantime_patient_id, full_name, date_of_birth,
            age_months, age_years, allergies, primary_diagnosis,
            cpr_code, last_weight_lbs, last_height_inches,
            last_vitals_date, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation,
            photo_url
     FROM patients ORDER BY full_name`,
  );
  return rows;
}

// ─── Visits ──────────────────────────────────────────────────

export async function getVisitsByNurseId(nurseId: string): Promise<(Visit & { patient_name: string })[]> {
  const { rows } = await pool.query(
    `SELECT v.id, v.patient_id, v.nurse_id, v.visit_date,
            v.planned_start_time::text, v.planned_end_time::text,
            v.service_type, v.payer, v.status,
            p.full_name AS patient_name
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.nurse_id = $1 AND v.visit_date = CURRENT_DATE
     ORDER BY v.planned_start_time`,
    [nurseId],
  );
  return rows;
}

export async function getVisitWithPatient(visitId: string): Promise<{ visit: Visit; patient: Patient } | null> {
  const { rows } = await pool.query(
    `SELECT
       v.id AS v_id, v.patient_id, v.nurse_id, v.visit_date,
       v.planned_start_time::text, v.planned_end_time::text,
       v.service_type, v.payer, v.status,
       p.id AS p_id, p.kantime_patient_id, p.full_name, p.date_of_birth,
       p.age_months, p.age_years, p.allergies, p.primary_diagnosis,
       p.cpr_code, p.last_weight_lbs, p.last_height_inches,
       p.last_vitals_date, p.emergency_contact_name,
       p.emergency_contact_phone, p.emergency_contact_relation,
       p.photo_url
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = $1`,
    [visitId],
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  const visit: Visit = {
    id: r.v_id,
    patient_id: r.patient_id,
    nurse_id: r.nurse_id,
    visit_date: r.visit_date,
    planned_start_time: r.planned_start_time,
    planned_end_time: r.planned_end_time,
    service_type: r.service_type,
    payer: r.payer,
    status: r.status,
  };
  const patient: Patient = {
    id: r.p_id,
    kantime_patient_id: r.kantime_patient_id,
    full_name: r.full_name,
    date_of_birth: r.date_of_birth,
    age_months: r.age_months,
    age_years: r.age_years,
    allergies: r.allergies,
    primary_diagnosis: r.primary_diagnosis,
    cpr_code: r.cpr_code,
    last_weight_lbs: parseFloat(r.last_weight_lbs),
    last_height_inches: parseFloat(r.last_height_inches),
    last_vitals_date: r.last_vitals_date,
    emergency_contact_name: r.emergency_contact_name,
    emergency_contact_phone: r.emergency_contact_phone,
    emergency_contact_relation: r.emergency_contact_relation,
    photo_url: r.photo_url ?? null,
  };
  return { visit, patient };
}

// ─── Conversation ────────────────────────────────────────────

export async function getConversationHistory(visitId: string): Promise<ConversationMessage[]> {
  const { rows } = await pool.query(
    `SELECT id, visit_id, role, content, tool_name, tool_input, tool_result, created_at
     FROM conversation_messages
     WHERE visit_id = $1
     ORDER BY created_at ASC`,
    [visitId],
  );
  return rows;
}

export async function saveMessage(
  visitId: string,
  role: string,
  content: string | null,
  toolName?: string,
  toolInput?: Record<string, unknown>,
  toolResult?: Record<string, unknown>,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO conversation_messages (visit_id, role, content, tool_name, tool_input, tool_result)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [visitId, role, content, toolName ?? null, toolInput ? JSON.stringify(toolInput) : null, toolResult ? JSON.stringify(toolResult) : null],
  );
  return rows[0].id;
}

// ─── Vitals ──────────────────────────────────────────────────

export async function saveVitals(
  visitId: string,
  data: Record<string, unknown>,
): Promise<VitalSigns> {
  // occurred_at is the time the nurse observed the vitals — captured
  // explicitly, not auto-stamped, since end-of-shift documentation lags
  // the actual reading. Falls back to recorded_at via DEFAULT now() at
  // read time if the nurse can't recall.
  const occurred = parseTimeInput(data.occurred_at);

  const { rows } = await pool.query(
    `INSERT INTO vital_signs (
       visit_id, bp_systolic, bp_diastolic, heart_rate,
       respiratory_rate, temperature_f, o2_saturation,
       weight_lbs, pain_score, notes, occurred_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      visitId,
      data.bp_systolic ?? null,
      data.bp_diastolic ?? null,
      data.heart_rate ?? null,
      data.respiratory_rate ?? null,
      data.temperature_f ?? null,
      data.o2_saturation ?? null,
      data.weight_lbs ?? null,
      data.pain_score ?? null,
      data.notes ?? null,
      occurred,
    ],
  );
  return rows[0];
}

export async function getVitals(visitId: string): Promise<VitalSigns | null> {
  const { rows } = await pool.query(
    `SELECT * FROM vital_signs WHERE visit_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [visitId],
  );
  return rows[0] ?? null;
}

export async function getAllVitals(visitId: string): Promise<VitalSigns[]> {
  const { rows } = await pool.query(
    `SELECT * FROM vital_signs WHERE visit_id = $1 ORDER BY recorded_at ASC`,
    [visitId],
  );
  return rows;
}

// ─── Interventions ───────────────────────────────────────────

export async function saveIntervention(
  visitId: string,
  data: Record<string, unknown>,
): Promise<Intervention> {
  const occurred = parseTimeInput(data.occurred_at);

  const { rows } = await pool.query(
    `INSERT INTO interventions (visit_id, name, description, outcome, occurred_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [visitId, data.name, data.description ?? null, data.outcome ?? null, occurred],
  );
  return rows[0];
}

export async function getInterventions(visitId: string): Promise<Intervention[]> {
  const { rows } = await pool.query(
    `SELECT * FROM interventions WHERE visit_id = $1 ORDER BY recorded_at`,
    [visitId],
  );
  return rows;
}

// ─── Medications ─────────────────────────────────────────────

export async function saveMedication(
  visitId: string,
  data: Record<string, unknown>,
): Promise<Medication> {
  // administered_at is the time the nurse says the dose was given.
  // It must be supplied explicitly — do NOT fall back to now(), because
  // nurses often document an hour or two after the actual administration.
  const adminTime = parseTimeInput(data.administered_at);

  const { rows } = await pool.query(
    `INSERT INTO medications (
       visit_id, name, dose, route, given, reason_withheld, administered_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      visitId,
      data.name,
      data.dose ?? null,
      data.route ?? null,
      data.given,
      data.reason_withheld ?? null,
      adminTime,
    ],
  );
  return rows[0];
}

/**
 * Accepts an ISO-8601 timestamp ("2026-04-30T09:23:00Z"), an HH:MM string
 * ("09:23"), or null/undefined. Returns a Date or null.
 *
 * HH:MM is interpreted as today, local server time. Used for any
 * nurse-reported clinical time (med admin, vitals reading, intervention
 * performed) where we must NOT fall back to now() because charting lags
 * the actual event.
 */
function parseTimeInput(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();

  // HH:MM or HH:MM:SS — anchor to today
  const hhmm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    const sec = hhmm[3] ? Number(hhmm[3]) : 0;
    if (h > 23 || m > 59 || sec > 59) return null;
    const d = new Date();
    d.setHours(h, m, sec, 0);
    return d;
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function getMedications(visitId: string): Promise<Medication[]> {
  const { rows } = await pool.query(
    `SELECT * FROM medications WHERE visit_id = $1 ORDER BY recorded_at`,
    [visitId],
  );
  return rows;
}

// ─── Suction Events ──────────────────────────────────────────

const VALID_SUCTION_ROUTES: readonly SuctionRoute[] = ['nasal', 'oral', 'trach'];

export async function saveSuctionEvent(
  visitId: string,
  data: Record<string, unknown>,
): Promise<SuctionEvent> {
  const route = String(data.route ?? '').toLowerCase().trim() as SuctionRoute;
  if (!VALID_SUCTION_ROUTES.includes(route)) {
    throw new Error(
      `Invalid suction route "${data.route}". Must be one of: ${VALID_SUCTION_ROUTES.join(', ')}`,
    );
  }

  // Same explicit-time contract as medications/vitals/interventions —
  // never auto-stamp. Suctioning is high-frequency and nurses often
  // batch-document, so the event time matters more here than most.
  const occurred = parseTimeInput(data.occurred_at);
  if (!occurred) {
    throw new Error('occurred_at is required for suction events');
  }

  // Coerce count; reject non-positive integers via the DB CHECK constraint.
  const rawCount = data.count;
  const count = typeof rawCount === 'number' ? Math.floor(rawCount) : 1;

  const { rows } = await pool.query(
    `INSERT INTO suction_events (
       visit_id, occurred_at, route, amount, color, consistency, count, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      visitId,
      occurred,
      route,
      data.amount ?? null,
      data.color ?? null,
      data.consistency ?? null,
      count,
      data.notes ?? null,
    ],
  );
  return rows[0];
}

export async function getSuctionEvents(visitId: string): Promise<SuctionEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM suction_events WHERE visit_id = $1 ORDER BY occurred_at`,
    [visitId],
  );
  return rows;
}

// ─── Narrative ───────────────────────────────────────────────

export async function upsertNarrative(
  visitId: string,
  content: string,
  patientToleratedOk?: boolean,
  patientToleratedNotes?: string,
): Promise<Narrative> {
  const { rows } = await pool.query(
    `INSERT INTO narratives (visit_id, content, patient_tolerated_ok, patient_tolerated_notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (visit_id) DO UPDATE SET
       content = EXCLUDED.content,
       patient_tolerated_ok = EXCLUDED.patient_tolerated_ok,
       patient_tolerated_notes = EXCLUDED.patient_tolerated_notes,
       updated_at = now()
     RETURNING *`,
    [visitId, content, patientToleratedOk ?? null, patientToleratedNotes ?? null],
  );
  return rows[0];
}

export async function getNarrative(visitId: string): Promise<Narrative | null> {
  const { rows } = await pool.query(
    `SELECT * FROM narratives WHERE visit_id = $1`,
    [visitId],
  );
  return rows[0] ?? null;
}

// ─── Scheduled Tasks ─────────────────────────────────────────

export interface ScheduledTaskRow {
  id: string;
  patient_id: string;
  type: string;
  label: string;
  sublabel: string | null;
  scheduled_time: string;
  sort_order: number;
  // Medication-only fields. Null for vitals/intervention/narrative rows.
  dose: string | null;
  concentration: string | null;
  route: string | null;
  indication: string | null;
  instructions: string | null;
}

export async function getScheduledTasks(patientId: string): Promise<ScheduledTaskRow[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, type, label, sublabel, scheduled_time::text,
            sort_order, dose, concentration, route, indication, instructions
     FROM scheduled_tasks
     WHERE patient_id = $1
     ORDER BY sort_order`,
    [patientId],
  );
  return rows;
}

export interface PrnOrderRow {
  id: string;
  patient_id: string;
  medication: string;
  dose: string;
  route: string;
  indication: string;
  max_frequency_hours: number | null;
  notes: string | null;
  active: boolean;
}

// ─── Recent-history brief (for visit-start recap) ────────────

export interface RecentBriefVisitRow {
  visit_id: string;
  visit_date: string;
  planned_start_time: string;
  vitals: Array<{
    bp_systolic: number | null;
    bp_diastolic: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature_f: number | null;
    o2_saturation: number | null;
    pain_score: number | null;
  }>;
  medications: Array<{
    name: string;
    given: boolean;
    reason_withheld: string | null;
  }>;
  narrative: string | null;
}

/**
 * Fetches the last `limit` completed visits for a patient within `daysBack`,
 * each with its vitals, medications, and narrative content. Used to compute
 * recap highlights at visit start. Excludes the in-progress visit if given.
 */
export async function getPatientRecentBrief(
  patientId: string,
  options: { daysBack?: number; limit?: number; excludeVisitId?: string } = {},
): Promise<RecentBriefVisitRow[]> {
  const daysBack = options.daysBack ?? 14;
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);

  const params: unknown[] = [patientId, daysBack];
  let exclude = '';
  if (options.excludeVisitId) {
    params.push(options.excludeVisitId);
    exclude = ` AND v.id <> $${params.length}`;
  }
  params.push(limit);

  const { rows: visits } = await pool.query(
    `SELECT v.id AS visit_id, v.visit_date,
            v.planned_start_time::text AS planned_start_time
     FROM visits v
     WHERE v.patient_id = $1
       AND v.status = 'completed'
       AND v.visit_date >= CURRENT_DATE - ($2::int)
       ${exclude}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  if (visits.length === 0) return [];

  const ids = visits.map((v: { visit_id: string }) => v.visit_id);

  // Pull child rows in three small queries; cheap given limit ≤ 10.
  const [{ rows: vitalsRows }, { rows: medRows }, { rows: narrRows }] = await Promise.all([
    pool.query(
      `SELECT visit_id, bp_systolic, bp_diastolic, heart_rate,
              respiratory_rate, temperature_f, o2_saturation, pain_score,
              occurred_at, recorded_at
       FROM vital_signs
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, COALESCE(occurred_at, recorded_at) ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, name, given, reason_withheld
       FROM medications
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, recorded_at ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, content
       FROM narratives
       WHERE visit_id = ANY($1::uuid[])`,
      [ids],
    ),
  ]);

  return visits.map((v: { visit_id: string; visit_date: unknown; planned_start_time: string }) => ({
    visit_id: v.visit_id,
    visit_date: v.visit_date instanceof Date
      ? v.visit_date.toISOString().split('T')[0]
      : String(v.visit_date).split('T')[0],
    planned_start_time: v.planned_start_time,
    vitals: vitalsRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        bp_systolic:      r.bp_systolic      as number | null,
        bp_diastolic:     r.bp_diastolic     as number | null,
        heart_rate:       r.heart_rate       as number | null,
        respiratory_rate: r.respiratory_rate as number | null,
        temperature_f:    r.temperature_f != null ? Number(r.temperature_f) : null,
        o2_saturation:    r.o2_saturation    as number | null,
        pain_score:       r.pain_score       as number | null,
      })),
    medications: medRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: { name: string; given: boolean; reason_withheld: string | null }) => ({
        name: r.name,
        given: r.given,
        reason_withheld: r.reason_withheld,
      })),
    narrative: narrRows.find((r: { visit_id: string }) => r.visit_id === v.visit_id)?.content ?? null,
  }));
}

// ─── Patient History Search (Aria Q&A tool) ──────────────────

export interface PatientHistoryQuery {
  query?: string;
  medicationName?: string;
  daysBack?: number;
  limit?: number;
  excludeVisitId?: string;
}

export interface PatientHistoryVisit {
  visit_id: string;
  visit_date: string;
  narrative: string | null;
  narrative_match_excerpt: string | null;
  vitals: Array<{
    bp_systolic: number | null;
    bp_diastolic: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature_f: number | null;
    o2_saturation: number | null;
    pain_score: number | null;
    occurred_at: string | null;
  }>;
  medications: Array<{
    name: string;
    dose: string | null;
    route: string | null;
    given: boolean;
    reason_withheld: string | null;
    administered_at: string | null;
  }>;
}

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

function excerptAround(content: string, query: string, window = 120): string | null {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - Math.floor(window / 2));
  const end = Math.min(content.length, idx + query.length + Math.floor(window / 2));
  const slice = content.slice(start, end).replace(/\s+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
}

/**
 * Searches a patient's past completed visits by free-text and/or medication
 * name, returning fully-joined visits with vitals, medications, and the
 * narrative content. Used by Aria's `search_patient_history` tool — keep
 * the response shape stable so the model has predictable structure.
 */
export async function searchPatientHistory(
  patientId: string,
  opts: PatientHistoryQuery = {},
): Promise<PatientHistoryVisit[]> {
  const daysBack = Math.min(Math.max(opts.daysBack ?? 14, 1), 90);
  const limit    = Math.min(Math.max(opts.limit    ?? 5,  1), 20);

  const params: unknown[] = [patientId, daysBack];
  const where: string[] = [
    `v.patient_id = $1`,
    `v.status = 'completed'`,
    `v.visit_date >= CURRENT_DATE - ($2::int)`,
  ];

  if (opts.excludeVisitId) {
    params.push(opts.excludeVisitId);
    where.push(`v.id <> $${params.length}`);
  }

  if (opts.query && opts.query.trim()) {
    params.push(`%${escapeLike(opts.query.trim())}%`);
    const idx = params.length;
    where.push(`n.content ILIKE $${idx}`);
  }

  if (opts.medicationName && opts.medicationName.trim()) {
    params.push(`%${escapeLike(opts.medicationName.trim())}%`);
    const idx = params.length;
    where.push(`EXISTS (SELECT 1 FROM medications m WHERE m.visit_id = v.id AND m.name ILIKE $${idx})`);
  }

  params.push(limit);

  const { rows: visitRows } = await pool.query(
    `SELECT v.id AS visit_id, v.visit_date, n.content AS narrative
     FROM visits v
     LEFT JOIN narratives n ON n.visit_id = v.id
     WHERE ${where.join(' AND ')}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  if (visitRows.length === 0) return [];
  const ids = visitRows.map((r: { visit_id: string }) => r.visit_id);

  // For medication-name searches, only return matching meds (not every med
  // on those days) — keeps the tool response focused on what the nurse
  // asked about. Other queries get the full med list.
  const medParams: unknown[] = [ids];
  let medFilter = '';
  if (opts.medicationName && opts.medicationName.trim()) {
    medParams.push(`%${escapeLike(opts.medicationName.trim())}%`);
    medFilter = ` AND name ILIKE $${medParams.length}`;
  }

  const [{ rows: vitalsRows }, { rows: medRows }] = await Promise.all([
    pool.query(
      `SELECT visit_id, bp_systolic, bp_diastolic, heart_rate,
              respiratory_rate, temperature_f, o2_saturation, pain_score,
              occurred_at
       FROM vital_signs
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, COALESCE(occurred_at, recorded_at) ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, name, dose, route, given, reason_withheld, administered_at
       FROM medications
       WHERE visit_id = ANY($1::uuid[])${medFilter}
       ORDER BY visit_id, COALESCE(administered_at, recorded_at) ASC`,
      medParams,
    ),
  ]);

  return visitRows.map((v: { visit_id: string; visit_date: unknown; narrative: string | null }) => ({
    visit_id: v.visit_id,
    visit_date: v.visit_date instanceof Date
      ? v.visit_date.toISOString().split('T')[0]
      : String(v.visit_date).split('T')[0],
    narrative: v.narrative,
    narrative_match_excerpt: opts.query && v.narrative
      ? excerptAround(v.narrative, opts.query)
      : null,
    vitals: vitalsRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        bp_systolic:      r.bp_systolic      as number | null,
        bp_diastolic:     r.bp_diastolic     as number | null,
        heart_rate:       r.heart_rate       as number | null,
        respiratory_rate: r.respiratory_rate as number | null,
        temperature_f:    r.temperature_f != null ? Number(r.temperature_f) : null,
        o2_saturation:    r.o2_saturation    as number | null,
        pain_score:       r.pain_score       as number | null,
        occurred_at:      (r.occurred_at instanceof Date)
                            ? r.occurred_at.toISOString()
                            : (r.occurred_at as string | null),
      })),
    medications: medRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        name:            r.name as string,
        dose:            r.dose as string | null,
        route:           r.route as string | null,
        given:           r.given as boolean,
        reason_withheld: r.reason_withheld as string | null,
        administered_at: (r.administered_at instanceof Date)
                            ? r.administered_at.toISOString()
                            : (r.administered_at as string | null),
      })),
  }));
}

// ─── Past Visits Search ──────────────────────────────────────

export interface PastVisitSearchOptions {
  patientId?: string;
  q?: string;
  /** ISO yyyy-mm-dd lower bound, inclusive. */
  from?: string;
  /** ISO yyyy-mm-dd upper bound, inclusive. */
  to?: string;
  limit?: number;
}

export interface PastVisitRow {
  id: string;
  visit_date: string;
  planned_start_time: string;
  planned_end_time: string;
  service_type: string;
  payer: string | null;
  patient_id: string;
  patient_name: string;
  narrative_excerpt: string | null;
  /** Source columns that matched `q`, when present. Used by the
   *  frontend to render a "found in: narrative / meds / interventions"
   *  badge so the nurse knows why a row came back. */
  match_sources: string[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function searchPastVisits(
  nurseId: string,
  opts: PastVisitSearchOptions = {},
): Promise<PastVisitRow[]> {
  const params: unknown[] = [nurseId];
  const where: string[] = [
    `v.nurse_id = $1`,
    `v.visit_date < CURRENT_DATE`,
    `v.status = 'completed'`,
  ];

  if (opts.patientId) {
    params.push(opts.patientId);
    where.push(`v.patient_id = $${params.length}`);
  }

  if (opts.from && ISO_DATE_RE.test(opts.from)) {
    params.push(opts.from);
    where.push(`v.visit_date >= $${params.length}::date`);
  }
  if (opts.to && ISO_DATE_RE.test(opts.to)) {
    params.push(opts.to);
    where.push(`v.visit_date <= $${params.length}::date`);
  }

  // Text search now spans narrative content, patient name, medication
  // names, AND intervention names — nurses asked for "where did I give
  // Albuterol last week" / "find the visits with repositioning" without
  // having to remember the narrative phrasing.
  let matchClauses: { source: string; column: string }[] = [];
  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const idx = params.length;
    matchClauses = [
      { source: 'narrative',    column: `n.content ILIKE $${idx}` },
      { source: 'patient',      column: `p.full_name ILIKE $${idx}` },
      { source: 'medication',   column: `EXISTS (SELECT 1 FROM medications m   WHERE m.visit_id = v.id AND m.name ILIKE $${idx})` },
      { source: 'intervention', column: `EXISTS (SELECT 1 FROM interventions i WHERE i.visit_id = v.id AND i.name ILIKE $${idx})` },
    ];
    where.push(`(${matchClauses.map((c) => c.column).join(' OR ')})`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  params.push(limit);

  // Project each match clause as a boolean alongside the row so the
  // frontend can render a "matched in: …" hint without re-querying.
  const matchProjection = matchClauses.length === 0
    ? ''
    : ',' + matchClauses.map((c, i) => `(${c.column}) AS match_${i}`).join(',');

  const { rows } = await pool.query(
    `SELECT v.id, v.visit_date,
            v.planned_start_time::text, v.planned_end_time::text,
            v.service_type, v.payer,
            v.patient_id, p.full_name AS patient_name,
            n.content AS narrative_excerpt
            ${matchProjection}
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN narratives n ON n.visit_id = v.id
     WHERE ${where.join(' AND ')}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((r: Record<string, unknown>) => {
    const match_sources: string[] = [];
    matchClauses.forEach((c, i) => {
      if (r[`match_${i}`] === true) match_sources.push(c.source);
    });
    return {
      id: r.id as string,
      visit_date: r.visit_date as string,
      planned_start_time: r.planned_start_time as string,
      planned_end_time: r.planned_end_time as string,
      service_type: r.service_type as string,
      payer: (r.payer ?? null) as string | null,
      patient_id: r.patient_id as string,
      patient_name: r.patient_name as string,
      narrative_excerpt: (r.narrative_excerpt ?? null) as string | null,
      match_sources,
    };
  });
}

export async function getPrnOrders(patientId: string): Promise<PrnOrderRow[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, medication, dose, route, indication,
            max_frequency_hours, notes, active
       FROM patient_prn_orders
      WHERE patient_id = $1 AND active = true
      ORDER BY medication`,
    [patientId],
  );
  return rows;
}

// ─── Change orders ──────────────────────────────────────────
// Nurse-initiated change requests, always backed by a physician
// source. The "applied state" of an order is derived from `status` —
// pending_signature and signed are both treated as live by the
// schedule (the nurse documents against them immediately); cancelled
// and discontinued are tombstones.

export const VALID_CHANGE_TYPES = ['add', 'modify_dose', 'modify_route', 'modify_frequency', 'discontinue'] as const;
export const VALID_SOURCE_TYPES = ['verbal', 'pharmacy_label', 'written_note'] as const;
export const VALID_CO_STATUSES = ['pending_signature', 'signed', 'discontinued', 'cancelled'] as const;

export interface ChangeOrderRow {
  id: string;
  visit_id: string;
  patient_id: string;
  scheduled_task_id: string | null;
  medication_name: string;
  change_type: (typeof VALID_CHANGE_TYPES)[number];
  old_dose: string | null;
  old_route: string | null;
  old_frequency: string | null;
  new_dose: string | null;
  new_route: string | null;
  new_frequency: string | null;
  new_concentration: string | null;
  new_indication: string | null;
  new_instructions: string | null;
  reason: string | null;
  source_type: (typeof VALID_SOURCE_TYPES)[number];
  source_physician: string | null;
  source_obtained_at: string | null;
  source_description: string | null;
  initiated_by_nurse_id: string | null;
  notes: string | null;
  status: (typeof VALID_CO_STATUSES)[number];
  fax_sent_at: string | null;
  signed_at: string | null;
  submitted_at: string;
}

export interface CreateChangeOrderInput {
  visit_id: string;
  patient_id: string;
  scheduled_task_id?: string | null;
  medication_name: string;
  change_type: (typeof VALID_CHANGE_TYPES)[number];
  old_dose?: string | null;
  old_route?: string | null;
  old_frequency?: string | null;
  new_dose?: string | null;
  new_route?: string | null;
  new_frequency?: string | null;
  new_concentration?: string | null;
  new_indication?: string | null;
  new_instructions?: string | null;
  reason?: string | null;
  source_type: (typeof VALID_SOURCE_TYPES)[number];
  source_physician?: string | null;
  source_obtained_at?: string | null;
  source_description?: string | null;
  initiated_by_nurse_id?: string | null;
  notes?: string | null;
}

export async function saveChangeOrder(input: CreateChangeOrderInput): Promise<ChangeOrderRow> {
  const { rows } = await pool.query(
    `INSERT INTO change_orders (
       visit_id, patient_id, scheduled_task_id, medication_name, change_type,
       old_dose, old_route, old_frequency,
       new_dose, new_route, new_frequency, new_concentration, new_indication, new_instructions,
       reason, source_type, source_physician, source_obtained_at, source_description,
       initiated_by_nurse_id, notes,
       fax_sent_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
     RETURNING *`,
    [
      input.visit_id, input.patient_id, input.scheduled_task_id ?? null,
      input.medication_name, input.change_type,
      input.old_dose ?? null, input.old_route ?? null, input.old_frequency ?? null,
      input.new_dose ?? null, input.new_route ?? null, input.new_frequency ?? null,
      input.new_concentration ?? null, input.new_indication ?? null, input.new_instructions ?? null,
      input.reason ?? null,
      input.source_type, input.source_physician ?? null, input.source_obtained_at ?? null, input.source_description ?? null,
      input.initiated_by_nurse_id ?? null, input.notes ?? null,
    ],
  );
  return rows[0];
}

export async function getChangeOrdersForVisit(visitId: string): Promise<ChangeOrderRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM change_orders WHERE visit_id = $1 ORDER BY submitted_at DESC`,
    [visitId],
  );
  return rows;
}

export async function getChangeOrdersForPatient(
  patientId: string,
  opts: { status?: (typeof VALID_CO_STATUSES)[number] } = {},
): Promise<ChangeOrderRow[]> {
  const params: unknown[] = [patientId];
  let where = `patient_id = $1`;
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $2`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM change_orders WHERE ${where} ORDER BY submitted_at DESC`,
    params,
  );
  return rows;
}

export async function markChangeOrderSigned(id: string): Promise<ChangeOrderRow | null> {
  const { rows } = await pool.query(
    `UPDATE change_orders
        SET status = 'signed', signed_at = now()
      WHERE id = $1 AND status = 'pending_signature'
      RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

// ─── Seizure events ──────────────────────────────────────────
// Per-event rows so the chart slices cleanly. KanTime fields:
// occurred_at, duration, type (Absence/Atonic/.../Tonic-Clonic/Other),
// LOC (alert/oriented/lethargic), intervention, notes.

export const VALID_SEIZURE_LOC = ['alert', 'oriented', 'lethargic'] as const;

export interface SeizureEvent {
  id: string;
  visit_id: string;
  occurred_at: string;
  duration_seconds: number | null;
  seizure_type: string | null;
  loc: 'alert' | 'oriented' | 'lethargic' | null;
  intervention: string | null;
  notes: string | null;
  recorded_at: string;
}

export async function saveSeizureEvent(
  visitId: string,
  data: Record<string, unknown>,
): Promise<SeizureEvent> {
  // occurred_at accepts HH:MM, full ISO, or HH:MM:SS — the WS handler
  // already passes ISO when it comes from Aria; the form posts HH:MM
  // and the route synthesizes a same-day ISO before insert.
  const occurredAt = typeof data.occurred_at === 'string' ? data.occurred_at : null;
  if (!occurredAt) throw new Error('occurred_at is required for seizure events');
  const loc = data.loc as string | undefined;
  if (loc && !VALID_SEIZURE_LOC.includes(loc as (typeof VALID_SEIZURE_LOC)[number])) {
    throw new Error(`Invalid LOC "${loc}". Must be one of: ${VALID_SEIZURE_LOC.join(', ')}`);
  }
  const { rows } = await pool.query(
    `INSERT INTO seizure_events (
       visit_id, occurred_at, duration_seconds, seizure_type, loc, intervention, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      visitId,
      occurredAt,
      data.duration_seconds != null ? Number(data.duration_seconds) : null,
      data.seizure_type ?? null,
      loc ?? null,
      data.intervention ?? null,
      data.notes ?? null,
    ],
  );
  return rows[0];
}

export async function getSeizureEvents(visitId: string): Promise<SeizureEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM seizure_events WHERE visit_id = $1 ORDER BY occurred_at`,
    [visitId],
  );
  return rows;
}

// ─── Head-to-toe assessment ──────────────────────────────────
// The first mandatory event of every visit. JSONB systems map lets the
// shape evolve (WDL vs FL-checklist) without a schema migration. The
// frontend close-out gate uses `getHeadToToe(visitId)` to decide
// whether the visit can be signed off.

export interface HeadToToeSystemFinding {
  wdl: boolean;
  exceptions: string[];
  notes: string;
  // Florida-style extras stored verbatim (lung sounds chips, skin color,
  // etc.) — schema-free per-system fields. Optional so WDL-mode rows
  // don't carry empty objects.
  details?: Record<string, unknown>;
}

export interface HeadToToeAssessment {
  id: string;
  visit_id: string;
  mode: 'wdl' | 'checklist';
  systems: Record<string, HeadToToeSystemFinding>;
  summary_notes: string | null;
  completed_at: string;
}

export async function getHeadToToe(visitId: string): Promise<HeadToToeAssessment | null> {
  const { rows } = await pool.query(
    `SELECT id, visit_id, mode, systems, summary_notes, completed_at
       FROM head_to_toe_assessments
      WHERE visit_id = $1
      LIMIT 1`,
    [visitId],
  );
  return rows[0] ?? null;
}

export async function saveHeadToToe(
  visitId: string,
  mode: 'wdl' | 'checklist',
  systems: Record<string, HeadToToeSystemFinding>,
  summaryNotes: string | null,
): Promise<HeadToToeAssessment> {
  const { rows } = await pool.query(
    `INSERT INTO head_to_toe_assessments
       (visit_id, mode, systems, summary_notes)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (visit_id) DO UPDATE SET
       mode          = EXCLUDED.mode,
       systems       = EXCLUDED.systems,
       summary_notes = EXCLUDED.summary_notes,
       completed_at  = now()
     RETURNING id, visit_id, mode, systems, summary_notes, completed_at`,
    [visitId, mode, JSON.stringify(systems), summaryNotes],
  );
  return rows[0];
}

// ─── Patient identification check ─────────────────────────────
// Required step at visit start (regulatory). One row per visit; the
// UNIQUE(visit_id) constraint enforces "at most one check per visit".
// The frontend uses this to gate all other documentation.

export interface IdentificationCheck {
  id: string;
  visit_id: string;
  identifiers: string[];
  confirmed_with: string | null;
  notes: string | null;
  confirmed_at: string;
}

export async function getIdentificationCheck(visitId: string): Promise<IdentificationCheck | null> {
  const { rows } = await pool.query(
    `SELECT id, visit_id, identifiers, confirmed_with, notes, confirmed_at
       FROM patient_identification_checks
      WHERE visit_id = $1
      LIMIT 1`,
    [visitId],
  );
  return rows[0] ?? null;
}

export async function saveIdentificationCheck(
  visitId: string,
  identifiers: string[],
  confirmedWith: string | null,
  notes: string | null,
): Promise<IdentificationCheck> {
  const { rows } = await pool.query(
    `INSERT INTO patient_identification_checks
       (visit_id, identifiers, confirmed_with, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (visit_id) DO UPDATE SET
       identifiers    = EXCLUDED.identifiers,
       confirmed_with = EXCLUDED.confirmed_with,
       notes          = EXCLUDED.notes,
       confirmed_at   = now()
     RETURNING id, visit_id, identifiers, confirmed_with, notes, confirmed_at`,
    [visitId, identifiers, confirmedWith, notes],
  );
  return rows[0];
}

export interface PendingOrderChangeRow {
  id: string;
  patient_id: string;
  change_type: 'added' | 'modified' | 'discontinued';
  medication: string;
  details: string;
  reason: string | null;
  signed_by: string | null;
  signed_at: string;
}

export async function getPendingOrderChanges(patientId: string): Promise<PendingOrderChangeRow[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, change_type, medication, details, reason,
            signed_by, signed_at
       FROM pending_order_changes
      WHERE patient_id = $1
      ORDER BY signed_at DESC`,
    [patientId],
  );
  return rows;
}
