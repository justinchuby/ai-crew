import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter. No external dependencies.
 * Limits are per-IP address within a rolling window.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
}): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();
  const { windowMs, max, message } = opts;

  // Periodic cleanup of expired buckets
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs * 2);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }

    bucket.count++;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.status(429).json({
        error: message || 'Too many requests, please try again later.',
      });
      return;
    }

    next();
  };
}
