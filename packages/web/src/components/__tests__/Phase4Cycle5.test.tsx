import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks (before component imports) ────────────────────────────────────────

const mockApiFetch = vi.fn().mockResolvedValue([]);
vi.mock('../../hooks/useApi', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

const mockToastAdd = vi.fn();
vi.mock('../Toast', () => ({
  useToastStore: (selector: any) => selector({ add: mockToastAdd }),
}));

// ── Component imports (AFTER vi.mock calls) ─────────────────────────────────

import { CommunityGallery } from '../Playbooks/CommunityGallery';
import { PlaybookDetail } from '../Playbooks/PlaybookDetail';
import { PlaybookPublishDialog } from '../Playbooks/PlaybookPublishDialog';
import { PlaybookRating } from '../Playbooks/PlaybookRating';
import { PlaybookVersionBanner } from '../Playbooks/PlaybookVersionBanner';
import { EmptyState } from '../Shared/EmptyState';
import { SkeletonCard, SkeletonList } from '../Shared/SkeletonCard';
import { ErrorPage } from '../Shared/ErrorPage';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePlaybook(overrides: Record<string, any> = {}) {
  return {
    id: 'cp-1',
    name: 'Security Audit Crew',
    description: '4-agent crew specialized in security audits.',
    publisher: 'community',
    category: 'security' as const,
    tags: ['security', 'audit', 'owasp'],
    rating: { average: 4.8, count: 23 },
    useCount: 23,
    version: '1.0.0',
    publishedAt: '2025-02-01T00:00:00Z',
    featured: false,
    roles: [
      { id: 'lead', name: 'Lead', icon: '👑', model: 'opus' },
      { id: 'security', name: 'Security Auditor', icon: '🔒', model: 'opus' },
    ],
    intentRules: 3,
    budget: 25,
    ...overrides,
  };
}

// ── Reset ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 4 Cycle 5 — Community Playbooks + Final Polish', () => {

  // ── CommunityGallery ──────────────────────────────────────────────────
  describe('Community — CommunityGallery', () => {
    it('shows loading state initially', () => {
      // apiFetch returns a pending promise so loading state sticks
      mockApiFetch.mockReturnValue(new Promise(() => {}));
      render(<CommunityGallery onSelect={vi.fn()} />);
      expect(screen.getByTestId('community-loading')).toBeInTheDocument();
    });

    it('fetches playbooks from /playbooks/community on mount', async () => {
      mockApiFetch.mockResolvedValue([makePlaybook()]);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/playbooks/community');
      });
    });

    it('renders search input, category filter, and sort dropdown', async () => {
      mockApiFetch.mockResolvedValue([makePlaybook()]);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByTestId('community-gallery'));
      expect(screen.getByLabelText('Search community playbooks')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort playbooks')).toBeInTheDocument();
    });

    it('renders featured section when a playbook is featured', async () => {
      mockApiFetch.mockResolvedValue([
        makePlaybook({ id: 'f-1', name: 'Featured Crew', featured: true }),
        makePlaybook({ id: 'r-1', name: 'Regular Crew', featured: false }),
      ]);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByText('Featured'));
      expect(screen.getByTestId('featured-card-f-1')).toBeInTheDocument();
      expect(screen.getByTestId('community-card-r-1')).toBeInTheDocument();
    });

    it('shows playbook name, agent count, rating, and use count on cards', async () => {
      mockApiFetch.mockResolvedValue([makePlaybook()]);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByTestId('community-card-cp-1'));
      expect(screen.getByText('Security Audit Crew')).toBeInTheDocument();
      expect(screen.getByText('2 agents')).toBeInTheDocument();
      expect(screen.getByText('(23)')).toBeInTheDocument();
      expect(screen.getByText('23 uses')).toBeInTheDocument();
    });

    it('shows "Load more" button when there are more than 12 playbooks', async () => {
      const many = Array.from({ length: 15 }, (_, i) =>
        makePlaybook({ id: `cp-${i}`, name: `Playbook ${i}`, featured: false }),
      );
      mockApiFetch.mockResolvedValue(many);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByTestId('load-more-btn'));
      expect(screen.getByTestId('load-more-btn')).toHaveTextContent('3 remaining');
    });

    it('shows error state with Retry button on fetch failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByTestId('community-error'));
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows empty state when no playbooks match search', async () => {
      mockApiFetch.mockResolvedValue([makePlaybook()]);
      render(<CommunityGallery onSelect={vi.fn()} />);
      await waitFor(() => screen.getByTestId('community-gallery'));
      const searchInput = screen.getByLabelText('Search community playbooks');
      fireEvent.change(searchInput, { target: { value: 'zzz-no-match-zzz' } });
      expect(screen.getByTestId('community-empty')).toBeInTheDocument();
    });
  });

  // ── PlaybookDetail ────────────────────────────────────────────────────
  describe('Community — PlaybookDetail', () => {
    const defaultProps = () => ({
      playbook: makePlaybook(),
      onBack: vi.fn(),
      onUse: vi.fn(),
      onFork: vi.fn(),
      onRate: vi.fn(),
    });

    it('renders playbook name, publisher, and description', async () => {
      mockApiFetch.mockResolvedValue([]);
      render(<PlaybookDetail {...defaultProps()} />);
      expect(screen.getByText('Security Audit Crew')).toBeInTheDocument();
      expect(screen.getByText('community')).toBeInTheDocument();
      expect(screen.getByText('4-agent crew specialized in security audits.')).toBeInTheDocument();
    });

    it('renders crew composition role cards', async () => {
      mockApiFetch.mockResolvedValue([]);
      render(<PlaybookDetail {...defaultProps()} />);
      expect(screen.getByText('Lead')).toBeInTheDocument();
      expect(screen.getByText('Security Auditor')).toBeInTheDocument();
    });

    it('renders Use as-is, Fork & customize, and Rate this buttons', async () => {
      mockApiFetch.mockResolvedValue([]);
      const props = defaultProps();
      render(<PlaybookDetail {...props} />);
      const useBtn = screen.getByText('Use as-is →');
      const forkBtn = screen.getByText(/Fork/);
      const rateBtn = screen.getByText(/Rate this/);
      expect(useBtn).toBeInTheDocument();
      expect(forkBtn).toBeInTheDocument();
      expect(rateBtn).toBeInTheDocument();
    });

    it('calls onUse when "Use as-is" is clicked', async () => {
      mockApiFetch.mockResolvedValue([]);
      const props = defaultProps();
      render(<PlaybookDetail {...props} />);
      fireEvent.click(screen.getByText('Use as-is →'));
      expect(props.onUse).toHaveBeenCalledTimes(1);
    });

    it('calls onFork when Fork button is clicked', async () => {
      mockApiFetch.mockResolvedValue([]);
      const props = defaultProps();
      render(<PlaybookDetail {...props} />);
      fireEvent.click(screen.getByText(/Fork/));
      expect(props.onFork).toHaveBeenCalledTimes(1);
    });

    it('calls onBack when back button is clicked', async () => {
      mockApiFetch.mockResolvedValue([]);
      const props = defaultProps();
      render(<PlaybookDetail {...props} />);
      fireEvent.click(screen.getByLabelText('Back to gallery'));
      expect(props.onBack).toHaveBeenCalledTimes(1);
    });

    it('fetches and shows reviews', async () => {
      mockApiFetch.mockResolvedValue([
        { id: 'rev-1', rating: 5, comment: 'Awesome playbook!', createdAt: '2025-03-01T00:00:00Z' },
      ]);
      render(<PlaybookDetail {...defaultProps()} />);
      await waitFor(() => {
        expect(screen.getByText('Awesome playbook!')).toBeInTheDocument();
      });
    });
  });

  // ── PlaybookPublishDialog ─────────────────────────────────────────────
  describe('Community — PlaybookPublishDialog', () => {
    const defaultProps = () => ({
      playbook: {
        id: 'pb-1',
        name: 'My Crew',
        roles: [{ id: 'r-1', name: 'Dev' }, { id: 'r-2', name: 'QA' }],
        intentRules: 2,
        budget: 30,
      },
      onClose: vi.fn(),
      onPublished: vi.fn(),
    });

    it('renders dialog with description input, category dropdown, and tags input', () => {
      render(<PlaybookPublishDialog {...defaultProps()} />);
      expect(screen.getByTestId('publish-playbook-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('publish-description')).toBeInTheDocument();
      expect(screen.getByTestId('publish-category')).toBeInTheDocument();
      expect(screen.getByTestId('publish-tags')).toBeInTheDocument();
    });

    it('shows "What\'s included" checklist with roles, intent rules, budget', () => {
      render(<PlaybookPublishDialog {...defaultProps()} />);
      expect(screen.getByText(/2 roles/)).toBeInTheDocument();
      expect(screen.getByText(/2 intent rules/)).toBeInTheDocument();
      expect(screen.getByText(/Budget: \$30/)).toBeInTheDocument();
    });

    it('has Cancel and Publish buttons', () => {
      render(<PlaybookPublishDialog {...defaultProps()} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByTestId('publish-btn')).toHaveTextContent('Publish →');
    });

    it('Publish button is disabled when description is empty', () => {
      render(<PlaybookPublishDialog {...defaultProps()} />);
      expect(screen.getByTestId('publish-btn')).toBeDisabled();
    });

    it('calls POST /playbooks/community on submit with filled form', async () => {
      mockApiFetch.mockResolvedValue({ id: 'cp-new' });
      const props = defaultProps();
      render(<PlaybookPublishDialog {...props} />);

      // Fill in description
      fireEvent.change(screen.getByTestId('publish-description'), {
        target: { value: 'A useful crew for testing' },
      });
      // Fill in tags
      fireEvent.change(screen.getByTestId('publish-tags'), {
        target: { value: 'testing, automation' },
      });

      fireEvent.click(screen.getByTestId('publish-btn'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/playbooks/community', expect.objectContaining({
          method: 'POST',
        }));
      });
      await waitFor(() => {
        expect(props.onPublished).toHaveBeenCalled();
      });
    });

    it('calls onClose when Cancel is clicked', () => {
      const props = defaultProps();
      render(<PlaybookPublishDialog {...props} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── PlaybookRating ────────────────────────────────────────────────────
  describe('Community — PlaybookRating', () => {
    const defaultProps = () => ({
      playbookId: 'cp-1',
      onSubmit: vi.fn(),
      onSkip: vi.fn(),
    });

    it('renders 5 clickable stars', () => {
      render(<PlaybookRating {...defaultProps()} />);
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByTestId(`star-${i}`)).toBeInTheDocument();
      }
    });

    it('has optional comment textarea', () => {
      render(<PlaybookRating {...defaultProps()} />);
      expect(screen.getByTestId('rating-comment')).toBeInTheDocument();
    });

    it('has Skip and Submit buttons', () => {
      render(<PlaybookRating {...defaultProps()} />);
      expect(screen.getByTestId('rating-skip')).toHaveTextContent('Skip');
      expect(screen.getByTestId('rating-submit')).toHaveTextContent('Submit');
    });

    it('Submit is disabled until a star is selected', () => {
      render(<PlaybookRating {...defaultProps()} />);
      expect(screen.getByTestId('rating-submit')).toBeDisabled();
    });

    it('enables Submit after clicking a star', () => {
      render(<PlaybookRating {...defaultProps()} />);
      fireEvent.click(screen.getByTestId('star-4'));
      expect(screen.getByTestId('rating-submit')).not.toBeDisabled();
    });

    it('calls onSkip when Skip is clicked', () => {
      const props = defaultProps();
      render(<PlaybookRating {...props} />);
      fireEvent.click(screen.getByTestId('rating-skip'));
      expect(props.onSkip).toHaveBeenCalledTimes(1);
    });

    it('posts review and calls onSubmit', async () => {
      mockApiFetch.mockResolvedValue({});
      const props = defaultProps();
      render(<PlaybookRating {...props} />);

      fireEvent.click(screen.getByTestId('star-5'));
      fireEvent.change(screen.getByTestId('rating-comment'), {
        target: { value: 'Great crew!' },
      });
      fireEvent.click(screen.getByTestId('rating-submit'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/playbooks/community/cp-1/reviews',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      await waitFor(() => {
        expect(props.onSubmit).toHaveBeenCalled();
      });
    });
  });

  // ── PlaybookVersionBanner ─────────────────────────────────────────────
  describe('Community — PlaybookVersionBanner', () => {
    const defaultProps = () => ({
      playbookName: 'Security Audit Crew',
      currentVersion: '1.0.0',
      newVersion: '1.1.0',
      changes: 'Added OWASP Top 10 coverage',
      onUpdate: vi.fn(),
      onKeep: vi.fn(),
      onViewDiff: vi.fn(),
    });

    it('shows playbook name with version info', () => {
      render(<PlaybookVersionBanner {...defaultProps()} />);
      expect(screen.getByTestId('playbook-version-banner')).toBeInTheDocument();
      expect(screen.getByText(/Security Audit Crew/)).toBeInTheDocument();
      expect(screen.getByText(/v1\.0\.0 → v1\.1\.0/)).toBeInTheDocument();
    });

    it('shows change description', () => {
      render(<PlaybookVersionBanner {...defaultProps()} />);
      expect(screen.getByText('Added OWASP Top 10 coverage')).toBeInTheDocument();
    });

    it('calls onUpdate when Update button is clicked', () => {
      const props = defaultProps();
      render(<PlaybookVersionBanner {...props} />);
      fireEvent.click(screen.getByTestId('version-update-btn'));
      expect(props.onUpdate).toHaveBeenCalledTimes(1);
    });

    it('calls onKeep when Keep current button is clicked', () => {
      const props = defaultProps();
      render(<PlaybookVersionBanner {...props} />);
      fireEvent.click(screen.getByTestId('version-keep-btn'));
      expect(props.onKeep).toHaveBeenCalledTimes(1);
    });

    it('calls onViewDiff when View changes button is clicked', () => {
      const props = defaultProps();
      render(<PlaybookVersionBanner {...props} />);
      fireEvent.click(screen.getByTestId('version-diff-btn'));
      expect(props.onViewDiff).toHaveBeenCalledTimes(1);
    });
  });

  // ── EmptyState ────────────────────────────────────────────────────────
  describe('Shared — EmptyState', () => {
    it('renders icon, title, and description', () => {
      render(<EmptyState icon="📭" title="No items" description="Nothing here yet." />);
      expect(screen.getByText('📭')).toBeInTheDocument();
      expect(screen.getByText('No items')).toBeInTheDocument();
      expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    });

    it('renders action button that fires onClick', () => {
      const onClick = vi.fn();
      render(
        <EmptyState icon="📭" title="No items" action={{ label: 'Add item', onClick }} />,
      );
      const btn = screen.getByText('Add item');
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('omits action button when no action prop is passed', () => {
      render(<EmptyState icon="📭" title="No items" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  // ── SkeletonCard ──────────────────────────────────────────────────────
  describe('Shared — SkeletonCard', () => {
    it('renders with animate-pulse class', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstElementChild!;
      expect(card.className).toContain('animate-pulse');
    });

    it('renders default 3 skeleton lines', () => {
      const { container } = render(<SkeletonCard />);
      // lines inside the space-y-2 container
      const lines = container.querySelectorAll('.space-y-2 > div');
      expect(lines.length).toBe(3);
    });

    it('renders custom number of lines', () => {
      const { container } = render(<SkeletonCard lines={5} />);
      const lines = container.querySelectorAll('.space-y-2 > div');
      expect(lines.length).toBe(5);
    });

    it('SkeletonList renders specified count of cards', () => {
      const { container } = render(<SkeletonList count={4} />);
      const cards = container.querySelectorAll('[aria-busy="true"][aria-hidden="true"]');
      expect(cards.length).toBe(4);
    });
  });

  // ── ErrorPage ─────────────────────────────────────────────────────────
  describe('Shared — ErrorPage', () => {
    it('renders default title when none provided', () => {
      render(<ErrorPage />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders custom title, message, and detail', () => {
      render(
        <ErrorPage
          title="Not Found"
          message="The page you requested does not exist."
          detail="GET /api/missing returned 404"
        />,
      );
      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(screen.getByText('The page you requested does not exist.')).toBeInTheDocument();
      expect(screen.getByText('GET /api/missing returned 404')).toBeInTheDocument();
    });

    it('renders Retry button that fires onRetry', () => {
      const onRetry = vi.fn();
      render(<ErrorPage onRetry={onRetry} />);
      const btn = screen.getByText('Retry');
      fireEvent.click(btn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('renders Go to Dashboard button that fires onGoHome', () => {
      const onGoHome = vi.fn();
      render(<ErrorPage onGoHome={onGoHome} />);
      const btn = screen.getByText('Go to Dashboard');
      fireEvent.click(btn);
      expect(onGoHome).toHaveBeenCalledTimes(1);
    });

    it('renders status code when provided', () => {
      render(<ErrorPage statusCode={404} title="Not Found" />);
      expect(screen.getByText('404')).toBeInTheDocument();
    });
  });
});
