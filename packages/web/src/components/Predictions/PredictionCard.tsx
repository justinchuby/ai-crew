import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi';
import type { Prediction } from './types';
import { SEVERITY_COLORS, SEVERITY_BG, PREDICTION_ICONS, confidenceLabel } from './types';

interface Props {
  prediction: Prediction;
  onDismiss: (id: string) => void;
  compact?: boolean;
}

export function PredictionCard({ prediction, onDismiss, compact }: Props) {
  const navigate = useNavigate();
  const conf = confidenceLabel(prediction.confidence);

  const handleAction = async (action: Prediction['actions'][0]) => {
    if (action.actionType === 'navigate' && action.route) {
      navigate(action.route);
    } else if (action.actionType === 'api_call' && action.endpoint) {
      try {
        await apiFetch(action.endpoint, {
          method: action.method ?? 'POST',
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
      } catch {
        /* toast could go here */
      }
    } else if (action.actionType === 'dismiss') {
      onDismiss(prediction.id);
    }
  };

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded ${SEVERITY_BG[prediction.severity]}`}
        role="article"
        aria-label={`${prediction.title} — ${conf.text} confidence`}
      >
        <span className="text-sm">{PREDICTION_ICONS[prediction.type]}</span>
        <span className={`text-xs flex-1 truncate ${SEVERITY_COLORS[prediction.severity]}`}>
          {prediction.title}
        </span>
        <span className={`text-[10px] ${conf.color}`}>{conf.text}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-th-border-muted p-3 ${SEVERITY_BG[prediction.severity]}`}
      role="article"
      aria-label={`${prediction.title} — ${conf.text} confidence`}
    >
      <div className="flex items-start gap-2 mb-1">
        <span className="text-sm shrink-0">{PREDICTION_ICONS[prediction.type]}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold ${SEVERITY_COLORS[prediction.severity]}`}>
            {prediction.title}
          </div>
          <div className="text-[11px] text-th-text-muted mt-0.5">{prediction.detail}</div>
        </div>
        <span className={`text-[10px] shrink-0 ${conf.color}`}>{conf.text}</span>
        <button
          onClick={() => onDismiss(prediction.id)}
          className="text-th-text-muted hover:text-th-text text-xs shrink-0"
          aria-label="Dismiss prediction"
        >
          ✕
        </button>
      </div>

      {prediction.actions.length > 0 && (
        <div className="flex gap-2 mt-2 ml-6">
          {prediction.actions.slice(0, 3).map((action, i) => (
            <button
              key={i}
              onClick={() => handleAction(action)}
              className="text-[11px] px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
