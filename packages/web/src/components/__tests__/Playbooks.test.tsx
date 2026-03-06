import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaybookCard } from '../Playbooks/PlaybookCard';
import { PlaybookLibrary } from '../Playbooks/PlaybookLibrary';
import { PlaybookPicker } from '../Playbooks/PlaybookPicker';
import { PlaybookUpdatePrompt } from '../Playbooks/PlaybookUpdatePrompt';
import { IconPicker } from '../Playbooks/IconPicker';
import { BUILT_IN_PLAYBOOKS, summarizeRoles } from '../Playbooks/types';
import type { Playbook } from '../Playbooks/types';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ user: [] }),
  }),
}));

vi.mock('../Toast', () => ({
  useToastStore: (sel: any) => sel({ add: vi.fn() }),
}));

// ── Helpers ────────────────────────────────────────────────────────

const samplePlaybook: Playbook = {
  id: 'test-pb',
  name: 'Test Playbook',
  description: 'A test playbook',
  icon: '🧪',
  agents: [{ role: 'Lead' }, { role: 'Developer' }, { role: 'Developer' }],
  intentRules: [{ category: 'style', action: 'auto-approve' }],
  settings: { budget: 10 },
  metadata: {
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    usageCount: 5,
    lastUsedAt: '2025-01-01',
    source: 'user',
  },
};

// ── Tests ──────────────────────────────────────────────────────────

describe('summarizeRoles', () => {
  it('summarizes agent roles correctly', () => {
    expect(summarizeRoles([{ role: 'Lead' }, { role: 'Developer' }, { role: 'Developer' }]))
      .toBe('1 Lead • 2 Developer');
  });

  it('handles single agent', () => {
    expect(summarizeRoles([{ role: 'QA Tester' }])).toBe('1 QA Tester');
  });
});

describe('PlaybookCard', () => {
  it('renders card with playbook info', () => {
    render(<PlaybookCard playbook={samplePlaybook} />);
    expect(screen.getByText('Test Playbook')).toBeTruthy();
    expect(screen.getByText('1 Lead • 2 Developer')).toBeTruthy();
    expect(screen.getByText('1 intent rule')).toBeTruthy();
    expect(screen.getByText('Used 5 times')).toBeTruthy();
  });

  it('renders compact mode', () => {
    render(<PlaybookCard playbook={samplePlaybook} compact onClick={() => {}} />);
    expect(screen.getByTestId('playbook-compact-test-pb')).toBeTruthy();
    expect(screen.getByText('3 agents')).toBeTruthy();
  });

  it('shows last used badge', () => {
    render(<PlaybookCard playbook={samplePlaybook} isLastUsed />);
    expect(screen.getByText('★ Last used')).toBeTruthy();
  });

  it('calls onApply when apply button clicked', () => {
    const onApply = vi.fn();
    render(<PlaybookCard playbook={samplePlaybook} onApply={onApply} />);
    fireEvent.click(screen.getByTestId(`playbook-apply-${samplePlaybook.id}`));
    expect(onApply).toHaveBeenCalledWith(samplePlaybook);
  });

  it('does not show delete for built-in playbooks', () => {
    const builtIn = BUILT_IN_PLAYBOOKS[0];
    const onDelete = vi.fn();
    render(<PlaybookCard playbook={builtIn} onDelete={onDelete} />);
    // Open menu
    fireEvent.click(screen.getByTestId(`playbook-menu-${builtIn.id}`));
    expect(screen.queryByText('Delete')).toBeNull();
  });
});

describe('PlaybookLibrary', () => {
  it('renders built-in playbooks', async () => {
    render(
      <MemoryRouter>
        <PlaybookLibrary />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('playbook-library')).toBeTruthy();
    // Should show all 5 built-in
    for (const pb of BUILT_IN_PLAYBOOKS) {
      expect(screen.getByText(pb.name)).toBeTruthy();
    }
  });

  it('shows empty state for user playbooks', async () => {
    render(
      <MemoryRouter>
        <PlaybookLibrary />
      </MemoryRouter>,
    );
    // Wait for loading to finish
    await screen.findByTestId('playbook-empty');
    expect(screen.getByText(/Save your first playbook/)).toBeTruthy();
  });
});

describe('PlaybookPicker', () => {
  it('renders compact cards for all playbooks', () => {
    const onSelect = vi.fn();
    render(<PlaybookPicker onSelect={onSelect} />);
    expect(screen.getByTestId('playbook-picker')).toBeTruthy();
    // Should have compact cards for built-in
    for (const pb of BUILT_IN_PLAYBOOKS) {
      expect(screen.getByTestId(`playbook-compact-${pb.id}`)).toBeTruthy();
    }
  });

  it('shows summary when playbook selected', () => {
    const onSelect = vi.fn();
    render(
      <PlaybookPicker
        onSelect={onSelect}
        selectedId={BUILT_IN_PLAYBOOKS[0].id}
      />,
    );
    expect(screen.getByTestId('playbook-summary')).toBeTruthy();
  });

  it('calls onSelect when card clicked', () => {
    const onSelect = vi.fn();
    render(<PlaybookPicker onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId(`playbook-compact-${BUILT_IN_PLAYBOOKS[0].id}`));
    expect(onSelect).toHaveBeenCalledWith(BUILT_IN_PLAYBOOKS[0]);
  });
});

describe('PlaybookUpdatePrompt', () => {
  it('renders divergence summary', () => {
    render(
      <PlaybookUpdatePrompt
        playbook={{ id: 'pb-1', name: 'My Crew', agents: [] }}
        divergence={{
          addedRoles: ['QA Tester'],
          removedRoles: ['Designer'],
          newIntentRules: 2,
          costDelta: 3.50,
        }}
        onUpdate={() => {}}
        onSaveNew={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId('playbook-update-prompt')).toBeTruthy();
    expect(screen.getByText(/Added: QA Tester/)).toBeTruthy();
    expect(screen.getByText(/Removed: Designer/)).toBeTruthy();
    expect(screen.getByText(/2 new intent rules/)).toBeTruthy();
  });

  it('calls onUpdate when update button clicked', () => {
    const onUpdate = vi.fn();
    render(
      <PlaybookUpdatePrompt
        playbook={{ id: 'pb-1', name: 'My Crew', agents: [] }}
        divergence={{ addedRoles: ['QA'], removedRoles: [], newIntentRules: 0, costDelta: null }}
        onUpdate={onUpdate}
        onSaveNew={() => {}}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('playbook-update-btn'));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('returns null when no changes', () => {
    const { container } = render(
      <PlaybookUpdatePrompt
        playbook={{ id: 'pb-1', name: 'My Crew', agents: [] }}
        divergence={{ addedRoles: [], removedRoles: [], newIntentRules: 0, costDelta: null }}
        onUpdate={() => {}}
        onSaveNew={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('IconPicker', () => {
  it('renders trigger with current value', () => {
    render(<IconPicker value="🔍" onChange={() => {}} />);
    expect(screen.getByTestId('icon-picker-trigger')).toBeTruthy();
    expect(screen.getByText('🔍')).toBeTruthy();
  });

  it('opens dropdown on click', () => {
    render(<IconPicker value="🔍" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('icon-picker-trigger'));
    // Should show emoji grid
    expect(screen.getByPlaceholderText('Search emoji...')).toBeTruthy();
  });

  it('calls onChange when emoji selected', () => {
    const onChange = vi.fn();
    render(<IconPicker value="🔍" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('icon-picker-trigger'));
    // Click the rocket emoji
    fireEvent.click(screen.getByText('🚀'));
    expect(onChange).toHaveBeenCalledWith('🚀');
  });
});
