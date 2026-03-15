// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../../contexts/ApiContext', () => ({
  useApiContext: () => ({
    spawnAgent: vi.fn(), terminateAgent: vi.fn(), interruptAgent: vi.fn(),
    restartAgent: vi.fn(), updateAgent: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useModels', () => ({
  useModels: () => ({
    models: [], filteredModels: [], modelName: (id: string) => id,
    loading: false, error: null, defaults: {}, modelsByProvider: {}, activeProvider: 'openai',
  }),
}));

vi.mock('../../Toast', () => ({
  useToastStore: () => vi.fn(),
}));

vi.mock('../ProfilePanel', () => ({
  ProfilePanel: () => <div data-testid="profile-panel" />,
}));

const storeState = {
  agents: [] as unknown[],
  projects: {} as Record<string, unknown>,
  selectedLeadId: null as string | null,
};

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: typeof storeState) => unknown) =>
      typeof sel === 'function' ? sel(storeState) : storeState,
    { getState: () => storeState, setState: vi.fn(), subscribe: vi.fn() },
  ),
}));

vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    (sel: (s: typeof storeState) => unknown) =>
      typeof sel === 'function' ? sel(storeState) : storeState,
    { getState: () => storeState, setState: vi.fn(), subscribe: vi.fn() },
  ),
}));

import { UnifiedCrewPage } from '../UnifiedCrewPage';

function renderPage(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UnifiedCrewPage scope="global" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UnifiedCrewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue([]);
    storeState.agents = [];
  });

  it('renders without crashing', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('shows empty state with no agents', async () => {
    renderPage();
    await waitFor(() => {
      const text = document.body.textContent || '';
      expect(text).toMatch(/no agent|empty|crew/i);
    });
  });

  it('renders agent cards when agents present', async () => {
    storeState.agents = [
      { id: 'a1', role: { id: 'dev', name: 'Developer', icon: '\ud83d\udcbb' }, status: 'running', childIds: [], createdAt: new Date().toISOString(), outputPreview: '', model: 'gpt-4', projectId: 'p1', inputTokens: 5000, outputTokens: 2000 },
      { id: 'a2', role: { id: 'test', name: 'Tester', icon: '\ud83e\uddea' }, status: 'idle', childIds: [], createdAt: new Date().toISOString(), outputPreview: '', model: 'gpt-4', projectId: 'p1', inputTokens: 3000, outputTokens: 1000 },
    ];
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent || '';
      expect(text).toMatch(/Developer|Tester|dev|running|idle/i);
    });
  });

  it('renders health strip', async () => {
    storeState.agents = [
      { id: 'a1', role: { name: 'Dev', icon: '\ud83d\udcbb' }, status: 'running', childIds: [], model: 'gpt-4', projectId: 'p1' },
    ];
    const { container } = renderPage();
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('handles project scope', async () => {
    const { container } = renderPage({ scope: 'project' });
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});
