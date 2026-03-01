import React from 'react';

export interface FilterTabItem {
  /** Unique value used to identify this tab */
  value: string;
  /** Display label */
  label: string;
  /** Optional count shown in parentheses */
  count?: number;
  /** Optional icon element rendered before the label */
  icon?: React.ReactNode;
}

export interface FilterTabsProps {
  /** Tab items to render */
  items: FilterTabItem[];
  /** Currently active tab value, or null for the "All" tab */
  activeValue: string | null;
  /** Called when a tab is clicked */
  onSelect: (value: string | null) => void;
  /** If provided, shows an "All" tab with this total count */
  allCount?: number;
  /** Additional className for the container */
  className?: string;
}

const BASE =
  'px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors';
const ACTIVE = 'bg-accent/20 text-accent border border-accent/40';
const INACTIVE =
  'text-th-text-muted hover:text-th-text hover:bg-th-bg-muted/50 border border-transparent';

export function FilterTabs({
  items,
  activeValue,
  onSelect,
  allCount,
  className,
}: FilterTabsProps) {
  return (
    <div
      className={`flex items-center gap-1 overflow-x-auto ${className ?? ''}`}
      role="tablist"
    >
      {allCount !== undefined && (
        <button
          role="tab"
          aria-selected={activeValue === null}
          onClick={() => onSelect(null)}
          className={`${BASE} ${activeValue === null ? ACTIVE : INACTIVE}`}
        >
          All ({allCount})
        </button>
      )}
      {items.map((item) => {
        const isActive = activeValue === item.value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.value)}
            className={`flex items-center gap-1.5 ${BASE} ${isActive ? ACTIVE : INACTIVE}`}
          >
            {item.icon}
            <span className="truncate max-w-[120px]">{item.label}</span>
            {item.count !== undefined && (
              <span className="text-[10px] text-th-text-muted ml-0.5">
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
