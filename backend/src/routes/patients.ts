import { Router } from 'express';
import {
  getPatients,
  getPatientById,
  getPrnOrders,
  getPatientRecentBrief,
} from '../db/queries';
import { buildRecapHighlights } from '../agent/recapHighlights';

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

export default router;
