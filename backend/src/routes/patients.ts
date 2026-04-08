import { Router } from 'express';
import { getPatients } from '../db/queries';

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

export default router;
