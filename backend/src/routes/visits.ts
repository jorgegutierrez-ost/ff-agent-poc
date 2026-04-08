import { Router } from 'express';
import {
  getVisitsByNurseId,
  getVitals,
  getInterventions,
  getMedications,
  getNarrative,
  getConversationHistory,
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

export default router;
