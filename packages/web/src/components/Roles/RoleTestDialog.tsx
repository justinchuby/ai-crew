import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';

interface TestRole {
  name: string;
  icon: string;
  model: string;
  systemPrompt: string;
  description: string;
  color: string;
}

interface Props {
  role: TestRole;
  onClose: () => void;
}

export function RoleTestDialog({ role, onClose }: Props) {
  const [message, setMessage] = useState(
    'Hello, introduce yourself and describe your capabilities.',
  );
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await apiFetch<{ response: string }>('/roles/test', {
        method: 'POST',
        body: JSON.stringify({ role, message }),
      });
      setResponse(res.response || 'No response received.');
    } catch {
      setResponse('Test failed — check your configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-th-bg border border-th-border rounded-xl p-5 w-full max-w-md mx-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-th-text flex items-center gap-2">
            <span>{role.icon}</span> Test: {role.name}
          </h3>
          <button
            onClick={onClose}
            className="text-th-text-muted hover:text-th-text"
          >
            ✕
          </button>
        </div>

        <div>
          <label className="text-xs text-th-text-muted">Test message:</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm bg-th-bg-alt border border-th-border rounded-lg text-th-text resize-none focus:outline-none focus:border-accent"
            rows={3}
          />
        </div>

        <button
          onClick={handleTest}
          disabled={loading || !message.trim()}
          className="w-full text-xs py-2 bg-accent text-white rounded-md hover:bg-accent/80 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Running test…' : 'Send Test Message'}
        </button>

        {response && (
          <div className="bg-th-bg-alt border border-th-border rounded-lg p-3">
            <div className="text-[10px] text-th-text-muted mb-1">
              Response from {role.name}:
            </div>
            <div className="text-xs text-th-text whitespace-pre-wrap">
              {response}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
