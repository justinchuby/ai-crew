import { Request, Response, NextFunction } from 'express';

/**
 * Origin validation middleware — CSRF protection for localhost servers.
 *
 * CORS only blocks the browser from *reading* cross-origin responses.
 * A malicious page can still *send* state-changing requests (POST, PUT, DELETE)
 * to localhost via simple requests that skip preflight.
 *
 * This middleware rejects state-changing requests whose Origin header
 * doesn't match a localhost pattern, blocking cross-site request forgery.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function originValidation(req: Request, res: Response, next: NextFunction): void {
  // Read-only methods are safe — no CSRF risk
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;

  // No Origin header = same-origin request, curl, or server-to-server — allow
  if (!origin) {
    next();
    return;
  }

  // Validate origin matches localhost
  if (LOCALHOST_RE.test(origin)) {
    next();
    return;
  }

  res.status(403).json({
    error: 'Forbidden: cross-origin request blocked.',
    detail: 'State-changing requests must originate from localhost.',
  });
}
