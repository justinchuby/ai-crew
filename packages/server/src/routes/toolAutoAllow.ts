/**
 * Tool Auto-Allow API routes.
 *
 * Server-side per-tool-type "always allow" management.
 * GET  /tool-auto-allow          — list all auto-allowed tool names
 * POST /tool-auto-allow/:toolName — mark a tool type as auto-allowed
 * DELETE /tool-auto-allow/:toolName — remove auto-allow for a tool type
 */
import { Router } from 'express';
import type { AppContext } from './context.js';

export function toolAutoAllowRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get('/tool-auto-allow', (_req, res) => {
    if (!ctx.toolAutoAllowStore) return res.status(500).json({ error: 'Tool auto-allow not available' });
    res.json({ tools: ctx.toolAutoAllowStore.listAutoAllowed() });
  });

  router.post('/tool-auto-allow/:toolName', (req, res) => {
    if (!ctx.toolAutoAllowStore) return res.status(500).json({ error: 'Tool auto-allow not available' });
    const { toolName } = req.params;
    if (!toolName || toolName.length > 200) return res.status(400).json({ error: 'Invalid tool name' });
    ctx.toolAutoAllowStore.setAutoAllow(toolName, true);
    res.json({ toolName, autoAllow: true });
  });

  router.delete('/tool-auto-allow/:toolName', (req, res) => {
    if (!ctx.toolAutoAllowStore) return res.status(500).json({ error: 'Tool auto-allow not available' });
    const { toolName } = req.params;
    if (!toolName) return res.status(400).json({ error: 'Invalid tool name' });
    ctx.toolAutoAllowStore.setAutoAllow(toolName, false);
    res.json({ toolName, autoAllow: false });
  });

  return router;
}
