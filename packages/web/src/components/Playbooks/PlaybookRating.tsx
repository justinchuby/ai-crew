import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { useToastStore } from '../Toast';

// ── Types ──────────────────────────────────────────────────────────

interface PlaybookRatingProps {
  playbookId: string;
  onSubmit: () => void;
  onSkip: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function PlaybookRating({ playbookId, onSubmit, onSkip }: PlaybookRatingProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const add = useToastStore((s) => s.add);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await apiFetch(`/playbooks/community/${playbookId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      add('success', 'Thanks for your review!');
      onSubmit();
    } catch (err) {
      add('error', err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const displayed = hovered || rating;

  return (
    <div
      className="bg-th-bg-alt border border-th-border rounded-xl p-5 max-w-sm mx-auto"
      data-testid="playbook-rating"
    >
      <h3 className="text-sm font-semibold text-th-text text-center mb-4">
        Rate this playbook
      </h3>

      {/* Stars */}
      <div
        className="flex items-center justify-center gap-1 mb-4"
        role="radiogroup"
        aria-label="Playbook rating"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' && star < 5) {
                setRating(star + 1);
              } else if (e.key === 'ArrowLeft' && star > 1) {
                setRating(star - 1);
              }
            }}
            className="text-2xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent/50 rounded"
            data-testid={`star-${star}`}
          >
            <span className={star <= displayed ? 'text-yellow-500' : 'text-th-text-muted'}>
              {star <= displayed ? '★' : '☆'}
            </span>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <p className="text-center text-xs text-th-text-muted mb-3">
          {rating === 1 && 'Poor'}
          {rating === 2 && 'Fair'}
          {rating === 3 && 'Good'}
          {rating === 4 && 'Great'}
          {rating === 5 && 'Excellent'}
        </p>
      )}

      {/* Comment textarea */}
      <div className="mb-4">
        <label className="block text-[11px] text-th-text-muted mb-1">
          Review (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="Share your experience with this playbook…"
          className="w-full px-3 py-1.5 text-sm bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent focus:outline-none resize-none h-20"
          maxLength={500}
          data-testid="rating-comment"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onSkip}
          className="px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text transition-colors"
          data-testid="rating-skip"
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="px-4 py-1.5 text-xs font-medium bg-accent/20 text-accent rounded-md hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="rating-submit"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
