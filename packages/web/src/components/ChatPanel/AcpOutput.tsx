import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AcpToolCall, AcpPlanEntry } from '../../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  agentId: string;
}

const PLAN_ICON: Record<AcpPlanEntry['status'], string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
};

const PRIORITY_BADGE: Record<AcpPlanEntry['priority'], string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-gray-500/20 text-gray-400',
};

const TC_STATUS: Record<AcpToolCall['status'], string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

export function AcpOutput({ agentId }: Props) {
  const agent = useAppStore((s) => s.agents.find((a) => a.id === agentId));
  const [planOpen, setPlanOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const plan = agent?.plan ?? [];
  const toolCalls = agent?.toolCalls ?? [];
  const messages = agent?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Plan Section */}
      {plan.length > 0 && (
        <div className="border border-gray-700 rounded-lg bg-surface-raised">
          <button
            onClick={() => setPlanOpen(!planOpen)}
            className="flex items-center gap-1 w-full px-3 py-2 text-xs font-medium text-gray-300"
          >
            {planOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Plan ({plan.filter((e) => e.status === 'completed').length}/{plan.length})
          </button>
          {planOpen && (
            <ul className="px-3 pb-2 space-y-1">
              {plan.map((entry, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                  <span>{PLAN_ICON[entry.status]}</span>
                  <span className="flex-1">{entry.content}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${PRIORITY_BADGE[entry.priority]}`}>
                    {entry.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tool Calls Section */}
      {toolCalls.length > 0 && (
        <div className="space-y-1.5">
          {toolCalls.map((tc) => (
            <div key={tc.toolCallId} className="border border-gray-700 rounded-lg bg-surface-raised p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-200">{tc.title}</span>
                  <span className="text-[10px] text-gray-500">{tc.kind}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${TC_STATUS[tc.status]}`}>
                  {tc.status}
                </span>
              </div>
              {tc.content && tc.status === 'completed' && (
                <pre className="mt-1 text-[11px] text-gray-400 font-mono overflow-hidden max-h-24 bg-surface/50 rounded p-1">
                  {tc.content.slice(0, 500)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages Section */}
      {messages.length > 0 && (
        <div className="border border-gray-700 rounded-lg bg-surface-raised p-3 max-h-96 overflow-y-auto">
          {messages.map((msg, i) => (
            <span key={i} className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {msg.text}
            </span>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
