// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ModelConfigPanel } from '../ModelConfigPanel';

const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../../hooks/useModels', () => ({
  deriveModelName: (id: string) => id.replace('claude-', '').replace('gpt-', 'GPT-'),
}));

vi.mock('../../../utils/providerColors', () => ({
  getProviderColors: () => ({ bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' }),
}));

vi.mock('@flightdeck/shared', () => ({
  getProvider: (modelId: string) => ({
    name: modelId.includes('claude') ? 'Anthropic' : 'OpenAI',
    id: modelId.includes('claude') ? 'anthropic' : 'openai',
  }),
}));

const mockModelsResponse = {
  models: ['claude-sonnet-4', 'claude-haiku-4', 'gpt-4o'],
  defaults: { developer: ['claude-sonnet-4', 'gpt-4o'], architect: ['claude-sonnet-4'] },
  modelsByProvider: { anthropic: ['claude-sonnet-4', 'claude-haiku-4'], openai: ['gpt-4o'] },
};

const mockConfigResponse = {
  config: {},
  defaults: { developer: ['claude-sonnet-4', 'gpt-4o'] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockImplementation((url: string) => {
    if (url === '/models') return Promise.resolve(mockModelsResponse);
    if (url.includes('/model-config')) return Promise.resolve(mockConfigResponse);
    return Promise.resolve({});
  });
});
afterEach(cleanup);

describe('ModelConfigPanel', () => {
  it('fetches models and config on mount', async () => {
    render(<ModelConfigPanel projectId="p1" />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/models');
    });
  });

  it('shows loading state initially', () => {
    render(<ModelConfigPanel projectId="p1" />);
    expect(screen.getByText('Loading models...')).toBeDefined();
  });

  it('renders role names after loading', async () => {
    render(<ModelConfigPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeDefined();
    });
  });

  it('renders allowlist header with reset button', async () => {
    render(<ModelConfigPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText('Model Allowlist')).toBeDefined();
      expect(screen.getByTitle('Reset to defaults')).toBeDefined();
    });
  });

  it('renders sticky header testid', async () => {
    render(<ModelConfigPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId('allowlist-sticky-header')).toBeDefined();
    });
  });
});
