import { Router } from 'express';
import ExcelJS from 'exceljs';
import {
  getVisitsByNurseId,
  getVisitWithPatient,
  getVitals,
  getAllVitals,
  getInterventions,
  getMedications,
  getNarrative,
  getConversationHistory,
  saveVitals,
  saveIntervention,
  saveMedication,
  saveSuctionEvent,
  getSuctionEvents,
  upsertNarrative,
  getScheduledTasks,
  searchPastVisits,
  getIdentificationCheck,
  saveIdentificationCheck,
  getHeadToToe,
  saveHeadToToe,
  saveSeizureEvent,
  getSeizureEvents,
  saveChangeOrder,
  getChangeOrdersForVisit,
  getChangeOrdersForPatient,
  markChangeOrderSigned,
  VALID_CHANGE_TYPES,
  VALID_SOURCE_TYPES,
} from '../db/queries';
import { HEAD_TO_TOE_SYSTEMS, HEAD_TO_TOE_SYSTEM_IDS } from '../agent/headToToeSystems';

const HARDCODED_NURSE_ID = '00000000-0000-0000-0000-000000000001';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const visits = await getVisitsByNurseId(HARDCODED_NURSE_ID);
    res.json(visits);
  } catch (err) {
    console.error('[visits] Error:', err);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

router.get('/past', async (req, res) => {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const q         = typeof req.query.q         === 'string' ? req.query.q         : undefined;
    const from      = typeof req.query.from      === 'string' ? req.query.from      : undefined;
    const to        = typeof req.query.to        === 'string' ? req.query.to        : undefined;
    const limit     = typeof req.query.limit     === 'string' ? Number(req.query.limit) : undefined;
    const rows = await searchPastVisits(HARDCODED_NURSE_ID, { patientId, q, from, to, limit });
    res.json(rows);
  } catch (err) {
    console.error('[visits/past] Error:', err);
    res.status(500).json({ error: 'Failed to fetch past visits' });
  }
});

router.get('/:visitId/summary', async (req, res) => {
  try {
    const { visitId } = req.params;
    const [vitals, allVitals, interventions, medications, narrative, suctionEvents, seizureEvents] = await Promise.all([
      getVitals(visitId),
      getAllVitals(visitId),
      getInterventions(visitId),
      getMedications(visitId),
      getNarrative(visitId),
      getSuctionEvents(visitId),
      getSeizureEvents(visitId),
    ]);
    res.json({
      vitals,
      all_vitals: allVitals,
      interventions,
      medications,
      seizure_events: seizureEvents,
      narrative,
      suction_events: suctionEvents,
    });
  } catch (err) {
    console.error('[visits/summary] Error:', err);
    res.status(500).json({ error: 'Failed to fetch visit summary' });
  }
});

// ─── Patient identification check (regulatory gate) ──────────
//
// The frontend calls GET on visit load to decide whether to show the
// identification modal or skip straight to the visit. POST writes the
// check; the unique constraint on visit_id makes the call idempotent.

router.get('/:visitId/identification', async (req, res) => {
  try {
    const check = await getIdentificationCheck(req.params.visitId);
    if (!check) {
      res.status(404).json({ error: 'No identification check on file' });
      return;
    }
    res.json(check);
  } catch (err) {
    console.error('[visits/identification GET] Error:', err);
    res.status(500).json({ error: 'Failed to fetch identification check' });
  }
});

const ALLOWED_IDENTIFIERS = new Set([
  'full_name', 'dob', 'picture_id', 'address', 'visual',
]);

