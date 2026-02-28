import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useGroupStore, groupKey } from '../../stores/groupStore';
import { MessageSquare, Send, Users } from 'lucide-react';
import type { ChatGroup, GroupMessage } from '../../types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function isHuman(msg: GroupMessage): boolean {
  return msg.fromAgentId === 'human' || msg.fromRole === 'Human User';
}

function isSystem(msg: GroupMessage): boolean {
  return msg.fromRole.toLowerCase().includes('system');
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function GroupChat(_props: { api: any; ws: any }) {
  const agents = useAppStore((s) => s.agents);
  const {
    groups,
    messages,
    selectedGroup,
    setGroups,
    setMessages,
    selectGroup,
  } = useGroupStore();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derive leads: agents whose role.id is 'lead' with no parent
  const leads = agents.filter((a) => a.role.id === 'lead' && !a.parentId);

  /* ---- Fetch groups for every lead on mount / when leads change ---- */
  useEffect(() => {
    if (leads.length === 0) return;
    let cancelled = false;

    async function fetchAllGroups() {
      const allGroups: ChatGroup[] = [];
      for (const lead of leads) {
        try {
          const res = await fetch(`/api/lead/${lead.id}/groups`);
          if (res.ok) {
            const data: ChatGroup[] = await res.json();
            allGroups.push(...data);
          }
        } catch {
          /* network error — skip silently */
        }
      }
      if (!cancelled) setGroups(allGroups);
    }

    void fetchAllGroups();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.map((l) => l.id).join(',')]);

  /* ---- Fetch messages when selected group changes ---- */
  useEffect(() => {
    if (!selectedGroup) return;
    let cancelled = false;

    async function fetchMessages() {
      const { leadId, name } = selectedGroup!;
      try {
        const res = await fetch(
          `/api/lead/${leadId}/groups/${encodeURIComponent(name)}/messages`,
        );
        if (res.ok) {
          const data: GroupMessage[] = await res.json();
          if (!cancelled) setMessages(groupKey(leadId, name), data);
        }
      } catch {
        /* network error */
      }
    }

    void fetchMessages();
    return () => { cancelled = true; };
  }, [selectedGroup, setMessages]);

  /* ---- Auto-scroll on new messages ---- */
  const currentMessages = selectedGroup
    ? messages[groupKey(selectedGroup.leadId, selectedGroup.name)] ?? []
    : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  /* ---- Agent name resolver ---- */
  const agentName = useCallback(
    (id: string): string => {
      if (id === 'human') return 'You';
      const agent = agents.find((a) => a.id === id);
      return agent?.role.name ?? id.slice(0, 8);
    },
    [agents],
  );

  const agentIcon = useCallback(
    (id: string): string => {
      if (id === 'human') return '👤';
      const agent = agents.find((a) => a.id === id);
      return agent?.role.icon ?? '🤖';
    },
    [agents],
  );

  /* ---- Send message ---- */
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !selectedGroup || sending) return;
    const { leadId, name } = selectedGroup;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await fetch(
        `/api/lead/${leadId}/groups/${encodeURIComponent(name)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        },
      );
    } catch {
      /* network error */
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [inputText, selectedGroup, sending]);

  /* ---- Textarea keyboard handling ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  /* ---- Auto-grow textarea ---- */
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`; // max ~4 rows
  }, []);

  /* ---- Group list, grouped by lead ---- */
  const groupsByLead = leads.reduce<Record<string, ChatGroup[]>>((acc, lead) => {
    acc[lead.id] = groups.filter((g) => g.leadId === lead.id);
    return acc;
  }, {});

  /* ---- Selected group metadata ---- */
  const selectedGroupData = selectedGroup
    ? groups.find((g) => g.name === selectedGroup.name && g.leadId === selectedGroup.leadId)
    : null;

  const memberNames = selectedGroupData
    ? selectedGroupData.memberIds.map((id) => agentName(id)).join(', ')
    : '';

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="flex h-full bg-[#1a1a2e] text-gray-200">
      {/* ---- Left sidebar: Group list ---- */}
      <div className="w-64 border-r border-gray-700 flex flex-col shrink-0">
        <div className="h-12 flex items-center gap-2 px-4 border-b border-gray-700 shrink-0">
          <MessageSquare className="w-4 h-4 text-accent" />
          <span className="font-semibold text-sm">Group Chats</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center gap-3">
              <MessageSquare className="w-8 h-8" />
              <p className="text-sm">No groups yet</p>
              <p className="text-xs">
                Group chats are created automatically when agents need to
                coordinate across roles.
              </p>
            </div>
          ) : (
            Object.entries(groupsByLead).map(([leadId, leadGroups]) => {
              if (leadGroups.length === 0) return null;
              const lead = agents.find((a) => a.id === leadId);
              return (
                <div key={leadId}>
                  <div className="px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wide">
                    {lead?.role.name ?? 'Lead'} — {lead?.projectName ?? leadId.slice(0, 8)}
                  </div>
                  {leadGroups.map((g) => {
                    const key = groupKey(g.leadId, g.name);
                    const groupMessages = messages[key] ?? [];
                    const lastMsg = groupMessages[groupMessages.length - 1];
                    const isSelected =
                      selectedGroup?.leadId === g.leadId &&
                      selectedGroup?.name === g.name;

                    return (
                      <button
                        key={key}
                        onClick={() => selectGroup(g.leadId, g.name)}
                        className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-gray-700 ${
                          isSelected
                            ? 'bg-accent/20 border-l-2 border-accent'
                            : 'border-l-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">
                            {g.name}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Users className="w-3 h-3" />
                            {g.memberIds.length}
                          </span>
                        </div>
                        {lastMsg && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {agentName(lastMsg.fromAgentId)}: {lastMsg.content}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ---- Center: Message thread ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedGroup && selectedGroupData ? (
          <>
            {/* Sticky header */}
            <div className="h-12 flex items-center gap-3 px-4 border-b border-gray-700 shrink-0 bg-[#1a1a2e] sticky top-0 z-10">
              <span className="font-semibold text-sm truncate">
                {selectedGroup.name}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {memberNames}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {currentMessages.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No messages yet — start the conversation!
                </div>
              )}

              {currentMessages.map((msg) => {
                if (isSystem(msg)) {
                  return (
                    <div
                      key={msg.id}
                      className="flex justify-center"
                    >
                      <span className="text-xs text-gray-500 italic">
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                const human = isHuman(msg);
                return (
                  <div
                    key={msg.id}
                    className={`flex ${human ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex gap-2 max-w-[75%] ${
                        human ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        {agentIcon(msg.fromAgentId)}
                      </div>

                      {/* Bubble */}
                      <div>
                        <div
                          className={`text-xs font-bold mb-0.5 ${
                            human ? 'text-right text-blue-400' : 'text-accent'
                          }`}
                        >
                          {agentName(msg.fromAgentId)}
                        </div>
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ${
                            human
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800 text-gray-200'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        </div>
                        <div
                          className={`text-xs text-gray-500 mt-0.5 ${
                            human ? 'text-right' : ''
                          }`}
                        >
                          {timeAgo(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* Compose bar */}
            <div className="border-t border-gray-700 p-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  rows={1}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
                  style={{ maxHeight: 96 }}
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!inputText.trim() || sending}
                  className="p-2 bg-accent text-black rounded-lg hover:bg-accent-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No group selected */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3">
            <MessageSquare className="w-10 h-10" />
            <p className="text-sm">Select a group chat to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
