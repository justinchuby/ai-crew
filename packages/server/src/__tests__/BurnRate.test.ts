import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from '../agents/Agent.js';
import type { Role } from '../agents/RoleRegistry.js';
import type { ServerConfig } from '../config.js';

const mockRole: Role = {
  id: 'developer',
  name: 'Developer',
  icon: '🛠️',
  description: 'Writes code',
  systemPrompt: '',
  model: 'test-model',
  color: '#888',
  builtIn: true,
};

const mockConfig = {} as ServerConfig;

describe('Agent — Burn Rate Tracking', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent(mockRole, mockConfig, 'test task');
    agent.contextWindowSize = 200_000;
    agent.contextWindowUsed = 50_000;
  });

  it('starts with zero burn rate', () => {
    expect(agent.contextBurnRate).toBe(0);
  });

  it('starts with null exhaustion estimate', () => {
    expect(agent.estimatedExhaustionMinutes).toBeNull();
  });

  it('deduplicates samples within 10s interval', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(50_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 5_000); // 5s later
    agent.recordTokenSample(55_000);
    // Should still have only 1 sample → no burn rate
    expect(agent.contextBurnRate).toBe(0);
    vi.restoreAllMocks();
  });

  it('calculates burn rate from multiple samples over time', () => {
    const now = Date.now();
    // Simulate 4 samples over 60 seconds: 50K → 60K → 70K → 80K
    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(50_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    agent.recordTokenSample(60_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 40_000);
    agent.recordTokenSample(70_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    agent.recordTokenSample(80_000);

    // 30K tokens over 60s = 500 tokens/sec
    expect(agent.contextBurnRate).toBeCloseTo(500, 0);
    vi.restoreAllMocks();
  });

  it('returns zero burn rate with fewer than 3 samples', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(50_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 15_000);
    agent.recordTokenSample(60_000);
    expect(agent.contextBurnRate).toBe(0);
    vi.restoreAllMocks();
  });

  it('returns zero burn rate when span is under 30s', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(50_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    agent.recordTokenSample(55_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    agent.recordTokenSample(60_000);
    expect(agent.contextBurnRate).toBe(0);
    vi.restoreAllMocks();
  });

  it('estimates exhaustion time based on burn rate', () => {
    const now = Date.now();
    agent.contextWindowSize = 200_000;
    agent.contextWindowUsed = 100_000;

    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(100_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    agent.recordTokenSample(110_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 40_000);
    agent.recordTokenSample(120_000);
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    agent.recordTokenSample(130_000);

    // Burn rate: 30K / 60s = 500 tok/s
    // Remaining: 200K - 130K = 70K tokens (using last sample's value for contextWindowUsed)
    agent.contextWindowUsed = 130_000;
    const minutes = agent.estimatedExhaustionMinutes;
    expect(minutes).not.toBeNull();
    // 70000 / 500 / 60 ≈ 2.33 minutes
    expect(minutes!).toBeCloseTo(2.33, 1);
    vi.restoreAllMocks();
  });

  it('prunes samples older than 10 minutes', () => {
    const now = Date.now();

    // Add old samples
    vi.spyOn(Date, 'now').mockReturnValue(now - 700_000); // 11+ min ago
    agent.recordTokenSample(30_000);
    vi.spyOn(Date, 'now').mockReturnValue(now - 680_000);
    agent.recordTokenSample(40_000);

    // Add recent samples
    vi.spyOn(Date, 'now').mockReturnValue(now - 40_000);
    agent.recordTokenSample(60_000);
    vi.spyOn(Date, 'now').mockReturnValue(now - 20_000);
    agent.recordTokenSample(70_000);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    agent.recordTokenSample(80_000);

    // Old samples should be pruned, only 3 recent remain
    // 20K tokens over 40s = 500 tok/s
    expect(agent.contextBurnRate).toBeCloseTo(500, 0);
    vi.restoreAllMocks();
  });

  it('includes burn rate in toJSON output', () => {
    const json = agent.toJSON();
    expect(json).toHaveProperty('contextBurnRate');
    expect(json).toHaveProperty('estimatedExhaustionMinutes');
    expect(json.contextBurnRate).toBe(0);
    expect(json.estimatedExhaustionMinutes).toBeNull();
  });
});