router.post('/:visitId/identification', async (req, res) => {
  try {
    const { visitId } = req.params;
    const body = req.body ?? {};
    const identifiers = Array.isArray(body.identifiers)
      ? (body.identifiers as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const cleaned = Array.from(new Set(identifiers)).filter((id) => ALLOWED_IDENTIFIERS.has(id));
    if (cleaned.length < 2) {
      res.status(400).json({ error: 'At least 2 identifiers are required.' });
      return;
    }
    const confirmedWith = typeof body.confirmed_with === 'string' && body.confirmed_with.trim()
      ? body.confirmed_with.trim()
      : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    const check = await saveIdentificationCheck(visitId, cleaned, confirmedWith, notes);
    res.json(check);
  } catch (err) {
    console.error('[visits/identification POST] Error:', err);
    res.status(500).json({ error: 'Failed to save identification check' });
  }
});

// ─── Head-to-toe assessment ───────────────────────────────────
// The form definition (systems + exception flags) is served alongside
// the saved values so the frontend renders the exact set of checkboxes
// the backend will validate against. Avoids drift if the two sides ship
// independent edits to the system list.

// ─── Change orders ───────────────────────────────────────────
// Nurse-initiated medication change request. The route enforces:
//   1. A valid change_type (modify dose/route/frequency, discontinue, add)
//   2. A documented source of authority (verbal/pharmacy_label/written_note)
//   3. The source-specific fields the form requires (physician+timestamp
//      for verbal, source_description for the others)
// A field nurse cannot insert a row without a source, even if she
// hand-crafts a POST — matching the meeting note "they do not want
// nurses to be able to modify the dose, route, or otherwise create a
// new order without approval."

router.get('/:visitId/change-orders', async (req, res) => {
  try {
    const rows = await getChangeOrdersForVisit(req.params.visitId);
    res.json(rows);
  } catch (err) {
    console.error('[visits/change-orders GET] Error:', err);
    res.status(500).json({ error: 'Failed to fetch change orders' });
  }
});

router.post('/:visitId/change-orders', async (req, res) => {
  try {
    const { visitId } = req.params;
    const body = req.body ?? {};

    // Resolve the visit so we can stamp patient_id without trusting the
    // client to pass it.
    const ctx = await getVisitWithPatient(visitId);
    if (!ctx) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }

    const changeType = body.change_type;
    if (!VALID_CHANGE_TYPES.includes(changeType)) {
      res.status(400).json({ error: `change_type must be one of ${VALID_CHANGE_TYPES.join(', ')}` });
      return;
    }
    const sourceType = body.source_type;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
      res.status(400).json({ error: `source_type must be one of ${VALID_SOURCE_TYPES.join(', ')}` });
      return;
    }
    // Source-specific minimums — these are the bare requirements for a
    // legitimate physician order on file. Loose now; tighten if Renee
    // calls out a gap.
    if (sourceType === 'verbal') {
      if (!body.source_physician || !body.source_obtained_at) {
        res.status(400).json({ error: 'Verbal orders require physician and obtained-at timestamp.' });
        return;
      }
    } else if (!body.source_description || String(body.source_description).trim() === '') {
      res.status(400).json({ error: 'Pharmacy label and written-note sources require a description.' });
      return;
    }
    if (!body.medication_name || String(body.medication_name).trim() === '') {
      res.status(400).json({ error: 'medication_name is required.' });
      return;
    }

    const row = await saveChangeOrder({
      visit_id: visitId,
      patient_id: ctx.patient.id,
      scheduled_task_id: body.scheduled_task_id ?? null,
      medication_name: String(body.medication_name).trim(),
      change_type: changeType,
      old_dose: body.old_dose ?? null,
      old_route: body.old_route ?? null,
      old_frequency: body.old_frequency ?? null,
      new_dose: body.new_dose ?? null,
      new_route: body.new_route ?? null,
      new_frequency: body.new_frequency ?? null,
      new_concentration: body.new_concentration ?? null,
      new_indication: body.new_indication ?? null,
      new_instructions: body.new_instructions ?? null,
      reason: body.reason ?? null,
      source_type: sourceType,
      source_physician: body.source_physician ?? null,
      source_obtained_at: body.source_obtained_at ?? null,
      source_description: body.source_description ?? null,
      initiated_by_nurse_id: ctx.visit.nurse_id,
      notes: body.notes ?? null,
    });

    // Fax pipeline stub — in production this is where the integration
    // call would happen. For the POC we just log so the demo can show a
    // "would have faxed" trail without touching real infra.
    console.log(`[fax stub] would have faxed change order ${row.id} (${row.medication_name} · ${row.change_type}) for signature`);

    res.json(row);
  } catch (err) {
    console.error('[visits/change-orders POST] Error:', err);
    res.status(500).json({ error: 'Failed to save change order' });
  }
});

