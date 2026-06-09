"use client";

import type { MaterialDraft } from "@/lib/3d/types";

type MaterialEditorProps = {
  material: MaterialDraft | null;
  onChange: (material: MaterialDraft) => void;
  selectedMeshName: string | null;
};

export function MaterialEditor({
  material,
  onChange,
  selectedMeshName,
}: MaterialEditorProps) {
  return (
    <section className="card subtle material-panel">
      <div>
        <h2>Material editor</h2>
        <p className="inline-text">
          {selectedMeshName
            ? `Selected mesh: ${selectedMeshName}`
            : "Click a mesh in the viewer to edit its material."}
        </p>
      </div>

      <label className="field">
        <span>Color</span>
        <input
          disabled={!material}
          type="color"
          value={material?.color ?? "#c9c3b8"}
          onChange={(event) => {
            if (!material) {
              return;
            }

            onChange({ ...material, color: event.target.value });
          }}
        />
      </label>

      <label className="field range-field">
        <span>Metalness</span>
        <input
          disabled={!material}
          max="1"
          min="0"
          step="0.01"
          type="range"
          value={material?.metalness ?? 0}
          onChange={(event) => {
            if (!material) {
              return;
            }

            onChange({
              ...material,
              metalness: Number(event.target.value),
            });
          }}
        />
        <span className="range-value">{(material?.metalness ?? 0).toFixed(2)}</span>
      </label>

      <label className="field range-field">
        <span>Roughness</span>
        <input
          disabled={!material}
          max="1"
          min="0"
          step="0.01"
          type="range"
          value={material?.roughness ?? 1}
          onChange={(event) => {
            if (!material) {
              return;
            }

            onChange({
              ...material,
              roughness: Number(event.target.value),
            });
          }}
        />
        <span className="range-value">{(material?.roughness ?? 1).toFixed(2)}</span>
      </label>

      <label className="checkbox-row">
        <input
          checked={material?.wireframe ?? false}
          disabled={!material}
          type="checkbox"
          onChange={(event) => {
            if (!material) {
              return;
            }

            onChange({ ...material, wireframe: event.target.checked });
          }}
        />
        <span>Wireframe</span>
      </label>

      <label className="checkbox-row">
        <input
          checked={material?.doubleSided ?? false}
          disabled={!material}
          type="checkbox"
          onChange={(event) => {
            if (!material) {
              return;
            }

            onChange({ ...material, doubleSided: event.target.checked });
          }}
        />
        <span>Double-sided</span>
      </label>
    </section>
  );
}