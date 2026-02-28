import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../db/database.js';
import { ProjectRegistry } from '../projects/ProjectRegistry.js';

describe('ProjectRegistry', () => {
  let db: Database;
  let registry: ProjectRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new ProjectRegistry(db);
  });

  describe('create', () => {
    it('creates a project with default values', () => {
      const project = registry.create('Test Project');
      expect(project.id).toBeTruthy();
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('');
      expect(project.status).toBe('active');
    });

    it('creates a project with description and cwd', () => {
      const project = registry.create('My Project', 'Build a thing', '/home/user/code');
      expect(project.description).toBe('Build a thing');
      expect(project.cwd).toBe('/home/user/code');
    });
  });

  describe('get', () => {
    it('returns the project by ID', () => {
      const created = registry.create('Lookup Test');
      const found = registry.get(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Lookup Test');
    });

    it('returns undefined for unknown ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('lists all projects', () => {
      registry.create('First');
      registry.create('Second');
      const all = registry.list();
      expect(all).toHaveLength(2);
      const names = all.map(p => p.name).sort();
      expect(names).toEqual(['First', 'Second']);
    });

    it('filters by status', () => {
      const p1 = registry.create('Active');
      const p2 = registry.create('Archived');
      registry.update(p2.id, { status: 'archived' });

      expect(registry.list('active')).toHaveLength(1);
      expect(registry.list('active')[0].name).toBe('Active');
      expect(registry.list('archived')).toHaveLength(1);
      expect(registry.list('archived')[0].name).toBe('Archived');
    });
  });

  describe('update', () => {
    it('updates project fields', () => {
      const project = registry.create('Original');
      registry.update(project.id, { name: 'Renamed', description: 'Updated desc' });
      const updated = registry.get(project.id);
      expect(updated!.name).toBe('Renamed');
      expect(updated!.description).toBe('Updated desc');
    });
  });

  describe('sessions', () => {
    it('starts and ends a session', () => {
      const project = registry.create('Session Test');
      registry.startSession(project.id, 'lead-1', 'Do something');

      const sessions = registry.getSessions(project.id);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].leadId).toBe('lead-1');
      expect(sessions[0].status).toBe('active');

      registry.endSession('lead-1', 'completed');
      const ended = registry.getSessions(project.id);
      expect(ended[0].status).toBe('completed');
      expect(ended[0].endedAt).toBeTruthy();
    });

    it('tracks session ID', () => {
      const project = registry.create('SessionId Test');
      registry.startSession(project.id, 'lead-2');
      registry.setSessionId('lead-2', 'copilot-session-abc');

      const sessions = registry.getSessions(project.id);
      expect(sessions[0].sessionId).toBe('copilot-session-abc');
    });

    it('finds project by lead ID', () => {
      const project = registry.create('Find Test');
      registry.startSession(project.id, 'lead-3');

      const found = registry.findProjectByLeadId('lead-3');
      expect(found).toBeDefined();
      expect(found!.id).toBe(project.id);
    });

    it('returns undefined for unknown lead ID', () => {
      expect(registry.findProjectByLeadId('unknown')).toBeUndefined();
    });

    it('gets active lead ID', () => {
      const project = registry.create('Active Lead Test');
      registry.startSession(project.id, 'lead-4');
      expect(registry.getActiveLeadId(project.id)).toBe('lead-4');

      registry.endSession('lead-4');
      expect(registry.getActiveLeadId(project.id)).toBeUndefined();
    });
  });

  describe('buildBriefing', () => {
    it('returns undefined for unknown project', () => {
      expect(registry.buildBriefing('nonexistent')).toBeUndefined();
    });

    it('builds a briefing with session history', () => {
      const project = registry.create('Briefing Test', 'Test description', '/tmp');
      registry.startSession(project.id, 'lead-a', 'First task');
      registry.endSession('lead-a', 'completed');
      registry.startSession(project.id, 'lead-b', 'Second task');
      registry.endSession('lead-b', 'completed');

      const briefing = registry.buildBriefing(project.id);
      expect(briefing).toBeDefined();
      expect(briefing!.project.name).toBe('Briefing Test');
      expect(briefing!.sessions).toHaveLength(2);
      expect(briefing!.taskSummary.total).toBe(0); // No DAG tasks created
    });

    it('formats briefing as readable text', () => {
      const project = registry.create('Format Test', 'A test project');
      registry.startSession(project.id, 'lead-x');
      registry.endSession('lead-x');

      const briefing = registry.buildBriefing(project.id)!;
      const text = registry.formatBriefing(briefing);
      expect(text).toContain('# Project Briefing: Format Test');
      expect(text).toContain('**Description:** A test project');
      expect(text).toContain('1 prior session(s)');
    });
  });
});
