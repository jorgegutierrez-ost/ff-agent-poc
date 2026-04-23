import { Router } from 'express';
import { getPatients, getPrnOrders } from '../db/queries';

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

export default router;
