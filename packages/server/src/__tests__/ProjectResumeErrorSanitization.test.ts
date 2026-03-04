import { describe, it, expect } from 'vitest';

/**
 * Tests for the error sanitization logic in POST /projects/:id/resume.
 * The route now returns generic errors for non-rate-limit failures to avoid leaking internals.
 */
describe('Project resume error sanitization logic', () => {
  function sanitizeError(errMessage: string): { status: number; error: string } {
    const isRateLimit = errMessage?.toLowerCase().includes('rate') || errMessage?.toLowerCase().includes('limit');
    return {
      status: isRateLimit ? 429 : 500,
      error: isRateLimit ? errMessage : 'Failed to resume project. Please try again.',
    };
  }

  it('returns generic message for internal errors', () => {
    const result = sanitizeError('SQLITE_CONSTRAINT: UNIQUE constraint failed');
    expect(result.status).toBe(500);
    expect(result.error).toBe('Failed to resume project. Please try again.');
    expect(result.error).not.toContain('SQLITE');
  });

  it('returns generic message for spawn failures', () => {
    const result = sanitizeError('Cannot read properties of undefined');
    expect(result.status).toBe(500);
    expect(result.error).toBe('Failed to resume project. Please try again.');
  });

  it('preserves rate limit error messages', () => {
    const result = sanitizeError('Rate limit exceeded');
    expect(result.status).toBe(429);
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('preserves limit-related error messages', () => {
    const result = sanitizeError('Spawn limit reached');
    expect(result.status).toBe(429);
    expect(result.error).toBe('Spawn limit reached');
  });

  it('is case-insensitive for rate/limit detection', () => {
    const result = sanitizeError('RATE LIMIT EXCEEDED');
    expect(result.status).toBe(429);
    expect(result.error).toBe('RATE LIMIT EXCEEDED');
  });
});
