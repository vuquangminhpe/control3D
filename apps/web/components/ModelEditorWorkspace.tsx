"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EditorViewer } from "@/components/3d/Editor";
import { MaterialEditor } from "@/components/3d/MaterialEditor";
import { EditModelForm } from "@/components/EditModelForm";
import { SnapshotVersionButton } from "@/components/SnapshotVersionButton";
import { useEditor } from "@/hooks/useEditor";
import type {
  TransformMode,
  TransformState,
  Vector3Tuple,
} from "@/lib/3d/types";
import type {
  ElementTypeRecord,
  ModelRecord,
  ModelVersionRecord,
} from "@/lib/model-store";

type ModelEditorWorkspaceProps = {
  elementTypes: ElementTypeRecord[];
  model: ModelRecord;
  versions: ModelVersionRecord[];
};

function formatVector(values: Vector3Tuple) {
  return values.map((value) => value.toFixed(3)).join(", ");
}

function parseVector(input: string) {
  const values = input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length === 3
    ? ([values[0], values[1], values[2]] as Vector3Tuple)
    : null;
}

export function ModelEditorWorkspace({
  elementTypes,
  model,
  versions,
}: ModelEditorWorkspaceProps) {
  const editor = useEditor({
    position: model.position,
    rotation: model.rotation,
    scale: model.scale,
  });

  const [transformInputs, setTransformInputs] = useState({
    position: formatVector(model.position),
    rotation: formatVector(model.rotation),
    scale: formatVector(model.scale),
  });

  useEffect(() => {
    setTransformInputs({
      position: formatVector(editor.transform.position),
      rotation: formatVector(editor.transform.rotation),
      scale: formatVector(editor.transform.scale),
    });
  }, [editor.transform.position, editor.transform.rotation, editor.transform.scale]);

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Edit Model</h1>
          <p>{model.name}</p>
        </div>
        <div className="inline-actions">
          <Link className="button secondary" href={`/models/${model.id}`}>
            Back to detail
          </Link>
        </div>
      </div>

      <div className="editor-toolbar" role="toolbar" aria-label="Editor controls">
        {(["translate", "rotate", "scale"] as const).map((mode) => (
          <button
            className={`mode-button${editor.mode === mode ? " active" : ""}`}
            key={mode}
            onClick={() => editor.setMode(mode as TransformMode)}
            type="button"
          >
            {mode[0].toUpperCase() + mode.slice(1)}
          </button>
        ))}
        <button
          className="mode-button"
          disabled={editor.historyIndex <= 0}
          onClick={() => editor.undo()}
          type="button"
        >
          Undo
        </button>
        <button
          className="mode-button"
          disabled={editor.historyIndex >= editor.history.length - 1}
          onClick={() => editor.redo()}
          type="button"
        >
          Redo
        </button>
        <button
          className="mode-button"
          onClick={() => editor.resetTransform()}
          type="button"
        >
          Reset transform
        </button>
      </div>

      <div className="grid model-grid" style={{ marginTop: 16 }}>
        <div className="grid">
          <div className="card viewer-shell">
            <EditorViewer
              mode={editor.mode}
              onMeshSelectionChange={editor.setSelectedMesh}
              onTransformChange={(next, commit) => {
                editor.setTransform(next, commit);
              }}
              position={editor.transform.position}
              rotation={editor.transform.rotation}
              scale={editor.transform.scale}
              selectedMaterial={editor.material}
              selectedMeshId={editor.selectedMeshId}
              src={model.fileUrl}
            />
          </div>
          <div className="card subtle">
            <h2>Version snapshots</h2>
            <SnapshotVersionButton modelId={model.id} />
            <div className="version-list">
              {versions.length ? (
                versions.map((version) => (
                  <div className="version-item" key={version.id}>
                    <span>v{version.versionNumber}</span>
                    <a href={version.fileUrl}>Open file</a>
                  </div>
                ))
              ) : (
                <p>No snapshots yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="details-panel">
          <MaterialEditor
            material={editor.material}
            onChange={(material) => editor.setMaterial(material)}
            selectedMeshName={editor.selectedMeshName}
          />
          <div className="card details-panel">
          <EditModelForm
            elementTypes={elementTypes}
            model={model}
            onTransformInputChange={(field, value) => {
              setTransformInputs((current) => ({ ...current, [field]: value }));

              const parsed = parseVector(value);
              if (!parsed) {
                return;
              }

              editor.setTransform(
                {
                  ...editor.transform,
                  [field]: parsed,
                },
                false,
              );
            }}
            transformInputs={transformInputs}
          />
          </div>
        </div>
      </div>
    </main>
  );
}
