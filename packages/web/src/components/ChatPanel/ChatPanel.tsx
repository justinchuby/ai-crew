import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useAppStore } from '../../stores/appStore';
import { X, Send, Maximize2, Minimize2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface Props {
  agentId: string;
  ws: {
    subscribe: (id: string) => void;
    unsubscribe: (id: string) => void;
    sendInput: (id: string, text: string) => void;
    resizeAgent: (id: string, cols: number, rows: number) => void;
    send: (msg: any) => void;
  };
  api: any;
}

export function ChatPanel({ agentId, ws }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [inputText, setInputText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const { agents, setSelectedAgent } = useAppStore();
  const agent = agents.find((a) => a.id === agentId);

  useEffect(() => {
    if (!termRef.current) return;

    const terminal = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#388bfd44',
      },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(termRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Subscribe to agent output
    ws.subscribe(agentId);

    // Handle terminal input
    terminal.onData((data) => {
      ws.sendInput(agentId, data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      ws.resizeAgent(agentId, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(termRef.current);

    // Listen for WebSocket messages forwarded via custom window events
    const handleWsMessage = (event: Event) => {
      const msg = JSON.parse((event as MessageEvent).data);
      if (msg.type === 'agent:data' && msg.agentId === agentId) {
        terminal.write(msg.data);
      } else if (msg.type === 'agent:buffer' && msg.agentId === agentId) {
        terminal.write(msg.data);
      }
    };

    window.addEventListener('ws-message', handleWsMessage);

    return () => {
      ws.unsubscribe(agentId);
      resizeObserver.disconnect();
      terminal.dispose();
      window.removeEventListener('ws-message', handleWsMessage);
    };
  }, [agentId, ws]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    ws.sendInput(agentId, inputText + '\n');
    setInputText('');
  };

  return (
    <div className={`flex flex-col h-full ${expanded ? 'fixed inset-0 z-50 bg-surface' : ''}`}>
      <div className="h-10 border-b border-gray-700 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <span>{agent?.role.icon}</span>
          <span className="text-sm font-medium">{agent?.role.name}</span>
          <span className="text-xs text-gray-500 font-mono">{agentId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-200"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={() => setSelectedAgent(null)}
            className="p-1 text-gray-400 hover:text-gray-200"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={termRef} className="flex-1 overflow-hidden" />

      <div className="border-t border-gray-700 p-2 flex gap-2 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-surface border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleSend}
          className="p-2 bg-accent text-black rounded-lg hover:bg-accent-muted transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
