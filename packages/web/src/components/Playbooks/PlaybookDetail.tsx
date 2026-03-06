import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Star, Users, Clock, GitFork, Shield } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { CommunityPlaybook } from './CommunityGallery';

// ── Types ──────────────────────────────────────────────────────────

interface PlaybookReview {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

interface PlaybookDetailProps {
  playbook: CommunityPlaybook;
  onBack: () => void;
  onUse: () => void;
  onFork: () => void;
  onRate: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function renderStars(rating: number): string {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Component ──────────────────────────────────────────────────────

export function PlaybookDetail({ playbook, onBack, onUse, onFork, onRate }: PlaybookDetailProps) {
  const [reviews, setReviews] = useState<PlaybookReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const data = await apiFetch<PlaybookReview[]>(
        `/playbooks/community/${playbook.id}/reviews`,
      );
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, [playbook.id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return (
    <div className="space-y-6" data-testid="playbook-detail">
      {/* Back link */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-th-text-muted hover:text-th-text transition-colors"
        aria-label="Back to gallery"
      >
        <ArrowLeft size={14} />
        Back to gallery
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <span className="text-4xl">{playbook.roles[0]?.icon ?? '📋'}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-th-text">{playbook.name}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-th-text-muted">
            <span className="text-yellow-500">{renderStars(playbook.rating.average)}</span>
            <span>
              {playbook.rating.average.toFixed(1)} ({playbook.rating.count} review
              {playbook.rating.count !== 1 ? 's' : ''})
            </span>
            <span>by <strong className="text-th-text">{playbook.publisher}</strong></span>
            <span className="flex items-center gap-1">
              <Users size={11} />
              {playbook.useCount.toLocaleString()} uses
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatDate(playbook.publishedAt)}
            </span>
            <span className="bg-accent/20 text-accent px-1.5 py-0.5 rounded text-[10px]">
              v{playbook.version}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRate}
            className="px-3 py-1.5 text-xs font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
            aria-label="Rate this playbook"
          >
            ⭐ Rate this
          </button>
          <button
            onClick={onFork}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-th-text-muted border border-th-border rounded-md hover:text-th-text hover:border-accent/40 transition-colors"
          >
            <GitFork size={12} />
            Fork &amp; customize →
          </button>
          <button
            onClick={onUse}
            className="px-4 py-1.5 text-xs font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors"
          >
            Use as-is →
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="bg-th-bg-alt border border-th-border rounded-lg p-4">
        <h3 className="text-xs font-semibold text-th-text mb-2">Description</h3>
        <p className="text-sm text-th-text-muted leading-relaxed">{playbook.description}</p>
        {playbook.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {playbook.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] bg-th-bg border border-th-border-muted rounded-full text-th-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Crew composition */}
      <div>
        <h3 className="text-xs font-semibold text-th-text mb-3 flex items-center gap-1.5">
          <Users size={13} />
          Crew Composition ({playbook.roles.length} agent{playbook.roles.length !== 1 ? 's' : ''})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {playbook.roles.map((role) => (
            <div
              key={role.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-th-border bg-th-bg"
            >
              <span className="text-xl">{role.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-th-text truncate">{role.name}</p>
                {role.model && (
                  <p className="text-[10px] text-th-text-muted truncate">{role.model}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="flex flex-wrap gap-4">
        {playbook.intentRules != null && playbook.intentRules > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-th-border bg-th-bg">
            <Shield size={13} className="text-th-text-muted" />
            <div>
              <p className="text-[10px] text-th-text-muted">Intent Rules</p>
              <p className="text-xs font-medium text-th-text">{playbook.intentRules}</p>
            </div>
          </div>
        )}
        {playbook.budget != null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-th-border bg-th-bg">
            <span className="text-sm">💰</span>
            <div>
              <p className="text-[10px] text-th-text-muted">Budget</p>
              <p className="text-xs font-medium text-th-text">${playbook.budget}</p>
            </div>
          </div>
        )}
      </div>

      {/* Reviews */}
      <div>
        <h3 className="text-xs font-semibold text-th-text mb-3 flex items-center gap-1.5">
          <Star size={13} />
          Reviews ({reviews.length})
        </h3>

        {loadingReviews ? (
          <p className="text-xs text-th-text-muted animate-pulse">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-th-border rounded-lg">
            <p className="text-xs text-th-text-muted">No reviews yet. Be the first!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="px-4 py-3 rounded-lg border border-th-border bg-th-bg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-yellow-500 text-xs">{renderStars(review.rating)}</span>
                  <span className="text-[10px] text-th-text-muted">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-xs text-th-text-muted">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type { PlaybookReview };
