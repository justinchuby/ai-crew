import { useState } from 'react';
import { useGitHubConnection } from '../../hooks/useGitHubConnection';

export function GitHubSetup() {
  const { connection, loading, connect, disconnect, testConnection } = useGitHubConnection();
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connect(token, owner, repo);
      setShowForm(false);
      setToken('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection();
      if (result.connected) setError(null);
      else setError(result.error ?? 'Connection test failed');
    } catch {
      setError('Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-xs text-th-text-muted animate-pulse">Loading…</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider flex items-center gap-2">
        🔗 Integrations
      </h3>

      <div className="border border-th-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐙</span>
            <span className="text-xs font-semibold text-th-text">GitHub</span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              connection?.status === 'connected'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-th-bg-muted text-th-text-muted'
            }`}
          >
            {connection?.status === 'connected' ? '● Connected' : 'Not connected'}
          </span>
        </div>

        {connection?.status === 'connected' ? (
          <div className="space-y-2">
            <div className="text-xs text-th-text-muted">
              Repository:{' '}
              <span className="text-th-text font-medium">
                {connection.owner}/{connection.repo}
              </span>
            </div>
            <div className="text-xs text-th-text-muted">
              Default branch: {connection.defaultBranch}
            </div>
            <div className="text-xs text-th-text-muted">
              Permissions:{' '}
              {connection.permissions.map((p) => (
                <span key={p} className="mr-2">
                  {p} ✓
                </span>
              ))}
            </div>
            {connection.lastSyncAt && (
              <div className="text-xs text-th-text-muted">
                Last sync: {new Date(connection.lastSyncAt).toLocaleTimeString()}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="text-[11px] px-3 py-1.5 rounded-md bg-th-bg-muted text-th-text-muted hover:text-th-text transition-colors"
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                onClick={disconnect}
                className="text-[11px] px-3 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : showForm ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-th-text-muted block mb-1">
                Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxx..."
                aria-label="Personal Access Token"
                className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-th-text-muted block mb-1">Owner</label>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="acme-corp"
                  aria-label="Repository owner"
                  className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-th-text-muted block mb-1">Repository</label>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="api-service"
                  aria-label="Repository name"
                  className="w-full text-xs bg-th-bg-alt border border-th-border rounded px-3 py-2 text-th-text placeholder-th-text-muted outline-none"
                />
              </div>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={connecting || !token || !owner || !repo}
                className="text-xs px-4 py-2 rounded-md bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors font-medium"
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs px-4 py-2 rounded-md bg-th-bg-muted text-th-text-muted hover:bg-th-bg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs px-4 py-2 rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
          >
            Connect GitHub
          </button>
        )}
      </div>

      {/* GitLab coming soon */}
      <div className="border border-th-border-muted rounded-lg p-4 opacity-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🦊</span>
          <span className="text-xs font-semibold text-th-text">GitLab</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-th-bg-muted text-th-text-muted">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
