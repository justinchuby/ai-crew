interface Props {
  icon: string;
  name: string;
  model: string;
  color: string;
  description: string;
}

export function RolePreview({ icon, name, model, color, description }: Props) {
  return (
    <div
      className="border border-th-border rounded-xl p-4 max-w-md"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-medium text-th-text">{name}</span>
        </div>
        <span className="w-2 h-2 rounded-full bg-green-400" />
      </div>
      {description && (
        <div className="text-xs text-th-text-muted mb-2 line-clamp-2">
          {description}
        </div>
      )}
      <div className="h-1.5 bg-th-bg-alt rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-emerald-500 rounded-full"
          style={{ width: '0%' }}
        />
      </div>
      <div className="text-[10px] text-th-text-muted">
        Model: {model.charAt(0).toUpperCase() + model.slice(1)}
      </div>
    </div>
  );
}
