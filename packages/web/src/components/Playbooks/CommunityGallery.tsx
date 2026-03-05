import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, Star, Users, Sparkles } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { EmptyState } from '../Shared';

// ── Types ──────────────────────────────────────────────────────────

type PlaybookCategory =
  | 'development'
  | 'testing'
  | 'security'
  | 'devops'
  | 'documentation'
  | 'data'
  | 'design'
  | 'other';

interface CommunityPlaybook {
  id: string;
  name: string;
  description: string;
  publisher: string;
  category: PlaybookCategory;
  tags: string[];
  rating: { average: number; count: number };
  useCount: number;
  version: string;
  publishedAt: string;
  featured: boolean;
  roles: Array<{ id: string; name: string; icon: string; model?: string }>;
  intentRules?: number;
  budget?: number;
}

type SortOption = 'popular' | 'highest-rated' | 'newest';

const CATEGORIES: Array<{ value: PlaybookCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'development', label: 'Development' },
  { value: 'testing', label: 'Testing' },
  { value: 'security', label: 'Security' },
  { value: 'devops', label: 'DevOps' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'data', label: 'Data' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Other' },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popular', label: 'Popular' },
  { value: 'highest-rated', label: 'Highest rated' },
  { value: 'newest', label: 'Newest' },
];

const PAGE_SIZE = 12;

// ── Helpers ────────────────────────────────────────────────────────

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q);
}

function categoryLabel(cat: PlaybookCategory): string {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

// ── Component ──────────────────────────────────────────────────────

interface CommunityGalleryProps {
  onSelect: (playbook: CommunityPlaybook) => void;
}

export function CommunityGallery({ onSelect }: CommunityGalleryProps) {
  const [playbooks, setPlaybooks] = useState<CommunityPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PlaybookCategory | 'all'>('all');
  const [sort, setSort] = useState<SortOption>('popular');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CommunityPlaybook[]>('/playbooks/community');
      setPlaybooks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load community playbooks');
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = [...playbooks];

    // Category filter
    if (category !== 'all') {
      list = list.filter((p) => p.category === category);
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(
        (p) =>
          fuzzyMatch(p.name, q) ||
          fuzzyMatch(p.description, q) ||
          fuzzyMatch(p.publisher, q) ||
          p.tags.some((t) => fuzzyMatch(t, q)),
      );
    }

    // Sort
    switch (sort) {
      case 'popular':
        list.sort((a, b) => b.useCount - a.useCount);
        break;
      case 'highest-rated':
        list.sort((a, b) => b.rating.average - a.rating.average);
        break;
      case 'newest':
        list.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        break;
    }

    return list;
  }, [playbooks, category, search, sort]);

  const featured = useMemo(() => filtered.filter((p) => p.featured), [filtered]);
  const regular = useMemo(() => filtered.filter((p) => !p.featured), [filtered]);
  const visible = regular.slice(0, visibleCount);
  const hasMore = visibleCount < regular.length;

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, category, sort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="community-loading">
        <div className="text-sm text-th-text-muted animate-pulse">Loading community playbooks…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="community-error">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchPlaybooks}
          className="px-3 py-1.5 text-xs font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-6" data-testid="community-gallery">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks…"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none"
            aria-label="Search community playbooks"
          />
        </div>

        {/* Category filter */}
        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PlaybookCategory | 'all')}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none cursor-pointer"
            aria-label="Filter by category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-th-text-muted pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none cursor-pointer"
            aria-label="Sort playbooks"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-th-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Featured section */}
      {featured.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-th-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles size={12} className="text-yellow-500" />
            Featured
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featured.map((pb) => (
              <FeaturedCard key={pb.id} playbook={pb} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      {/* Regular grid */}
      <div>
        {featured.length > 0 && (
          <h4 className="text-[11px] font-medium text-th-text-muted uppercase tracking-wider mb-3">
            All Playbooks
          </h4>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-th-border rounded-lg" data-testid="community-empty">
            <EmptyState icon="📚" title="No playbooks found" description="Try adjusting your search or category filter." />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((pb, i) => (
              <div key={pb.id} className="motion-stagger" style={{ '--stagger-index': i } as React.CSSProperties}>
                <CommunityCard playbook={pb} onSelect={onSelect} />
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="px-4 py-1.5 text-xs font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
              data-testid="load-more-btn"
            >
              Load more ({regular.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function FeaturedCard({
  playbook,
  onSelect,
}: {
  playbook: CommunityPlaybook;
  onSelect: (pb: CommunityPlaybook) => void;
}) {
  return (
    <div
      className="relative flex flex-col p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50 hover:shadow-md transition-all group"
      data-testid={`featured-card-${playbook.id}`}
    >
      <span className="absolute top-3 right-3 text-[9px] font-medium bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
        ⭐ Featured
      </span>

      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{playbook.roles[0]?.icon ?? '📋'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-th-text truncate">{playbook.name}</h3>
          <p className="text-[11px] text-th-text-muted">by {playbook.publisher}</p>
        </div>
      </div>

      <p className="text-xs text-th-text-muted mb-3 line-clamp-2">{playbook.description}</p>

      <div className="flex items-center gap-3 text-[11px] text-th-text-muted mb-3">
        <span className="flex items-center gap-1">
          <Users size={11} />
          {playbook.roles.length} agent{playbook.roles.length !== 1 ? 's' : ''}
        </span>
        <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded text-[10px]">
          {categoryLabel(playbook.category)}
        </span>
        <span className="text-yellow-500">{renderStars(playbook.rating.average)}</span>
        <span>({playbook.rating.count})</span>
        <span className="ml-auto">{playbook.useCount.toLocaleString()} uses</span>
      </div>

      <div className="flex items-center gap-2 mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSelect(playbook)}
          className="px-3 py-1.5 text-[11px] font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
        >
          Preview
        </button>
        <button
          onClick={() => onSelect(playbook)}
          className="px-3 py-1.5 text-[11px] font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
        >
          Use →
        </button>
      </div>
    </div>
  );
}

function CommunityCard({
  playbook,
  onSelect,
}: {
  playbook: CommunityPlaybook;
  onSelect: (pb: CommunityPlaybook) => void;
}) {
  return (
    <div
      className="relative flex flex-col p-4 rounded-lg border border-th-border bg-th-bg hover:border-accent/40 hover:shadow-sm transition-all group"
      data-testid={`community-card-${playbook.id}`}
    >
      {/* Icon + Name */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{playbook.roles[0]?.icon ?? '📋'}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-th-text truncate block">{playbook.name}</span>
          <span className="text-[10px] text-th-text-muted">{playbook.roles.length} agents</span>
        </div>
      </div>

      {/* Category + Rating */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded text-[10px]">
          {categoryLabel(playbook.category)}
        </span>
        <span className="text-yellow-500 text-[11px]">{renderStars(playbook.rating.average)}</span>
        <span className="text-[10px] text-th-text-muted">({playbook.rating.count})</span>
      </div>

      {/* Use count */}
      <p className="text-[10px] text-th-text-muted mb-1">
        {playbook.useCount.toLocaleString()} uses
      </p>

      {/* Description */}
      {playbook.description && (
        <p className="text-[11px] text-th-text-muted mt-1 line-clamp-2">{playbook.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSelect(playbook)}
          className="px-2.5 py-1 text-[11px] font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
        >
          Preview
        </button>
        <button
          onClick={() => onSelect(playbook)}
          className="px-2.5 py-1 text-[11px] font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
        >
          Use →
        </button>
      </div>
    </div>
  );
}

export type { CommunityPlaybook, PlaybookCategory };
