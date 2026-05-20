import { Router } from 'express';
import {
  getPatients,
  getPatientById,
  getPrnOrders,
  getPatientRecentBrief,
} from '../db/queries';
import { buildRecapHighlights, thresholdsFor } from '../agent/recapHighlights';
import { getChangeOrdersForPatient } from '../db/queries';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const patients = await getPatients();
    res.json(patients);
  } catch (err) {
    console.error('[patients] Error:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

router.get('/:patientId/prn-orders', async (req, res) => {
  try {
    const orders = await getPrnOrders(req.params.patientId);
    res.json(orders);
  } catch (err) {
    console.error('[patients/prn-orders] Error:', err);
    res.status(500).json({ error: 'Failed to fetch PRN orders' });
  }
});

// Computed recap of the patient's recent shifts for the LastShiftHighlights
// card. Excludes the in-progress visit if `excludeVisitId` is supplied so the
// card never echoes back what just happened in the open visit.
router.get('/:patientId/recent-brief', async (req, res) => {
  try {
    const { patientId } = req.params;
    const excludeVisitId = typeof req.query.excludeVisitId === 'string' ? req.query.excludeVisitId : undefined;

    const [patient, brief, prnOrders] = await Promise.all([
      getPatientById(patientId),
      getPatientRecentBrief(patientId, { excludeVisitId }),
      getPrnOrders(patientId),
    ]);

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const highlights = buildRecapHighlights(
      brief,
      patient,
      prnOrders.map((o) => o.medication),
    );

    res.json({
      highlights,
      visitsScanned: brief.length,
    });
  } catch (err) {
    console.error('[patients/recent-brief] Error:', err);
    res.status(500).json({ error: 'Failed to fetch recent brief' });
  }
});

// Raw recent vital readings + patient-appropriate thresholds. Powers
// the in-form pre-submit warnings on VitalsForm: the form needs both
// (a) the absolute range for this patient's age and (b) the last few
// readings so it can flag a sudden change or a trend. Reuses the same
// /recent-brief query path so the dataset matches what Aria sees.
router.get('/:patientId/recent-vitals', async (req, res) => {
  try {
    const { patientId } = req.params;
    const daysParam = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : NaN;
    const daysBack = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 30) : 3;

    const [patient, brief] = await Promise.all([
      getPatientById(patientId),
      getPatientRecentBrief(patientId, { daysBack }),
    ]);

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    // Flatten visit → readings; preserve chronological order (most
    // recent first to match brief, but reverse so trend math reads
    // left-to-right oldest→newest at the frontend).
    const readings: Array<{ visit_date: string; reading: unknown }> = [];
    for (const v of brief) {
      for (const r of v.vitals) {
        readings.push({ visit_date: v.visit_date, reading: r });
      }
    }
    readings.reverse();

    res.json({
      thresholds: thresholdsFor(patient),
      readings,
    });
  } catch (err) {
    console.error('[patients/recent-vitals] Error:', err);
    res.status(500).json({ error: 'Failed to fetch recent vitals' });
  }
});

// Pending change orders for the patient sidebar. Filtered to
// "documentable" statuses (pending_signature + signed) so the field
// nurse sees what's currently in play for this patient.
router.get('/:patientId/change-orders', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await getChangeOrdersForPatient(req.params.patientId,
      status === 'pending_signature' || status === 'signed'
        ? { status }
        : {},
    );
    res.json(rows);
  } catch (err) {
    console.error('[patients/change-orders] Error:', err);
    res.status(500).json({ error: 'Failed to fetch change orders' });
  }
});

export default router;
