/**
 * Decision category labels — single source of truth for the frontend.
 * Server defines DECISION_CATEGORIES in DecisionLog.ts; keep these in sync.
 * If the server adds a category, the fallback in categoryLabel() handles it
 * gracefully until this map is updated.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  style: '🎨 Style & Formatting',
  architecture: '🏗️ Architecture',
  tool_access: '🔧 Tool Access',
  dependency: '📦 Dependencies',
  testing: '🧪 Testing',
  general: '📋 General',
};

/** Returns a display label for a decision category, with a safe fallback. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? `📋 ${category}`;
}
