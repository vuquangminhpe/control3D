"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type WorkspaceTab = "scene" | "materials" | "metadata" | "versions";

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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("scene");
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

  const workspaceTabs = useMemo(
    () =>
      [
        {
          id: "scene",
          label: "Scene",
          description: "Live transform status and selected mesh",
        },
        {
          id: "materials",
          label: "Materials",
          description: "Per-mesh material tuning",
        },
        {
          id: "metadata",
          label: "Metadata",
          description: "Name, tags and default transform",
        },
        {
          id: "versions",
          label: "Versions",
          description: "Snapshots and published revisions",
        },
      ] satisfies Array<{ id: WorkspaceTab; label: string; description: string }>,
    [],
  );

  return (
    <main className="mixamo-page">
      <div className="mixamo-object-header">
        <div className="page-title-block">
          <span>EDITOR WORKSPACE</span>
          <h1>Edit Model</h1>
          <p>{model.name}</p>
          <div className="meta-row">
            <span className="pill">{model.format.toUpperCase()}</span>
            <span className="pill">{versions.length} snapshots</span>
            <span className="pill">{model.category}</span>
          </div>
        </div>
        <div className="inline-actions">
          <Link className="mixamo-secondary-action" href={`/models/${model.id}`}>
            Back to detail
          </Link>
          <a className="mixamo-primary-action" href={`/api/models/${model.id}/download?asset=delivery`}>
            Download delivery
          </a>
        </div>
      </div>

      <div className="editor-hero">
        <div className="editor-toolbar-card">
          <div className="section-heading">
            <div>
              <h2>Transform controls</h2>
              <p className="helper-text">
                Keep the viewport focused while switching between scene tasks.
              </p>
            </div>
          </div>
          <div className="editor-toolbar" role="toolbar" aria-label="Editor controls">
            {(["orbit", "select", "transform"] as const).map((mode) => (
              <button
                className={`mode-button${editor.interactionMode === mode ? " active" : ""}`}
                key={mode}
                onClick={() => editor.setInteractionMode(mode)}
                type="button"
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
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
        </div>

        <div className="editor-state-card">
          <div>
            <span className="stat-label">Selected mesh</span>
            <strong>{editor.selectedMeshName ?? "None"}</strong>
          </div>
          <div>
            <span className="stat-label">History</span>
            <strong>{editor.historyIndex + 1}/{editor.history.length}</strong>
          </div>
          <div>
            <span className="stat-label">Mode</span>
            <strong>{editor.mode[0].toUpperCase() + editor.mode.slice(1)}</strong>
          </div>
        </div>
      </div>

      <div className="grid editor-layout">
        <div className="grid editor-main-column">
          <div className="card viewer-shell">
            <EditorViewer
              interactionMode={editor.interactionMode}
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

          <div className="card subtle transform-readout">
            <div className="section-heading">
              <div>
                <h2>Transform readout</h2>
                <p className="helper-text">
                  Live values stay synced with the gizmo and the metadata form.
                </p>
              </div>
            </div>
            <div className="details-list transform-readout-grid">
              <div>
                <strong>Position</strong>
                <span>{transformInputs.position}</span>
              </div>
              <div>
                <strong>Rotation</strong>
                <span>{transformInputs.rotation}</span>
              </div>
              <div>
                <strong>Scale</strong>
                <span>{transformInputs.scale}</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="card editor-side-panel">
          <div className="section-heading">
            <div>
              <h2>Workspace tabs</h2>
              <p className="helper-text">
                Jump between scene, material, metadata and version tasks.
              </p>
            </div>
          </div>

          <div
            aria-label="Editor sections"
            className="tab-navbar"
            role="tablist"
          >
            {workspaceTabs.map((tab) => (
              <button
                aria-controls={`editor-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={`tab-nav-button${activeTab === tab.id ? " active" : ""}`}
                id={`editor-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <span>{tab.label}</span>
                <small>{tab.description}</small>
              </button>
            ))}
          </div>

          <div
            aria-labelledby="editor-tab-scene"
            className={`tab-panel${activeTab === "scene" ? " active" : ""}`}
            id="editor-panel-scene"
            role="tabpanel"
          >
            <div className="card subtle details-panel">
              <h3>Scene status</h3>
              <div className="details-list">
                <div>
                  <strong>Mesh selection:</strong> {editor.selectedMeshName ?? "No mesh selected"}
                </div>
                <div>
                  <strong>Active transform mode:</strong> {editor.mode}
                </div>
                <div>
                  <strong>Position:</strong> {transformInputs.position}
                </div>
                <div>
                  <strong>Rotation:</strong> {transformInputs.rotation}
                </div>
                <div>
                  <strong>Scale:</strong> {transformInputs.scale}
                </div>
              </div>
            </div>
          </div>

          <div
            aria-labelledby="editor-tab-materials"
            className={`tab-panel${activeTab === "materials" ? " active" : ""}`}
            id="editor-panel-materials"
            role="tabpanel"
          >
            <MaterialEditor
              material={editor.material}
              onChange={(material) => editor.setMaterial(material)}
              selectedMeshName={editor.selectedMeshName}
            />
          </div>

          <div
            aria-labelledby="editor-tab-metadata"
            className={`tab-panel${activeTab === "metadata" ? " active" : ""}`}
            id="editor-panel-metadata"
            role="tabpanel"
          >
            <div className="card subtle details-panel">
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

          <div
            aria-labelledby="editor-tab-versions"
            className={`tab-panel${activeTab === "versions" ? " active" : ""}`}
            id="editor-panel-versions"
            role="tabpanel"
          >
            <div className="card subtle details-panel">
              <h3>Version snapshots</h3>
              <SnapshotVersionButton modelId={model.id} />
              <div className="version-list">
                {versions.length ? (
                  versions.map((version) => (
                    <div className="version-item" key={version.id}>
                      <div>
                        <strong>v{version.versionNumber}</strong>
                      </div>
                      <a href={version.fileUrl}>Open file</a>
                    </div>
                  ))
                ) : (
                  <p>No snapshots yet.</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
