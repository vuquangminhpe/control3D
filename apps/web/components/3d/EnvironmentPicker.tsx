"use client";

import {
  ENVIRONMENT_PRESETS,
  type EnvironmentPreset,
} from "@/lib/3d/types";

type EnvironmentPickerProps = {
  value: EnvironmentPreset;
  onChange: (preset: EnvironmentPreset) => void;
};

function formatLabel(preset: EnvironmentPreset) {
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

export function EnvironmentPicker({ onChange, value }: EnvironmentPickerProps) {
  return (
    <div className="viewer-toolbar-group">
      {ENVIRONMENT_PRESETS.map((preset) => (
        <button
          className={`viewer-chip${value === preset ? " active" : ""}`}
          key={preset}
          onClick={() => onChange(preset)}
          type="button"
        >
          {formatLabel(preset)}
        </button>
      ))}
    </div>
  );
}