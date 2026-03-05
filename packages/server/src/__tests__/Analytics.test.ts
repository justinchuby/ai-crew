import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from '../coordination/AnalyticsService.js';
import { Database } from '../db/database.js';

describe('AnalyticsService', () => {
  let db: Database;
  let service: AnalyticsService;

  beforeEach(() => {
    db = new Database(':memory:');
    service = new AnalyticsService(db);
  });

  it('returns empty overview with no data', () => {
    const overview = service.getOverview();
    expect(overview.totalSessions).toBe(0);
    expect(overview.totalCostUsd).toBe(0);
    expect(overview.sessions).toEqual([]);
    expect(overview.costTrend).toEqual([]);
    expect(overview.roleContributions).toEqual([]);
  });

  it('getOverview returns session summaries from project_sessions', () => {
    db.run(`INSERT INTO projects (id, name, created_at) VALUES ('proj-1', 'Test', datetime('now'))`);
    db.run(`INSERT INTO project_sessions (project_id, lead_id, status, started_at) VALUES ('proj-1', 'lead-1', 'completed', datetime('now'))`);

    const overview = service.getOverview();
    expect(overview.totalSessions).toBe(1);
    expect(overview.sessions[0].leadId).toBe('lead-1');
    expect(overview.sessions[0].status).toBe('completed');
  });

  it('getOverview filters by projectId', () => {
    db.run(`INSERT INTO projects (id, name, created_at) VALUES ('proj-1', 'Test1', datetime('now'))`);
    db.run(`INSERT INTO projects (id, name, created_at) VALUES ('proj-2', 'Test2', datetime('now'))`);
    db.run(`INSERT INTO project_sessions (project_id, lead_id, status, started_at) VALUES ('proj-1', 'lead-1', 'completed', datetime('now'))`);
    db.run(`INSERT INTO project_sessions (project_id, lead_id, status, started_at) VALUES ('proj-2', 'lead-2', 'active', datetime('now'))`);

    expect(service.getOverview('proj-1').totalSessions).toBe(1);
    expect(service.getOverview('proj-2').totalSessions).toBe(1);
    expect(service.getOverview().totalSessions).toBe(2);
  });

  it('compare returns deltas between two sessions', () => {
    db.run(`INSERT INTO projects (id, name, created_at) VALUES ('proj-1', 'Test', datetime('now'))`);
    db.run(`INSERT INTO project_sessions (project_id, lead_id, status, started_at) VALUES ('proj-1', 'lead-1', 'completed', datetime('now'))`);
    db.run(`INSERT INTO project_sessions (project_id, lead_id, status, started_at) VALUES ('proj-1', 'lead-2', 'completed', datetime('now'))`);

    const comparison = service.compare(['lead-1', 'lead-2']);
    expect(comparison.sessions).toHaveLength(2);
    expect(comparison.deltas).not.toBeNull();
    expect(comparison.deltas!.costDelta).toBe(0);
  });

  it('compare returns null deltas for 3+ sessions', () => {
    const comparison = service.compare(['lead-1', 'lead-2', 'lead-3']);
    expect(comparison.sessions).toHaveLength(3);
    expect(comparison.deltas).toBeNull();
  });
});