router.post('/:visitId/change-orders/:changeOrderId/mark-signed', async (req, res) => {
  try {
    const row = await markChangeOrderSigned(req.params.changeOrderId);
    if (!row) {
      res.status(404).json({ error: 'Change order not found or not pending signature.' });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error('[visits/change-orders POST mark-signed] Error:', err);
    res.status(500).json({ error: 'Failed to mark change order signed' });
  }
});

// ─── Seizure events ──────────────────────────────────────────
// One row per event. The Activity Timeline and Seizure Log Sheet read
// the GET; the form + Aria voice both POST. Mid-shift triggerable —
// no "schedule slot" required because seizures aren't pre-planned.

router.get('/:visitId/seizure-events', async (req, res) => {
  try {
    const events = await getSeizureEvents(req.params.visitId);
    res.json(events);
  } catch (err) {
    console.error('[visits/seizure-events GET] Error:', err);
    res.status(500).json({ error: 'Failed to fetch seizure events' });
  }
});

router.post('/:visitId/seizure-events', async (req, res) => {
  try {
    const { visitId } = req.params;
    const body = req.body ?? {};
    // occurred_at from the form arrives as HH:MM — synthesize an ISO
    // anchored to today so the timeline sorts cleanly alongside other
    // events. Aria sends full ISO already; pass-through in that case.
    let occurredAt = typeof body.occurred_at === 'string' ? body.occurred_at : '';
    if (/^\d{2}:\d{2}$/.test(occurredAt)) {
      const today = new Date().toISOString().slice(0, 10);
      occurredAt = `${today}T${occurredAt}:00`;
    }
    const event = await saveSeizureEvent(visitId, {
      occurred_at: occurredAt,
      duration_seconds: body.duration_seconds,
      seizure_type: body.seizure_type,
      loc: body.loc,
      intervention: body.intervention,
      notes: body.notes,
    });
    res.json(event);
  } catch (err) {
    console.error('[visits/seizure-events POST] Error:', err);
    res.status(500).json({ error: 'Failed to save seizure event' });
  }
});

router.get('/:visitId/head-to-toe', async (req, res) => {
  try {
    const assessment = await getHeadToToe(req.params.visitId);
    res.json({ systems_def: HEAD_TO_TOE_SYSTEMS, assessment });
  } catch (err) {
    console.error('[visits/head-to-toe GET] Error:', err);
    res.status(500).json({ error: 'Failed to fetch head-to-toe assessment' });
  }
});

router.post('/:visitId/head-to-toe', async (req, res) => {
  try {
    const { visitId } = req.params;
    const body = req.body ?? {};
    const mode = body.mode === 'checklist' ? 'checklist' : 'wdl';
    const rawSystems = (body.systems && typeof body.systems === 'object') ? body.systems : {};

    // Normalize: only accept known system ids; coerce each field shape
    // so a malformed client payload never lands as junk in the JSONB.
    const knownIds = new Set(HEAD_TO_TOE_SYSTEM_IDS);
    const systems: Record<string, { wdl: boolean; exceptions: string[]; notes: string; details?: Record<string, unknown> }> = {};
    for (const [id, val] of Object.entries(rawSystems as Record<string, unknown>)) {
      if (!knownIds.has(id) || !val || typeof val !== 'object') continue;
      const v = val as Record<string, unknown>;
      systems[id] = {
        wdl: v.wdl === true,
        exceptions: Array.isArray(v.exceptions)
          ? (v.exceptions as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
        notes: typeof v.notes === 'string' ? v.notes : '',
        ...(v.details && typeof v.details === 'object' ? { details: v.details as Record<string, unknown> } : {}),
      };
    }

    // At least one system finding must be present — otherwise the form
    // is empty and the assessment is meaningless.
    if (Object.keys(systems).length === 0) {
      res.status(400).json({ error: 'At least one system finding is required.' });
      return;
    }

    const summaryNotes = typeof body.summary_notes === 'string' && body.summary_notes.trim()
      ? body.summary_notes.trim()
      : null;
    const saved = await saveHeadToToe(visitId, mode, systems, summaryNotes);
    res.json(saved);
  } catch (err) {
    console.error('[visits/head-to-toe POST] Error:', err);
    res.status(500).json({ error: 'Failed to save head-to-toe assessment' });
  }
});

router.get('/:visitId/history', async (req, res) => {
  try {
    const { visitId } = req.params;
    const rows = await getConversationHistory(visitId);

    // Convert DB rows to frontend-friendly chat messages
    // Only return user + assistant text messages (skip tool_use/tool_result internals)
    const messages = rows
      .filter((r) => (r.role === 'user' || r.role === 'assistant') && r.content)
      .map((r) => ({
        id: r.id,
        role: r.role === 'user' ? 'nurse' : 'agent',
        content: r.content,
        timestamp: r.created_at,
      }));

    res.json(messages);
  } catch (err) {
    console.error('[visits/history] Error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── Scheduled tasks for a patient ───────────────────────────

router.get('/:visitId/schedule', async (req, res) => {
  try {
    const { visitId } = req.params;
    const visitData = await getVisitWithPatient(visitId);
    if (!visitData) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }
    const tasks = await getScheduledTasks(visitData.patient.id);
    res.json(tasks);
  } catch (err) {
    console.error('[visits/schedule] Error:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// ─── Direct save endpoints (from quick action forms) ─────────

router.post('/:visitId/vitals', async (req, res) => {
  try {
    const row = await saveVitals(req.params.visitId, req.body);
    res.json(row);
  } catch (err) {
    console.error('[visits/vitals] Error:', err);
    res.status(500).json({ error: 'Failed to save vitals' });
  }
});

router.post('/:visitId/interventions', async (req, res) => {
  try {
    const row = await saveIntervention(req.params.visitId, req.body);
    res.json(row);
  } catch (err) {
    console.error('[visits/interventions] Error:', err);
    res.status(500).json({ error: 'Failed to save intervention' });
  }
});

router.post('/:visitId/suction-events', async (req, res) => {
  try {
    const row = await saveSuctionEvent(req.params.visitId, req.body);
    res.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save suction event';
    console.error('[visits/suction-events] Error:', msg);
    // 400 for validation failures (route enum, missing time), 500 otherwise.
    const isValidation = /Invalid suction route|occurred_at is required/.test(msg);
    res.status(isValidation ? 400 : 500).json({ error: msg });
  }
});

router.post('/:visitId/medications', async (req, res) => {
  try {
    const row = await saveMedication(req.params.visitId, req.body);
    res.json(row);
  } catch (err) {
    console.error('[visits/medications] Error:', err);
    res.status(500).json({ error: 'Failed to save medication' });
  }
});

router.post('/:visitId/narrative', async (req, res) => {
  try {
    const row = await upsertNarrative(
      req.params.visitId,
      req.body.content,
      req.body.patient_tolerated_ok,
      req.body.patient_tolerated_notes,
    );
    res.json(row);
  } catch (err) {
    console.error('[visits/narrative] Error:', err);
    res.status(500).json({ error: 'Failed to save narrative' });
  }
});

// ─── Excel Export ────────────────────────────────────────────

router.get('/:visitId/export', async (req, res) => {
  try {
    const { visitId } = req.params;

    const [visitData, allVitals, interventions, medications, narrative] = await Promise.all([
      getVisitWithPatient(visitId),
      getAllVitals(visitId),
      getInterventions(visitId),
      getMedications(visitId),
      getNarrative(visitId),
    ]);

    if (!visitData) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }

    const { patient, visit } = visitData;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nurse Visit Assistant';
    wb.created = new Date();

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      },
    };

    const labelStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 10, color: { argb: 'FF6B7280' } },
    };

    // ── Sheet 1: Visit Overview ──
    const overviewSheet = wb.addWorksheet('Visit Overview');
    overviewSheet.columns = [
      { header: '', key: 'label', width: 25 },
      { header: '', key: 'value', width: 45 },
    ];

    const overviewRows = [
      ['Patient Name', patient.full_name],
      ['Patient ID', patient.kantime_patient_id],
      ['Date of Birth', patient.date_of_birth],
      ['Age', patient.age_months ? `${patient.age_months} months` : `${patient.age_years} years`],
      ['Diagnosis', patient.primary_diagnosis],
      ['CPR Code', patient.cpr_code],
      ['Allergies', patient.allergies.join(', ')],
      ['', ''],
      ['Visit Date', visit.visit_date],
      ['Scheduled Time', `${visit.planned_start_time} – ${visit.planned_end_time}`],
      ['Service Type', visit.service_type],
      ['Payer', visit.payer],
      ['Status', visit.status],
      ['', ''],
      ['Emergency Contact', `${patient.emergency_contact_name} (${patient.emergency_contact_relation})`],
      ['Contact Phone', patient.emergency_contact_phone],
    ];

    overviewRows.forEach(([label, value]) => {
      const row = overviewSheet.addRow({ label, value });
      row.getCell('label').style = labelStyle;
    });

    // ── Sheet 2: Vitals (one row per reading) ──
    const vitalsSheet = wb.addWorksheet('Vitals');
    vitalsSheet.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Recorded At', key: 'recorded_at', width: 22 },
      { header: 'BP (mmHg)', key: 'bp', width: 14 },
      { header: 'HR (bpm)', key: 'hr', width: 12 },
      { header: 'RR (/min)', key: 'rr', width: 12 },
      { header: 'Temp (°F)', key: 'temp', width: 12 },
      { header: 'O2 Sat (%)', key: 'o2', width: 12 },
      { header: 'Weight (lbs)', key: 'weight', width: 14 },
      { header: 'Pain (/10)', key: 'pain', width: 12 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];

    const headerRow1 = vitalsSheet.getRow(1);
    headerRow1.eachCell((cell) => { cell.style = headerStyle; });

    if (allVitals.length > 0) {
      allVitals.forEach((v, i) => {
        vitalsSheet.addRow({
          num: i + 1,
          recorded_at: v.recorded_at,
          bp: v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '',
          hr: v.heart_rate ?? '',
          rr: v.respiratory_rate ?? '',
          temp: v.temperature_f ?? '',
          o2: v.o2_saturation ?? '',
          weight: v.weight_lbs ?? '',
          pain: v.pain_score ?? '',
          notes: v.notes ?? '',
        });
      });
    } else {
      vitalsSheet.addRow({ num: '', recorded_at: 'No vitals recorded' });
    }

    // ── Sheet 3: Interventions ──
    const intSheet = wb.addWorksheet('Interventions');
    intSheet.columns = [
      { header: 'Intervention', key: 'name', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Outcome', key: 'outcome', width: 35 },
      { header: 'Recorded At', key: 'recorded_at', width: 22 },
    ];

    const headerRow2 = intSheet.getRow(1);
    headerRow2.eachCell((cell) => { cell.style = headerStyle; });

    if (interventions.length > 0) {
      interventions.forEach((i) => {
        intSheet.addRow({
          name: i.name,
          description: i.description ?? '',
          outcome: i.outcome ?? '',
          recorded_at: i.recorded_at,
        });
      });
    } else {
      intSheet.addRow({ name: 'No interventions recorded' });
    }

    // ── Sheet 4: Medications ──
    const medSheet = wb.addWorksheet('Medications');
    medSheet.columns = [
      { header: 'Medication', key: 'name', width: 28 },
      { header: 'Dose', key: 'dose', width: 15 },
      { header: 'Route', key: 'route', width: 15 },
      { header: 'Given', key: 'given', width: 10 },
      { header: 'Reason Withheld', key: 'reason_withheld', width: 30 },
      { header: 'Recorded At', key: 'recorded_at', width: 22 },
    ];

    const headerRow3 = medSheet.getRow(1);
    headerRow3.eachCell((cell) => { cell.style = headerStyle; });

    if (medications.length > 0) {
      medications.forEach((m) => {
        const row = medSheet.addRow({
          name: m.name,
          dose: m.dose ?? '',
          route: m.route ?? '',
          given: m.given ? 'Yes' : 'No',
          reason_withheld: m.reason_withheld ?? '',
          recorded_at: m.recorded_at,
        });
        // Highlight withheld medications
        if (!m.given) {
          row.eachCell((cell) => {
            cell.style = {
              ...cell.style,
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } },
            };
          });
        }
      });
    } else {
      medSheet.addRow({ name: 'No medications recorded' });
    }

    // ── Sheet 5: Narrative ──
    const narrSheet = wb.addWorksheet('Narrative');
    narrSheet.columns = [
      { header: 'Field', key: 'field', width: 25 },
      { header: 'Content', key: 'content', width: 80 },
    ];

    const headerRow4 = narrSheet.getRow(1);
    headerRow4.eachCell((cell) => { cell.style = headerStyle; });

    if (narrative) {
      narrSheet.addRow({ field: 'Narrative', content: narrative.content });
      narrSheet.addRow({
        field: 'Patient Tolerated',
        content: narrative.patient_tolerated_ok == null
          ? 'Not specified'
          : narrative.patient_tolerated_ok
            ? 'Yes'
            : 'No',
      });
      if (narrative.patient_tolerated_notes) {
        narrSheet.addRow({ field: 'Toleration Notes', content: narrative.patient_tolerated_notes });
      }
      narrSheet.addRow({ field: 'Last Updated', content: narrative.updated_at });

      // Wrap the narrative text
      const narrRow = narrSheet.getRow(2);
      narrRow.getCell('content').alignment = { wrapText: true, vertical: 'top' };
      narrRow.height = 80;
    } else {
      narrSheet.addRow({ field: 'No narrative written', content: '' });
    }

    // Generate and send
    const filename = `visit_${patient.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_${visit.visit_date}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[visits/export] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed' });
    }
  }
});

export default router;
