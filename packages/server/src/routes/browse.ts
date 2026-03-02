import { Router } from 'express';
import { readdirSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, normalize, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AppContext } from './context.js';

export function browseRoutes(_ctx: AppContext): Router {
  const router = Router();

  // --- Filesystem Browse (for folder picker) ---
  // Security: restrict to user's home directory and server cwd to prevent
  // arbitrary filesystem traversal. Rejects null bytes, resolves symlinks,
  // and blocks known sensitive system paths.

  const BROWSE_ALLOWED_ROOTS = [
    normalize(homedir()),
    normalize(process.cwd()),
  ];

  // Sensitive directories that should never be browsable
  const BROWSE_BLOCKED_PATHS = process.platform === 'win32'
    ? [
        'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
        'C:\\ProgramData', 'C:\\Recovery', 'C:\\System Volume Information',
      ]
    : [
        '/etc', '/proc', '/sys', '/dev', '/boot', '/sbin',
        '/var/log', '/var/run', '/private/etc', '/private/var',
      ];

  function isPathAllowed(targetPath: string): { allowed: boolean; reason?: string } {
    // Block null bytes (injection vector)
    if (targetPath.includes('\0')) {
      return { allowed: false, reason: 'Invalid path: contains null bytes' };
    }

    const normalized = normalize(targetPath);

    // Block sensitive system paths
    for (const blocked of BROWSE_BLOCKED_PATHS) {
      if (normalized === blocked || normalized.startsWith(blocked + sep)) {
        return { allowed: false, reason: 'Access denied: system directory' };
      }
    }

    // Must be under an allowed root
    const underAllowedRoot = BROWSE_ALLOWED_ROOTS.some(
      (root) => normalized === root || normalized.startsWith(root + sep),
    );
    if (!underAllowedRoot) {
      return { allowed: false, reason: 'Access denied: path outside allowed directories' };
    }

    return { allowed: true };
  }

  router.get('/browse', (req, res) => {
    const dir = typeof req.query.path === 'string' ? req.query.path : process.cwd();

    // Reject null bytes before any path operations
    if (dir.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    let resolved: string;
    try {
      // Resolve symlinks to get the real path (prevents symlink-based escapes)
      resolved = realpathSync(resolve(dir));
    } catch {
      res.status(400).json({ error: 'Path does not exist' });
      return;
    }

    const check = isPathAllowed(resolved);
    if (!check.allowed) {
      res.status(403).json({ error: check.reason });
      return;
    }

    try {
      const entries = readdirSync(resolved, { withFileTypes: true });
      const folders = entries
        .filter((e) => {
          if (!e.isDirectory() || e.name.startsWith('.')) return false;
          // Pre-check child path is also allowed (filters out entries that
          // would lead to blocked areas if the current dir is near a boundary)
          const childPath = join(resolved, e.name);
          return isPathAllowed(childPath).allowed;
        })
        .map((e) => ({ name: e.name, path: join(resolved, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // Only offer parent navigation if it's within allowed roots
      const parentDir = dirname(resolved);
      const parentAllowed = isPathAllowed(parentDir).allowed ? parentDir : null;
      res.json({ current: resolved, parent: parentAllowed, folders });
    } catch (err: any) {
      res.status(400).json({ error: `Cannot read directory: ${err.message}`, current: resolved });
    }
  });

  return router;
}
