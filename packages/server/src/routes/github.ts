import { Router } from 'express';
import type { AppContext } from './context.js';
import { GitHubIntegrationService } from '../coordination/GitHubIntegrationService.js';

export function githubRoutes(ctx: AppContext): Router {
  const service = new GitHubIntegrationService(ctx.db);
  const router = Router();

  // GET /github/status — connection status
  router.get('/github/status', (_req, res) => {
    const conn = service.getConnection();
    res.json({ connection: conn });
  });

  // POST /github/connect — establish connection
  router.post('/github/connect', async (req, res) => {
    const { token, owner, repo } = req.body as { token?: string; owner?: string; repo?: string };
    if (!token) return res.status(400).json({ error: 'Missing required field: token' });
    if (!owner) return res.status(400).json({ error: 'Missing required field: owner' });
    if (!repo) return res.status(400).json({ error: 'Missing required field: repo' });

    try {
      const connection = await service.connect(token, owner, repo);
      res.json({ connection });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // POST /github/disconnect — remove connection
  router.post('/github/disconnect', (_req, res) => {
    service.disconnect();
    res.json({ status: 'ok' });
  });

  // POST /github/test — test connection
  router.post('/github/test', async (_req, res) => {
    const result = await service.testConnection();
    res.json(result);
  });

  // GET /github/pulls — list PRs
  router.get('/github/pulls', (_req, res) => {
    res.json({ pulls: service.getPulls() });
  });

  // POST /github/pulls — create PR
  router.post('/github/pulls', async (req, res) => {
    try {
      const pr = await service.createPR(req.body);
      res.status(201).json(pr);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // GET /github/pulls/:number — get single PR
  router.get('/github/pulls/:number', (req, res) => {
    const num = parseInt(req.params.number, 10);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid PR number' });
    const pr = service.getPull(num);
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    res.json(pr);
  });

  // POST /github/pulls/:number/ready — mark PR ready for review
  router.post('/github/pulls/:number/ready', async (req, res) => {
    const num = parseInt(req.params.number, 10);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid PR number' });
    try {
      const pr = await service.markReady(num);
      if (!pr) return res.status(404).json({ error: 'PR not found' });
      res.json(pr);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /github/pulls/:number/checks — CI checks for PR
  router.get('/github/pulls/:number/checks', async (req, res) => {
    const num = parseInt(req.params.number, 10);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid PR number' });
    try {
      const checks = await service.getChecks(num);
      res.json({ checks });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /commits — session commit links
  router.get('/commits', (_req, res) => {
    res.json({ commits: service.getCommitLinks() });
  });

  // GET /commits/by-task/:taskId — commits for a specific task
  router.get('/commits/by-task/:taskId', (req, res) => {
    res.json({ commits: service.getCommitsByTask(req.params.taskId) });
  });

  // POST /commits — add commit link
  router.post('/commits', (req, res) => {
    const { sha, message, agentId, taskId, timestamp } = req.body;
    if (!sha) return res.status(400).json({ error: 'Missing required field: sha' });
    service.addCommitLink({
      sha,
      message: message || '',
      agentId: agentId || null,
      taskId: taskId || null,
      timestamp: timestamp || new Date().toISOString(),
    });
    res.status(201).json({ ok: true });
  });

  return router;
}
