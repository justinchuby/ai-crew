import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit } from '../middleware/rateLimit.js';
import type { Request, Response, NextFunction } from 'express';

// ── Mock helpers ──────────────────────────────────────────────────────────

function mockReq(ip = '127.0.0.1'): Partial<Request> {
  return { ip, socket: { remoteAddress: ip } as any };
}

function mockRes(): Partial<Response> & { _status: number; _json: any; _headers: Record<string, string> } {
  const res: any = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    status(code: number) { res._status = code; return res; },
    json(body: any) { res._json = body; return res; },
    setHeader(key: string, val: string) { res._headers[key] = val; },
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 5 });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    limiter(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._headers['X-RateLimit-Limit']).toBe('5');
    expect(res._headers['X-RateLimit-Remaining']).toBe('4');
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    // 2 allowed
    for (let i = 0; i < 2; i++) {
      const res = mockRes();
      limiter(mockReq() as Request, res as Response, next as NextFunction);
      expect(res._status).toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(2);

    // 3rd should be blocked
    const res = mockRes();
    limiter(mockReq() as Request, res as Response, next as NextFunction);
    expect(res._status).toBe(429);
    expect(res._json.error).toContain('Too many requests');
    expect(next).toHaveBeenCalledTimes(2); // not called again
  });

  it('uses custom error message', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: 'Slow down!' });
    const next = vi.fn();

    limiter(mockReq() as Request, mockRes() as Response, next as NextFunction);
    const res = mockRes();
    limiter(mockReq() as Request, res as Response, next as NextFunction);

    expect(res._status).toBe(429);
    expect(res._json.error).toBe('Slow down!');
  });

  it('tracks different IPs independently', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();

    const res1 = mockRes();
    limiter(mockReq('10.0.0.1') as Request, res1 as Response, next as NextFunction);
    expect(res1._status).toBe(200);

    const res2 = mockRes();
    limiter(mockReq('10.0.0.2') as Request, res2 as Response, next as NextFunction);
    expect(res2._status).toBe(200);

    // Same IP over limit
    const res3 = mockRes();
    limiter(mockReq('10.0.0.1') as Request, res3 as Response, next as NextFunction);
    expect(res3._status).toBe(429);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('resets after window expires', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();

    limiter(mockReq() as Request, mockRes() as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    // Over limit
    limiter(mockReq() as Request, mockRes() as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    // Advance past window
    vi.advanceTimersByTime(61_000);

    const res = mockRes();
    limiter(mockReq() as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res._status).toBe(200);
  });

  it('sets correct X-RateLimit headers', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 });
    const next = vi.fn();

    const res1 = mockRes();
    limiter(mockReq() as Request, res1 as Response, next as NextFunction);
    expect(res1._headers['X-RateLimit-Limit']).toBe('3');
    expect(res1._headers['X-RateLimit-Remaining']).toBe('2');
    expect(res1._headers['X-RateLimit-Reset']).toBeDefined();

    const res2 = mockRes();
    limiter(mockReq() as Request, res2 as Response, next as NextFunction);
    expect(res2._headers['X-RateLimit-Remaining']).toBe('1');

    const res3 = mockRes();
    limiter(mockReq() as Request, res3 as Response, next as NextFunction);
    expect(res3._headers['X-RateLimit-Remaining']).toBe('0');

    // Over limit — remaining stays at 0
    const res4 = mockRes();
    limiter(mockReq() as Request, res4 as Response, next as NextFunction);
    expect(res4._headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('falls back to socket.remoteAddress when req.ip is undefined', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();
    const req = { ip: undefined, socket: { remoteAddress: '192.168.1.1' } } as any;

    limiter(req as Request, mockRes() as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });
});
