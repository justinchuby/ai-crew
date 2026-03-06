import { TRUST_PRESETS, type TrustPreset } from './types';

interface TrustPresetBarProps {
  active: TrustPreset | null;
  onSelect: (preset: TrustPreset) => void;
}

const PRESETS: TrustPreset[] = ['conservative', 'moderate', 'autonomous'];

export function TrustPresetBar({ active, onSelect }: TrustPresetBarProps) {
  return (
    <div className="mb-4" data-testid="trust-preset-bar">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs text-th-text-muted">Trust Level:</span>
        <div className="flex gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => onSelect(preset)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                active === preset
                  ? 'bg-accent/15 border-accent/40 text-accent font-medium'
                  : 'border-th-border text-th-text-muted hover:text-th-text hover:border-th-border-hover'
              }`}
            >
              {TRUST_PRESETS[preset].label}
            </button>
          ))}
        </div>
      </div>
      {active && (
        <p className="text-[10px] text-th-text-muted ml-16">
          "{TRUST_PRESETS[active].description}"
        </p>
      )}
    </div>
  );
}
