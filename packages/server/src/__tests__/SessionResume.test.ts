import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../db/database.js';
import { ProjectRegistry } from '../projects/ProjectRegistry.js';

describe('Session Resume', () => {
  let db: Database;
  let registry: ProjectRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new ProjectRegistry(db);
  });

  describe('getSessionById', () => {
    it('returns a session by its row ID', () => {
      const project = registry.create('Session Lookup');
      registry.startSession(project.id, 'lead-s', 'Find me');

      const allSessions = registry.getSessions(project.id);
      const found = registry.getSessionById(allSessions[0].id);
      expect(found).toBeDefined();
      expect(found!.leadId).toBe('lead-s');
      expect(found!.task).toBe('Find me');
    });

    it('returns undefined for non-existent row ID', () => {
      expect(registry.getSessionById(99999)).toBeUndefined();
    });
  });

  describe('resume flow integration', () => {
    it('full lifecycle: create → start → set sessionId → end → get by ID → claim', () => {
      const project = registry.create('Full Lifecycle', 'Testing resume flow');
      registry.startSession(project.id, 'lead-lifecycle', 'Implement feature');
      registry.setSessionId('lead-lifecycle', 'copilot-lifecycle-session');
      registry.endSession('lead-lifecycle', 'completed');

      // Look it up by row ID
      const sessions = registry.getSessions(project.id);
      const session = registry.getSessionById(sessions[0].id);
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe('copilot-lifecycle-session');

      // Get the project for context
      const sessionProject = registry.get(session!.projectId);
      expect(sessionProject).toBeDefined();
      expect(sessionProject!.name).toBe('Full Lifecycle');
    });

    it('preserves role across session resume', () => {
      const project = registry.create('Role Test');
      registry.startSession(project.id, 'agent-1', 'Do work', 'developer');
      registry.setSessionId('agent-1', 'sess-dev');
      registry.endSession('agent-1', 'completed');

      const sessions = registry.getSessions(project.id);
      const session = registry.getSessionById(sessions[0].id);
      expect(session!.role).toBe('developer');
    });

    it('defaults to lead role when not specified', () => {
      const project = registry.create('Default Role');
      registry.startSession(project.id, 'lead-def', 'Lead work');
      registry.setSessionId('lead-def', 'sess-lead');
      registry.endSession('lead-def', 'completed');

      const sessions = registry.getSessions(project.id);
      expect(sessions[0].role).toBe('lead');
    });
  });

  describe('claimSessionForResume', () => {
    it('claims a completed session and returns true', () => {
      const project = registry.create('Claim Test');
      registry.startSession(project.id, 'lead-claim', 'Work');
      registry.setSessionId('lead-claim', 'sess-claim');
      registry.endSession('lead-claim', 'completed');

      const sessions = registry.getSessions(project.id);
      expect(registry.claimSessionForResume(sessions[0].id)).toBe(true);

      // Verify status changed to 'resuming'
      const updated = registry.getSessionById(sessions[0].id);
      expect(updated!.status).toBe('resuming');
    });

    it('rejects claim on active session', () => {
      const project = registry.create('Active Claim');
      registry.startSession(project.id, 'lead-active', 'Work');

      const allSessions = registry.getSessions(project.id);
      expect(registry.claimSessionForResume(allSessions[0].id)).toBe(false);
    });

    it('rejects double-claim (race condition guard)', () => {
      const project = registry.create('Race Test');
      registry.startSession(project.id, 'lead-race', 'Work');
      registry.setSessionId('lead-race', 'sess-race');
      registry.endSession('lead-race', 'completed');

      const sessions = registry.getSessions(project.id);
      // First claim succeeds
      expect(registry.claimSessionForResume(sessions[0].id)).toBe(true);
      // Second claim fails — already 'resuming'
      expect(registry.claimSessionForResume(sessions[0].id)).toBe(false);
    });
  });
});
