/**
 * ProvidersSection — provider availability and configuration for Settings.
 *
 * Shows which CLI providers are installed, authenticated, and enabled.
 * All providers manage their own API keys/auth — we only detect status.
 */
import { useState, useEffect, useCallback } from 'react';
import { Cpu, Loader2, Zap, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { StatusBadge, providerStatusProps } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';

// ── Types ───────────────────────────────────────────────────────────

interface ProviderStatus {
  id: string;
  name: string;
  installed: boolean;
  authenticated: boolean | null;
  enabled: boolean;
  binaryPath: string | null;
}

interface TestResult {
  success: boolean;
  message: string;
}

// ── Provider display metadata ───────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  copilot: '🐙',
  claude: '🟠',
  gemini: '💎',
  opencode: '🔓',
  cursor: '↗️',
  codex: '🤖',
};

const PROVIDER_AUTH_LABELS: Record<string, string> = {
  copilot: 'Authenticated via GitHub',
  claude: 'Authenticated via Claude platform',
  gemini: 'Authenticated via Google',
  opencode: 'Manages own keys',
  cursor: 'Authenticated via Cursor',
  codex: 'Authenticated via OpenAI',
};

const PROVIDER_DOCS: Record<string, string> = {
  copilot: 'https://docs.github.com/en/copilot',
  claude: 'https://platform.claude.com/docs/en/agent-sdk/overview',
  gemini: 'https://ai.google.dev/gemini-api/docs/api-key',
  opencode: 'https://opencode.ai/docs/providers/',
  cursor: 'https://docs.cursor.com',
  codex: 'https://platform.openai.com/docs/api-reference',
};

// ── Provider Card ───────────────────────────────────────────────────

function ProviderCard({
  provider,
  onToggle,
}: {
  provider: ProviderStatus;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<TestResult>(
        `/settings/providers/${provider.id}/test`,
        { method: 'POST' },
      );
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }, [provider.id]);

  const icon = PROVIDER_ICONS[provider.id] ?? '🔌';
  const docsUrl = PROVIDER_DOCS[provider.id];
  const authLabel = PROVIDER_AUTH_LABELS[provider.id] ?? 'Provider-managed auth';

  return (
    <div
      className="bg-surface-raised border border-th-border rounded-lg overflow-hidden transition-colors hover:border-th-border-hover"
      data-testid={`provider-card-${provider.id}`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${provider.name} provider details`}
      >
        <span className="text-lg" role="img" aria-label={provider.name}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-th-text-alt">{provider.name}</span>
            <StatusBadge {...providerStatusProps(provider)} />
          </div>
          <div className="text-xs text-th-text-muted">
            {provider.installed ? authLabel : 'CLI not found on PATH'}
          </div>
        </div>
        {/* Enable/disable toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(provider.id, !provider.enabled);
          }}
          aria-label={provider.enabled ? `Disable ${provider.name}` : `Enable ${provider.name}`}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
            provider.enabled ? 'bg-accent' : 'bg-th-bg-hover'
          }`}
          data-testid={`toggle-${provider.id}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              provider.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-th-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-th-text-muted shrink-0" />
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-th-border px-4 py-3 bg-th-bg-alt/30 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-th-text-muted">Binary:</span>{' '}
              <code className="font-mono text-th-text-alt">
                {provider.binaryPath ?? provider.id}
              </code>
            </div>
            <div>
              <span className="text-th-text-muted">Status:</span>{' '}
              <span className={provider.installed ? 'text-green-400' : 'text-th-text-muted'}>
                {provider.installed ? 'Installed' : 'Not found'}
              </span>
            </div>
          </div>

          {/* Setup instructions if not installed */}
          {!provider.installed && docsUrl && (
            <div className="bg-th-bg-alt border border-th-border rounded-md p-3 text-xs">
              <p className="text-th-text-muted mb-1.5">
                Install the CLI to use this provider:
              </p>
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:text-accent-muted transition-colors"
              >
                <ExternalLink size={10} /> Installation docs
              </a>
            </div>
          )}

          {/* Test Connection */}
          {provider.installed && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors disabled:opacity-50"
                data-testid={`test-connection-${provider.id}`}
              >
                {testing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Zap size={12} />
                )}
                {testing ? 'Testing…' : 'Test Connection'}
              </button>

              {testResult && (
                <span
                  className={`text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}
                  data-testid={`test-result-${provider.id}`}
                >
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProvidersSection ────────────────────────────────────────────────

export function ProvidersSection() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ProviderStatus[]>('/settings/providers')
      .then(setProviders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    // Optimistic update
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );
    try {
      await apiFetch(`/settings/providers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // Revert on failure
      setProviders((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)),
      );
    }
  }, []);

  const installedCount = providers.filter((p) => p.installed).length;

  return (
    <section className="bg-surface-raised border border-th-border rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" /> Providers
        </h3>
        {!loading && (
          <span className="text-[10px] text-th-text-muted">
            {installedCount}/{providers.length} installed
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-th-text-muted">
          <Loader2 className="animate-spin mr-2" size={16} />
          <span className="text-sm">Loading providers…</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-md p-3" data-testid="providers-error">
          Failed to load providers: {error}
        </div>
      )}

      {!loading && !error && providers.length === 0 && (
        <EmptyState
          icon={<Cpu className="w-10 h-10 opacity-50" />}
          title="No providers configured"
          description="Install a CLI provider (Claude, Copilot, Gemini, etc.) to get started."
          compact
        />
      )}

      {!loading && !error && providers.length > 0 && (
        <div className="space-y-2" data-testid="providers-list">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}
