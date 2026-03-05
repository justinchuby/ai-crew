import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionBadge } from '../VersionBadge';

// Vite replaces __APP_VERSION__ and __GIT_HASH__ via AST substitution at build time.
// In tests, these globals don't go through Vite, so we simulate them by
// mutating globalThis before each test and restoring afterwards.
const originalVersion = globalThis.__APP_VERSION__;
const originalHash = globalThis.__GIT_HASH__;

function setGlobals(version: string, hash: string) {
  (globalThis as any).__APP_VERSION__ = version;
  (globalThis as any).__GIT_HASH__ = hash;
}

beforeEach(() => {
  setGlobals('1.0.0', 'abc1234');
});

afterEach(() => {
  (globalThis as any).__APP_VERSION__ = originalVersion;
  (globalThis as any).__GIT_HASH__ = originalHash;
});

// Vitest runs with import.meta.env.DEV = true, so these tests exercise
// dev-mode behavior by default. Production behavior (DEV = false) is
// verified by the Vite production build where import.meta.env.DEV is
// statically replaced with false.

describe('VersionBadge', () => {
  describe('in dev mode (import.meta.env.DEV = true)', () => {
    it('shows hash for stable version in dev mode', () => {
      setGlobals('1.2.3', 'def5678');
      render(<VersionBadge />);
      expect(screen.getByText('v1.2.3 (def5678)')).toBeDefined();
    });

    it('shows hash for pre-release version in dev mode', () => {
      setGlobals('1.2.3-dev', 'abc1234');
      render(<VersionBadge />);
      expect(screen.getByText('v1.2.3-dev (abc1234)')).toBeDefined();
    });

    it('shows hash for alpha pre-release', () => {
      setGlobals('0.5.0-alpha.1', 'bbb2222');
      render(<VersionBadge />);
      expect(screen.getByText('v0.5.0-alpha.1 (bbb2222)')).toBeDefined();
    });

    it('shows hash for beta pre-release', () => {
      setGlobals('3.0.0-beta', 'ccc3333');
      render(<VersionBadge />);
      expect(screen.getByText('v3.0.0-beta (ccc3333)')).toBeDefined();
    });
  });

  describe('hash unavailable', () => {
    it('hides hash when git hash is "unknown"', () => {
      setGlobals('1.0.0-dev', 'unknown');
      render(<VersionBadge />);
      const badge = screen.getByText('v1.0.0-dev');
      expect(badge.textContent).not.toContain('unknown');
    });

    it('hides hash when git hash is empty', () => {
      setGlobals('1.0.0', '');
      render(<VersionBadge />);
      expect(screen.getByText('v1.0.0')).toBeDefined();
    });

    it('shows version only when both fallbacks are active', () => {
      setGlobals('0.0.0', 'unknown');
      render(<VersionBadge />);
      expect(screen.getByText('v0.0.0')).toBeDefined();
    });
  });

  describe('common behavior', () => {
    it('has a title attribute with full version info', () => {
      setGlobals('1.0.0', 'xyz9999');
      render(<VersionBadge />);
      const badge = screen.getByText('v1.0.0 (xyz9999)');
      expect(badge.getAttribute('title')).toBe('Version 1.0.0 — xyz9999');
    });

    it('renders with muted text styling', () => {
      render(<VersionBadge />);
      const badge = screen.getByText('v1.0.0 (abc1234)');
      expect(badge.className).toContain('text-th-text-muted');
      expect(badge.className).toContain('text-[11px]');
    });
  });
});
