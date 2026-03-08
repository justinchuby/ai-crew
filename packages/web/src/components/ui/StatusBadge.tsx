/**
 * StatusBadge — Consistent status indicator across Flightdeck.
 *
 * Standardizes the 5 color variants used for agent lifecycle, connectivity,
 * and provider status. Replaces ad-hoc inline badge implementations.
 */
import type { ReactNode } from 'react';

// ── Types ───────────────────────────────────────────────────────────

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type StatusSize = 'sm' | 'md';

export interface StatusBadgeProps {
  /** Color variant */
  variant: StatusVariant;
  /** Text label to display */
  label: string;
  /** Size: sm (10px text) or md (11px text). Default: sm */
  size?: StatusSize;
  /** Optional leading icon (e.g., lucide-react element) */
  icon?: ReactNode;
  /** Show only a colored dot with no label */
  dot?: boolean;
  /** Pulse animation on the dot (for active/live statuses) */
  pulse?: boolean;
  /** Additional className */
  className?: string;
}

// ── Variant styles ──────────────────────────────────────────────────

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: 'text-green-400 bg-green-400/10',
  warning: 'text-amber-400 bg-amber-400/10',
  error:   'text-red-400 bg-red-400/10',
  info:    'text-blue-400 bg-blue-400/10',
  neutral: 'text-gray-400 bg-gray-400/10',
};

const DOT_CLASSES: Record<StatusVariant, string> = {
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  error:   'bg-red-400',
  info:    'bg-blue-400',
  neutral: 'bg-gray-400',
};

const SIZE_CLASSES: Record<StatusSize, string> = {
  sm: 'text-[10px] px-2 py-0.5 gap-1',
  md: 'text-[11px] px-2.5 py-1 gap-1.5',
};

const DOT_SIZE: Record<StatusSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
};

// ── Component ───────────────────────────────────────────────────────

export function StatusBadge({
  variant,
  label,
  size = 'sm',
  icon,
  dot,
  pulse,
  className = '',
}: StatusBadgeProps) {
  if (dot) {
    return (
      <span
        className={`inline-flex items-center ${SIZE_CLASSES[size]} font-medium rounded-full ${VARIANT_CLASSES[variant]} ${className}`}
        role="status"
        aria-label={label}
        data-testid="status-badge"
      >
        <span className="relative flex">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${DOT_CLASSES[variant]}`}
            />
          )}
          <span className={`relative inline-flex rounded-full ${DOT_SIZE[size]} ${DOT_CLASSES[variant]}`} />
        </span>
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center ${SIZE_CLASSES[size]} font-medium rounded-full ${VARIANT_CLASSES[variant]} ${className}`}
      role="status"
      data-testid="status-badge"
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {label}
    </span>
  );
}

// ── Mapping helpers ─────────────────────────────────────────────────

/** Map common agent statuses to StatusBadge variant + label. */
export function agentStatusProps(
  status: string,
  liveStatus?: string | null,
): { variant: StatusVariant; label: string } {
  if (liveStatus === 'running') return { variant: 'success', label: 'Running' };
  if (liveStatus === 'creating') return { variant: 'warning', label: 'Starting' };
  if (liveStatus === 'failed')   return { variant: 'error', label: 'Failed' };

  switch (status) {
    case 'busy':       return { variant: 'info', label: 'Busy' };
    case 'idle':       return { variant: 'warning', label: 'Idle' };
    case 'retired':    return { variant: 'neutral', label: 'Retired' };
    case 'terminated': return { variant: 'error', label: 'Terminated' };
    case 'active':
    case 'connected':  return { variant: 'success', label: 'Active' };
    default:           return { variant: 'neutral', label: status };
  }
}

/** Map connectivity states to StatusBadge variant + label. */
export function connectionStatusProps(
  state: string,
): { variant: StatusVariant; label: string } {
  switch (state) {
    case 'connected':    return { variant: 'success', label: 'Online' };
    case 'reconnecting': return { variant: 'warning', label: 'Reconnecting' };
    case 'degraded':     return { variant: 'warning', label: 'Degraded' };
    case 'disconnected': return { variant: 'error', label: 'Disconnected' };
    case 'stopped':      return { variant: 'error', label: 'Stopped' };
    default:             return { variant: 'neutral', label: state };
  }
}

/** Map provider installation/auth state to StatusBadge variant + label. */
export function providerStatusProps(provider: {
  installed: boolean;
  authenticated: boolean | null;
}): { variant: StatusVariant; label: string } {
  if (!provider.installed) return { variant: 'neutral', label: 'Not installed' };
  if (provider.authenticated === true) return { variant: 'success', label: 'Ready' };
  if (provider.authenticated === false) return { variant: 'warning', label: 'Not authenticated' };
  return { variant: 'info', label: 'Installed' };
}
