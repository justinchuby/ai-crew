import { Router } from 'express';
import type { AppContext } from './context.js';
import { SessionReplay } from '../coordination/SessionReplay.js';

export function replayRoutes(ctx: AppContext): Router {
  const { agentManager, activityLedger, decisionLog, lockRegistry } = ctx;
  const router = Router();

  // Lazy-init: only create SessionReplay if all deps are available
  let replay: SessionReplay | null = null;
  function getReplay(): SessionReplay | null {
    if (replay) return replay;
    const taskDAG = agentManager.getTaskDAG?.();
    if (!taskDAG || !activityLedger || !decisionLog || !lockRegistry) return null;
    replay = new SessionReplay(activityLedger, taskDAG, decisionLog, lockRegistry);
    return replay;
  }

  // GET /api/replay/:leadId/state?at=<ISO-timestamp>
  router.get('/replay/:leadId/state', (req, res) => {
    const r = getReplay();
    if (!r) return res.status(503).json({ error: 'Replay service not available' });

    const timestamp = req.query.at as string;
    if (!timestamp) return res.status(400).json({ error: 'Missing required query param: at (ISO timestamp)' });

    try {
      const state = r.getWorldStateAt(req.params.leadId, timestamp);
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: 'Failed to reconstruct state', detail: (err as Error).message });
    }
  });

  // GET /api/replay/:leadId/events?from=<ISO>&to=<ISO>&types=<csv>
  router.get('/replay/:leadId/events', (req, res) => {
    const r = getReplay();
    if (!r) return res.status(503).json({ error: 'Replay service not available' });

    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) return res.status(400).json({ error: 'Missing required query params: from, to (ISO timestamps)' });

    const types = req.query.types ? (req.query.types as string).split(',').map(t => t.trim()) : undefined;

    try {
      const events = r.getEventsInRange(req.params.leadId, from, to, types);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: 'Failed to query events', detail: (err as Error).message });
    }
  });

  // GET /api/replay/:leadId/keyframes
  router.get('/replay/:leadId/keyframes', (req, res) => {
    const r = getReplay();
    if (!r) return res.status(503).json({ error: 'Replay service not available' });

    try {
      const keyframes = r.getKeyframes(req.params.leadId);
      res.json({ keyframes });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get keyframes', detail: (err as Error).message });
    }
  });

  return router;
}
