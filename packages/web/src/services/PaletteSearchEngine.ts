import Fuse, { type IFuseOptions } from 'fuse.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type PaletteItemType =
  | 'navigation'
  | 'agent'
  | 'task'
  | 'action'
  | 'nl-command'
  | 'setting'
  | 'suggestion'
  | 'recent';

export interface PaletteItem {
  id: string;
  type: PaletteItemType;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  action: () => void;
  shortcut?: string;
  score?: number;
  badge?: string;
  /** Extra data for preview — keyed by item type */
  agentId?: string;
}

export interface PaletteGroup {
  type: PaletteItemType;
  label: string;
  items: PaletteItem[];
  total: number;
}

// ── Group display order & labels ────────────────────────────────────────────

const TYPE_ORDER: PaletteItemType[] = [
  'suggestion',
  'recent',
  'agent',
  'task',
  'nl-command',
  'navigation',
  'action',
  'setting',
];

const TYPE_LABELS: Record<PaletteItemType, string> = {
  suggestion: '💡 Suggestions',
  recent: '🕐 Recent',
  agent: '🤖 Agents',
  task: '📋 Tasks',
  'nl-command': '🗣 Commands',
  navigation: '📋 Navigation',
  action: '⚡ Actions',
  setting: '⚙ Settings',
};

// ── Search Engine ───────────────────────────────────────────────────────────

export class PaletteSearchEngine {
  private fuse: Fuse<PaletteItem>;
  private items: PaletteItem[] = [];

  constructor() {
    this.fuse = new Fuse([], this.fuseOptions());
  }

  private fuseOptions(): IFuseOptions<PaletteItem> {
    return {
      keys: [
        { name: 'label', weight: 0.4 },
        { name: 'description', weight: 0.3 },
        { name: 'keywords', weight: 0.2 },
        { name: 'type', weight: 0.1 },
      ],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
      minMatchCharLength: 2,
    };
  }

  updateItems(items: PaletteItem[]): void {
    this.items = items;
    this.fuse = new Fuse(items, this.fuseOptions());
  }

  search(query: string): PaletteItem[] {
    if (!query.trim()) return this.items;
    return this.fuse
      .search(query)
      .map((r) => ({ ...r.item, score: 1 - (r.score ?? 0) }));
  }

  /** Group results by type, respecting TYPE_ORDER, capped per group. */
  static groupResults(items: PaletteItem[], maxPerGroup = 3): PaletteGroup[] {
    const map = new Map<PaletteItemType, PaletteItem[]>();
    for (const item of items) {
      const list = map.get(item.type) ?? [];
      list.push(item);
      map.set(item.type, list);
    }
    return TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({
      type: t,
      label: TYPE_LABELS[t],
      items: map.get(t)!.slice(0, maxPerGroup),
      total: map.get(t)!.length,
    }));
  }

  /** Group results with no per-group cap (for default / empty-query view). */
  static groupAll(items: PaletteItem[]): PaletteGroup[] {
    return PaletteSearchEngine.groupResults(items, Infinity);
  }
}
