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
  upsertNarrative,
} from '../db/queries';

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

router.get('/:visitId/summary', async (req, res) => {
  try {
    const { visitId } = req.params;
    const [vitals, interventions, medications, narrative] = await Promise.all([
      getVitals(visitId),
      getInterventions(visitId),
      getMedications(visitId),
      getNarrative(visitId),
    ]);
    res.json({ vitals, interventions, medications, narrative });
  } catch (err) {
    console.error('[visits/summary] Error:', err);
    res.status(500).json({ error: 'Failed to fetch visit summary' });
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
