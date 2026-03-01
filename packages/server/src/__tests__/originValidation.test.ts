import { describe, it, expect, vi, beforeEach } from 'vitest';
import { originValidation } from '../middleware/originValidation.js';
import type { Request, Response, NextFunction } from 'express';

function mockReq(method: string, origin?: string): Request {
  return {
    method,
    headers: origin ? { origin } : {},
  } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: any } {
  const res = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res as any;
}

describe('originValidation middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  // ── Safe methods always pass ──────────────────────────────────────

  it('allows GET requests regardless of origin', () => {
    originValidation(mockReq('GET', 'https://evil.com'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows HEAD requests regardless of origin', () => {
    originValidation(mockReq('HEAD', 'https://evil.com'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows OPTIONS requests regardless of origin', () => {
    originValidation(mockReq('OPTIONS', 'https://evil.com'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  // ── No origin header (same-origin, curl, etc.) ────────────────────

  it('allows POST with no origin header (same-origin / curl)', () => {
    originValidation(mockReq('POST'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows DELETE with no origin header', () => {
    originValidation(mockReq('DELETE'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  // ── Valid localhost origins ────────────────────────────────────────

  it('allows POST from http://localhost:3000', () => {
    originValidation(mockReq('POST', 'http://localhost:3000'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows POST from http://localhost:5173', () => {
    originValidation(mockReq('POST', 'http://localhost:5173'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows PUT from http://127.0.0.1:3001', () => {
    originValidation(mockReq('PUT', 'http://127.0.0.1:3001'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows DELETE from http://localhost (no port)', () => {
    originValidation(mockReq('DELETE', 'http://localhost'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows PATCH from https://localhost:443', () => {
    originValidation(mockReq('PATCH', 'https://localhost:443'), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  // ── Blocked cross-origin requests ─────────────────────────────────

  it('blocks POST from https://evil.com', () => {
    const res = mockRes();
    originValidation(mockReq('POST', 'https://evil.com'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('cross-origin');
  });

  it('blocks DELETE from https://attacker.example.org', () => {
    const res = mockRes();
    originValidation(mockReq('DELETE', 'https://attacker.example.org'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('blocks PUT from http://192.168.1.100:3001', () => {
    const res = mockRes();
    originValidation(mockReq('PUT', 'http://192.168.1.100:3001'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('blocks PATCH from http://localhost.evil.com', () => {
    const res = mockRes();
    originValidation(mockReq('PATCH', 'http://localhost.evil.com'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('blocks POST from http://127.0.0.2:3001 (not 127.0.0.1)', () => {
    const res = mockRes();
    originValidation(mockReq('POST', 'http://127.0.0.2:3001'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
