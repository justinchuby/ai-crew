import { useWorkflowTemplates } from '../../hooks/useWorkflowRules';
import { TEMPLATE_CATEGORIES, type WorkflowTemplate } from './types';
import { EmptyState } from '../Shared';

interface Props {
  onSelect: (template: WorkflowTemplate) => void;
  onClose: () => void;
}

export function WorkflowTemplates({ onSelect, onClose }: Props) {
  const templates = useWorkflowTemplates();

  const grouped = TEMPLATE_CATEGORIES.map((cat) => ({
    category: cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-th-text">📋 Rule Templates</h3>
        <button onClick={onClose} className="text-xs text-th-text-muted hover:text-th-text">
          ← Back
        </button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon="📋" title="No templates available" description="Templates will appear when the workflow engine provides them." />
      ) : (
        grouped.map((g) => (
          <div key={g.category}>
            <div className="text-xs font-semibold text-th-text-muted uppercase tracking-wide mb-2">
              {g.category}
            </div>
            <div className="space-y-2">
              {g.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="w-full text-left p-3 rounded-lg border border-th-border-muted hover:border-accent/50 transition-colors"
                >
                  <div className="text-xs font-medium text-th-text">{t.name}</div>
                  <div className="text-[11px] text-th-text-muted mt-0.5">{t.description}</div>
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-th-bg-muted text-th-text-muted">
                    📋 Template
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
