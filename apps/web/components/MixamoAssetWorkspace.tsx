"use client";

import { useRouter } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useState, useTransition, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { InspectViewer } from "@/components/ModelViewer";
import { RiggedAnimationPreview } from "@/components/RiggedAnimationPreview";
import { RiggingMarkerPanel } from "@/components/RiggingMarkerPanel";
import { getRiggingMetadata } from "@/lib/model-rigging";
import type {
  AnimationActionRecord,
  AnimationAssetRecord,
  CharacterActionLinkRecord,
  ModelRecord,
} from "@/lib/model-store";

type WorkspaceTab = "characters" | "animations";
type UploadModalType = WorkspaceTab | null;

type MixamoAssetWorkspaceProps = {
  animations: AnimationAssetRecord[];
  characters: ModelRecord[];
  stats: {
    totalDownloads: number;
    totalModels: number;
  };
};

type UploadEntry = {
  fileName: string;
  sourceFileName: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isSupportedUploadEntry(fileName: string) {
  return /\.(fbx|zip|glb|gltf|obj)$/i.test(fileName);
}

function isCharacterCandidate(fileName: string) {
  return /\.(fbx|glb|gltf|obj)$/i.test(fileName);
}

function listZipEntries(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const entries: string[] = [];
  let offset = 0;

  while (offset <= view.byteLength - 46) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      offset += 1;
      continue;
    }

    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > view.byteLength) break;

    const fileName = decoder.decode(bytes.subarray(fileNameStart, fileNameEnd));
    if (fileName && !fileName.endsWith("/") && isSupportedUploadEntry(fileName)) {
      entries.push(fileName);
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

async function getUploadEntries(files: File[]) {
  const entries: UploadEntry[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const zipEntries = listZipEntries(await file.arrayBuffer());
      for (const fileName of zipEntries) {
        if (isSupportedUploadEntry(fileName)) entries.push({ fileName, sourceFileName: file.name });
      }
      continue;
    }

    if (isSupportedUploadEntry(file.name)) entries.push({ fileName: file.name, sourceFileName: file.name });
  }
  return entries;
}

function getCharacterStatus(character: ModelRecord) {
  const rigging = getRiggingMetadata(character);
  if (rigging.status === "rigged") return "Rigged";
  if (rigging.status === "marker_ready") return "Markers ready";
  if (rigging.status === "failed") return "Rig failed";
  return "Needs auto-rig";
}

function getActionLabel(action: AnimationActionRecord, index: number) {
  return action.name || `Action ${index + 1}`;
}

function getRiggedPreviewUrl(character: ModelRecord | null) {
  if (!character) return null;
  return getRiggingMetadata(character).riggedModelUrl ?? null;
}

function KeyBindingInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [localValue, setLocalValue] = useState<string | null>(value);
  const keysPressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!recording) {
      setLocalValue(value);
    }
  }, [value, recording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    let keyName = e.key;
    if (e.code === "Space") {
      keyName = "Space";
    }

    if (keyName === "Control") keyName = "Ctrl";
    if (keyName === "Escape") {
      setLocalValue(null);
      onChange(null);
      setRecording(false);
      keysPressed.current.clear();
      return;
    }

    if (keyName.length === 1) {
      keyName = keyName.toUpperCase();
    }

    keysPressed.current.add(keyName);

    const keysArray = Array.from(keysPressed.current);
    keysArray.sort((a, b) => {
      const modifiers = ["Ctrl", "Shift", "Alt"];
      const aIdx = modifiers.indexOf(a);
      const bIdx = modifiers.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    setLocalValue(keysArray.join("+"));
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const hasOnlyModifiers = Array.from(keysPressed.current).every((k) =>
      ["Ctrl", "Shift", "Alt"].includes(k),
    );
    if (!hasOnlyModifiers && keysPressed.current.size > 0) {
      const finalVal = localValue;
      onChange(finalVal);
      setRecording(false);
      keysPressed.current.clear();
    }
  };

  const handleBlur = () => {
    if (recording) {
      onChange(localValue);
      setRecording(false);
      keysPressed.current.clear();
    }
  };

  return (
    <div style={{ position: "relative", width: "72px" }}>
      <input
        type="text"
        readOnly
        disabled={disabled}
        value={recording ? "Press..." : (localValue || "No key")}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onFocus={() => {
          setRecording(true);
          keysPressed.current.clear();
        }}
        onBlur={handleBlur}
        style={{
          width: "100%",
          height: "28px",
          border: recording ? "1px solid #0d9488" : "1px solid #cbd5e0",
          borderRadius: "6px",
          background: recording ? "#f0fdfa" : "#fff",
          color: recording ? "#0d9488" : "#2d3748",
          fontSize: "11px",
          fontWeight: "800",
          textAlign: "center",
          cursor: "pointer",
          outline: "none",
        }}
        title="Click to record keys. Press Escape to clear."
      />
      {value && !recording && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          style={{
            position: "absolute",
            right: "4px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: "#e53e3e",
            cursor: "pointer",
            fontSize: "10px",
            padding: "2px",
            fontWeight: "bold",
          }}
          title="Clear binding"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function getCharacterActions(character: ModelRecord | null): CharacterActionLinkRecord[] {
  const manifest = character?.customProps?.characterAnimation;
  if (!manifest || typeof manifest !== "object" || !("actions" in manifest) || !Array.isArray(manifest.actions)) {
    return [];
  }
  return manifest.actions.filter((action): action is CharacterActionLinkRecord => {
    return Boolean(action && typeof action === "object" && "id" in action && "name" in action);
  });
}

function writeCharacterActions(
  customProps: ModelRecord["customProps"],
  actions: CharacterActionLinkRecord[],
) {
  const currentManifest =
    customProps?.characterAnimation && typeof customProps.characterAnimation === "object"
      ? customProps.characterAnimation as Record<string, unknown>
      : {};

  return {
    ...(customProps ?? {}),
    characterAnimation: {
      ...currentManifest,
      version: 1,
      mode: "external_actions",
      actions,
      updatedAt: new Date().toISOString(),
    },
  };
}

function CharacterCardViewer({ src }: { src: string }) {
  const [modelRoot, setModelRoot] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<any>(null);

  // Import ThumbnailAutoFit dynamically
  const { ThumbnailAutoFit } = require("@/components/3d/ModelLoader");

  return (
    <Canvas camera={{ position: [1.9, 1.25, 2.4], fov: 36 }} dpr={[1, 1.25]} frameloop="demand">
      <color attach="background" args={["#24313d"]} />
      <ambientLight intensity={0.9} />
      <directionalLight intensity={1.8} position={[3, 4, 3]} />
      <directionalLight intensity={0.45} position={[-3, 2, -2]} />
      <Suspense fallback={null}>
        <ModelLoader debugLabel="models-character-card" fitHeight={1.55} groundToY={0} src={src} onSceneReady={setModelRoot} />
      </Suspense>
      <ThumbnailAutoFit controlsRef={controlsRef} model={modelRoot} />
      <OrbitControls ref={controlsRef} autoRotate autoRotateSpeed={1.1} enablePan={false} enableRotate={false} enableZoom={false} makeDefault />
    </Canvas>
  );
}


export function MixamoAssetWorkspace({
  animations,
  characters,
  stats,
}: MixamoAssetWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("characters");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0]?.id ?? "");
  const [selectedAnimationId, setSelectedAnimationId] = useState(animations[0]?.id ?? "");
  const [selectedActionId, setSelectedActionId] = useState(animations[0]?.actions[0]?.id ?? "");
  const [uploadModal, setUploadModal] = useState<UploadModalType>(null);
  const [modalCharacter, setModalCharacter] = useState<ModelRecord | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(560);
  const [rightPaneWidth, setRightPaneWidth] = useState(318);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [appliedAnimation, setAppliedAnimation] = useState<{
    actionId: string;
    actionName?: string;
    animationSrc?: string | null;
    animationId: string;
    characterId: string;
    exportUrl: string;
    linkId?: string;
    previewUrl: string;
  } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplyingAnimation, setIsApplyingAnimation] = useState(false);
  const [previewingCharacterActionId, setPreviewingCharacterActionId] = useState<string | null>(null);

  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null;
  const selectedAnimation = animations.find((animation) => animation.id === selectedAnimationId) ?? animations[0] ?? null;
  const selectedAction =
    selectedAnimation?.actions.find((action) => action.id === selectedActionId)
    ?? selectedAnimation?.actions[0]
    ?? null;
  const selectedRiggedUrl = getRiggedPreviewUrl(selectedCharacter);
  const activeActionPreview = appliedAnimation?.characterId === selectedCharacter?.id
    ? appliedAnimation
    : null;

  const filteredCharacters = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return characters;
    return characters.filter((character) =>
      [character.name, character.description ?? "", character.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [characters, query]);

  const filteredAnimations = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return animations;
    return animations.filter((animation) =>
      [
        animation.name,
        animation.description ?? "",
        animation.tags.join(" "),
        animation.actions.map((action) => action.name).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [animations, query]);

  const activeItems = filteredCharacters;
  const totalPages = Math.max(1, Math.ceil(activeItems.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = activeItems.slice((currentPage - 1) * perPage, currentPage * perPage);

  const selectAnimation = (animation: AnimationAssetRecord) => {
    setSelectedAnimationId(animation.id);
    setSelectedActionId(animation.actions[0]?.id ?? "");
  };

  const previewCharacterAction = async (action: CharacterActionLinkRecord) => {
    if (!selectedCharacter) return;
    setApplyError(null);
    setAppliedAnimation({
      actionId: action.actionId,
      actionName: action.name,
      animationSrc:
        action.sourceFormat === "fbx" && action.fileUrl.toLowerCase().endsWith(".fbx")
          ? action.fileUrl
          : null,
      animationId: action.animationAssetId,
      characterId: selectedCharacter.id,
      exportUrl: selectedCharacter.fileUrl,
      linkId: action.id,
      previewUrl: selectedCharacter.fileUrl,
    });
  };

  const startPaneResize = (pane: "left" | "right", startX: number) => {
    const startLeft = leftPaneWidth;
    const startRight = rightPaneWidth;
    const onMove = (event: PointerEvent) => {
      if (pane === "left") {
        setLeftCollapsed(false);
        setLeftPaneWidth(Math.min(820, Math.max(300, startLeft + event.clientX - startX)));
        return;
      }
      setRightCollapsed(false);
      setRightPaneWidth(Math.min(460, Math.max(250, startRight - (event.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const gridTemplateColumns = `${leftCollapsed ? 0 : leftPaneWidth}px 10px minmax(0, 1fr) 10px ${rightCollapsed ? 0 : rightPaneWidth}px`;

  return (
    <main className="mixamo-page mixamo-workspace">
      <section
        className={`mixamo-split-shell${leftCollapsed ? " left-collapsed" : ""}${rightCollapsed ? " right-collapsed" : ""}`}
        style={{ gridTemplateColumns }}
      >
        <aside className="mixamo-library-pane">
          <header className="mixamo-browser-toolbar">
            <label className="mixamo-search-box">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search"
              />
            </label>
            <select
              aria-label="Assets per page"
              value={perPage}
              onChange={(event) => {
                setPerPage(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={12}>12 Per page</option>
              <option value={24}>24 Per page</option>
              <option value={48}>48 Per page</option>
            </select>
          </header>

          <nav className="mixamo-tabbar character-only" aria-label="Asset tabs">
            <button
              className="active"
              onClick={() => {
                setActiveTab("characters");
                setPage(1);
              }}
              type="button"
            >
              Character + animation <span>{characters.length}</span>
            </button>
          </nav>

          <div className="mixamo-upload-strip character-only">
            <button onClick={() => setUploadModal("characters")} type="button">
              Upload character + animation
            </button>
          </div>

          <div className="mixamo-card-grid characters">
            {(visibleItems as ModelRecord[]).map((character) => (
              <button
                className={`mixamo-asset-card${selectedCharacter?.id === character.id ? " active" : ""}`}
                key={character.id}
                onClick={() => setSelectedCharacterId(character.id)}
                type="button"
              >
                <div className="mixamo-thumb character-thumb model-thumb">
                  <CharacterCardViewer src={character.fileUrl} />
                </div>
                <strong>{character.name}</strong>
                <small>{getCharacterStatus(character)}</small>
              </button>
            ))}
          </div>

          {!visibleItems.length ? (
            <div className="mixamo-empty-list">
              <strong>No characters found</strong>
              <span>Use upload to add the next asset to this workspace.</span>
            </div>
          ) : null}

          <footer className="mixamo-pagination">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              Previous
            </button>
            <span>{currentPage} / {totalPages}</span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              Next
            </button>
          </footer>
        </aside>
        <button
          aria-label={leftCollapsed ? "Show asset browser" : "Resize asset browser"}
          className="mixamo-pane-resizer left"
          onClick={() => {
            if (leftCollapsed) setLeftCollapsed(false);
          }}
          onDoubleClick={() => setLeftCollapsed((value) => !value)}
          onPointerDown={(event) => {
            if (leftCollapsed) return;
            event.preventDefault();
            startPaneResize("left", event.clientX);
          }}
          type="button"
        />

        <section className="mixamo-preview-pane">
          <div className="mixamo-pane-controls">
            <button onClick={() => setLeftCollapsed((value) => !value)} type="button">
              {leftCollapsed ? "Show library" : "Hide library"}
            </button>
            <button onClick={() => setRightCollapsed((value) => !value)} type="button">
              {rightCollapsed ? "Show actions" : "Hide actions"}
            </button>
          </div>
          <div className="mixamo-preview-stage">
            {selectedCharacter ? (
              activeActionPreview ? (
                <div className="mixamo-animation-preview-wrap">
                  <RiggedAnimationPreview
                    animationSrc={activeActionPreview.animationSrc}
                    actionName={activeActionPreview.actionName}
                    cacheKey={`${activeActionPreview.characterId}:${activeActionPreview.animationId}:${activeActionPreview.actionId}`}
                    src={activeActionPreview.previewUrl}
                  />
                  <div className="mixamo-action-overlay">
                    <span>Action preview</span>
                    <strong>{activeActionPreview.actionName ?? "Character action"}</strong>
                    <button onClick={() => setAppliedAnimation(null)} type="button">
                      Back to source model
                    </button>
                  </div>
                </div>
              ) : (
                <InspectViewer src={selectedCharacter.fileUrl} />
              )
            ) : (
              <div className="mixamo-stage-empty">
                <strong>Select a character</strong>
                <span>The large viewport will show the selected asset here.</span>
              </div>
            )}
          </div>
        </section>
        <button
          aria-label={rightCollapsed ? "Show action panel" : "Resize action panel"}
          className="mixamo-pane-resizer right"
          onClick={() => {
            if (rightCollapsed) setRightCollapsed(false);
          }}
          onDoubleClick={() => setRightCollapsed((value) => !value)}
          onPointerDown={(event) => {
            if (rightCollapsed) return;
            event.preventDefault();
            startPaneResize("right", event.clientX);
          }}
          type="button"
        />

        <aside className="mixamo-action-pane">
          <CharacterActions
            activePreviewActionId={activeActionPreview?.linkId ?? null}
            applyError={applyError}
            character={selectedCharacter}
            isApplyingAnimation={isApplyingAnimation}
            onOpenRig={() => {
              setModalCharacter(selectedCharacter);
              setUploadModal("characters");
            }}
            onPreviewAction={previewCharacterAction}
            previewingActionId={previewingCharacterActionId}
            stats={stats}
          />
        </aside>
      </section>

      {uploadModal ? (
        <UploadAssetModal
          initialCharacter={modalCharacter}
          modalType={uploadModal}
          onClose={() => {
            setModalCharacter(null);
            setUploadModal(null);
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function CharacterActions({
  activePreviewActionId,
  applyError,
  character,
  isApplyingAnimation,
  onOpenRig,
  onPreviewAction,
  previewingActionId,
  stats,
}: {
  activePreviewActionId: string | null;
  applyError: string | null;
  character: ModelRecord | null;
  isApplyingAnimation: boolean;
  onOpenRig: () => void;
  onPreviewAction: (action: CharacterActionLinkRecord) => void;
  previewingActionId: string | null;
  stats: MixamoAssetWorkspaceProps["stats"];
}) {
  const router = useRouter();
  const [localActions, setLocalActions] = useState<CharacterActionLinkRecord[]>([]);
  const [savingActionId, setSavingActionId] = useState<string | null>(null);

  useEffect(() => {
    setLocalActions(getCharacterActions(character));
  }, [character]);

  const updateActionBinding = async (
    actionId: string,
    updates: Partial<Pick<CharacterActionLinkRecord, "enabled" | "trigger" | "keyBinding">>
  ) => {
    if (!character) return;
    const nextActions = localActions.map((action) =>
      action.id === actionId ? { ...action, ...updates } : action
    );
    setLocalActions(nextActions);
    setSavingActionId(actionId);
    try {
      await fetch(`/api/models/${character.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hasAnimations: nextActions.some((action) => action.enabled),
          customProps: writeCharacterActions(character.customProps, nextActions),
        }),
      });
      router.refresh();
    } finally {
      setSavingActionId(null);
    }
  };

  const getSmartActionBinding = (name: string): { trigger: CharacterActionLinkRecord["trigger"]; keyBinding: string | null } | null => {
    const norm = name.toLowerCase();
    if (norm.includes("crouch") || norm.includes("cround") || norm.includes("crch") || norm.includes("crd")) {
      return { trigger: "crouch", keyBinding: "Space" };
    }
    if (norm.includes("jump") || norm.includes("jmp") || norm.includes("leap")) {
      return { trigger: "jump", keyBinding: "Space" };
    }
    if (norm.includes("talk") || norm.includes("speak") || norm.includes("dialogue") || norm.includes("bark") || norm.includes("chat") || norm.includes("say")) {
      return { trigger: "talk", keyBinding: "E" };
    }
    if (norm.includes("walk") || norm.includes("run") || norm.includes("sprint") || norm.includes("move") || norm.includes("go") || norm.includes("idle")) {
      return { trigger: "move", keyBinding: "W+A+S+D" };
    }
    if (norm.includes("attack") || norm.includes("slash") || norm.includes("kick") || norm.includes("punch") || norm.includes("fight") || norm.includes("shoot") || norm.includes("hit") || norm.includes("combo")) {
      let key = "J";
      if (norm.includes("heavy") || norm.includes("kick") || norm.includes("2")) {
        key = "K";
      } else if (norm.includes("alt") || norm.includes("shoot") || norm.includes("3")) {
        key = "RMB";
      }
      return { trigger: "attack", keyBinding: key };
    }
    return null;
  };

  const autoMatchActions = async () => {
    if (!character) return;
    let hasChanges = false;
    const nextActions = localActions.map((action) => {
      const match = getSmartActionBinding(action.name);
      if (match) {
        hasChanges = true;
        return {
          ...action,
          enabled: true,
          trigger: match.trigger,
          keyBinding: match.keyBinding,
        };
      }
      return action;
    });

    if (hasChanges) {
      setLocalActions(nextActions);
      setSavingActionId("all");
      try {
        await fetch(`/api/models/${character.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hasAnimations: nextActions.some((action) => action.enabled),
            customProps: writeCharacterActions(character.customProps, nextActions),
          }),
        });
        router.refresh();
      } finally {
        setSavingActionId(null);
      }
    }
  };

  if (!character) {
    return (
      <div className="mixamo-side-empty">
        <strong>No character selected</strong>
        <span>{stats.totalModels} assets in the library.</span>
      </div>
    );
  }

  const rigging = getRiggingMetadata(character);
  return (
    <div className="mixamo-side-stack">
      <header>
        <span>{character.category}</span>
        <h2>{character.name}</h2>
        <p>{character.description || "Character ready for preview, rigging, and animation assignment."}</p>
      </header>

      <div className="mixamo-side-stats">
        <div><strong>{character.format.toUpperCase()}</strong><span>Format</span></div>
        <div><strong>{formatBytes(character.fileSize)}</strong><span>Size</span></div>
        <div><strong>{localActions.filter((action) => action.enabled).length}</strong><span>Actions</span></div>
      </div>

      <a className="mixamo-orange-button" href={`/api/models/${character.id}/download?asset=delivery`}>
        Download
      </a>
      <button className="mixamo-gray-button" onClick={onOpenRig} type="button">
        Upload / auto-rig
      </button>

      {rigging.riggedModelUrl ? (
        <a className="mixamo-gray-button" href={rigging.riggedModelUrl}>
          Open rigged GLB
        </a>
      ) : null}
      {localActions.length ? (
        <section className="mixamo-character-action-panel" style={{ marginTop: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#2d3748" }}>Character actions ({localActions.length})</span>
            <button
              type="button"
              onClick={autoMatchActions}
              disabled={savingActionId === "all"}
              style={{
                background: "rgba(13, 148, 136, 0.1)",
                border: "1px solid #0d9488",
                color: "#0d9488",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              {savingActionId === "all" ? "Matching..." : "Auto Match"}
            </button>
          </div>
          <div className="mixamo-character-action-list" style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "480px", overflowY: "auto" }}>
            {localActions.map((action) => (
              <div
                className="mixamo-character-action-card"
                key={action.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "10px",
                  border: "1px solid #cbd5e0",
                  borderRadius: "8px",
                  background: "#fff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                }}
              >
                {/* Line 1: Checkbox + Name + Test Button */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <input
                      checked={action.enabled}
                      disabled={savingActionId === action.id || savingActionId === "all"}
                      onChange={(event) => {
                        void updateActionBinding(action.id, { enabled: event.target.checked });
                      }}
                      type="checkbox"
                      style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#ff8a21" }}
                    />
                    <span
                      title={action.name}
                      style={{
                        display: "block",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#2d3748"
                      }}
                    >
                      {action.name}
                    </span>
                  </label>

                  <button
                    className={activePreviewActionId === action.id ? "active" : ""}
                    disabled={previewingActionId === action.id || isApplyingAnimation || savingActionId === action.id || savingActionId === "all"}
                    onClick={() => onPreviewAction(action)}
                    type="button"
                    style={{
                      minWidth: "68px",
                      height: "26px",
                      padding: "0 10px",
                      fontSize: "10px",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      borderRadius: "6px",
                      cursor: "pointer",
                      border: activePreviewActionId === action.id ? "1px solid #ff4a00" : "1px solid #d2d6dc",
                      background: activePreviewActionId === action.id ? "#ff4a00" : "#fff",
                      color: activePreviewActionId === action.id ? "#fff" : "#4a5568",
                    }}
                  >
                    {previewingActionId === action.id ? "..." : activePreviewActionId === action.id ? "Stop" : "TEST"}
                  </button>
                </div>

                {/* Line 2: Trigger Select + KeyBindingInput */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", paddingLeft: "22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                    <span style={{ display: "inline-block", fontSize: "11px", color: "#718096" }}>Trigger:</span>
                    <select
                      aria-label={`Trigger ${action.name}`}
                      disabled={savingActionId === action.id || savingActionId === "all"}
                      value={action.trigger}
                      onChange={(event) => {
                        void updateActionBinding(action.id, {
                          trigger: event.target.value as CharacterActionLinkRecord["trigger"],
                        });
                      }}
                      style={{
                        height: "28px",
                        background: "#fff",
                        border: "1px solid #cbd5e0",
                        borderRadius: "6px",
                        color: "#2d3748",
                        fontSize: "11px",
                        outline: "none",
                        padding: "0 4px",
                        flex: 1,
                        minWidth: 0,
                        cursor: "pointer"
                      }}
                    >
                      <option value="none">Manual</option>
                      <option value="attack">Attack</option>
                      <option value="move">Move</option>
                      <option value="talk">Talk</option>
                      <option value="crouch">Crouch</option>
                      <option value="jump">Jump</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ display: "inline-block", fontSize: "11px", color: "#718096" }}>Key:</span>
                    <KeyBindingInput
                      disabled={savingActionId === action.id || savingActionId === "all"}
                      value={action.keyBinding}
                      onChange={(val) => {
                        void updateActionBinding(action.id, { keyBinding: val });
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {applyError ? <small className="mixamo-side-error">{applyError}</small> : null}
      <small className="mixamo-side-note">
        {localActions.length
          ? "Enabled actions will be available for Map Editor behavior setup."
          : rigging.statusReason || "Upload a character bundle to attach actions without using the old animation tab."}
      </small>
    </div>
  );
}

function AnimationActions({
  appliedExportUrl,
  applyError,
  animation,
  characters,
  isApplyingAnimation,
  onActionSelect,
  onCharacterSelect,
  onOpenUpload,
  selectedAction,
  selectedCharacter,
}: {
  animation: AnimationAssetRecord | null;
  characters: ModelRecord[];
  selectedAction: AnimationActionRecord | null;
  selectedCharacter: ModelRecord | null;
  appliedExportUrl: string | null;
  applyError: string | null;
  isApplyingAnimation: boolean;
  onActionSelect: (id: string) => void;
  onCharacterSelect: (id: string) => void;
  onOpenUpload: () => void;
}) {
  if (!animation) {
    return (
      <div className="mixamo-side-empty">
        <strong>No animation selected</strong>
        <button className="mixamo-orange-button" onClick={onOpenUpload} type="button">Upload animation</button>
      </div>
    );
  }

  const rigging = selectedCharacter ? getRiggingMetadata(selectedCharacter) : null;
  return (
    <div className="mixamo-side-stack">
      <header>
        <span>{animation.sourceKind}</span>
        <h2>{animation.name}</h2>
        <p>{animation.sourceKind === "pack" ? "ZIP pack imported as actions. Cards stay lightweight without thumbnail preview." : "Single FBX animation ready for character testing."}</p>
      </header>

      <div className="mixamo-side-stats">
        <div><strong>{animation.actionCount}</strong><span>Actions</span></div>
        <div><strong>{animation.format.toUpperCase()}</strong><span>Source</span></div>
        <div><strong>{formatBytes(animation.fileSize)}</strong><span>Size</span></div>
      </div>

      <label className="mixamo-compact-field">
        <span>Apply character</span>
        <select
          value={selectedCharacter?.id ?? ""}
          onChange={(event) => onCharacterSelect(event.target.value)}
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mixamo-action-list">
        {animation.actions.map((action, index) => (
          <button
            className={selectedAction?.id === action.id ? "active" : ""}
            key={action.id}
            onClick={() => onActionSelect(action.id)}
            type="button"
          >
            <span>{getActionLabel(action, index)}</span>
            <small>{selectedAction?.id === action.id ? "Selected" : "Select"}</small>
          </button>
        ))}
      </div>

      <a className="mixamo-gray-button" href={animation.fileUrl}>
        Download source
      </a>
      {appliedExportUrl ? (
        <a className="mixamo-orange-button" href={appliedExportUrl}>
          Export applied GLB
        </a>
      ) : (
        <button className="mixamo-orange-button" disabled type="button">
          {isApplyingAnimation ? "Applying action..." : "Export applied GLB"}
        </button>
      )}
      <small className="mixamo-side-note">
        {applyError
          ? applyError
          : appliedExportUrl
            ? "Selected action has been baked into the rigged character GLB."
            : rigging?.riggedModelUrl
              ? "Applying selected action to the rigged character."
          : "Auto-rig the selected character before exporting animation character GLB."}
      </small>
    </div>
  );
}

function UploadAssetModal({
  initialCharacter,
  modalType,
  onClose,
}: {
  initialCharacter: ModelRecord | null;
  modalType: WorkspaceTab;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadedCharacter, setUploadedCharacter] = useState<ModelRecord | null>(initialCharacter);
  const [riggedUrl, setRiggedUrl] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadEntries, setUploadEntries] = useState<UploadEntry[]>([]);
  const [selectedCharacterFile, setSelectedCharacterFile] = useState("");
  const [isPending, startTransition] = useTransition();
  const modelFileOptions = uploadEntries.filter((entry) => isCharacterCandidate(entry.fileName));

  const uploadCharacter = (formData: FormData) => {
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
    const firstFile = files[0] ?? formData.get("file");
    if (firstFile instanceof File && !String(formData.get("name") || "").trim()) {
      const characterName = selectedCharacterFile || firstFile.name;
      formData.set("name", characterName.replace(/\.[^.]+$/, ""));
    }
    if (selectedCharacterFile) formData.set("characterFileName", selectedCharacterFile);
    formData.set("assetMode", files.length > 1 ? "character_with_actions" : "character_no_animation");
    formData.set("category", "character");
    formData.set("license", "proprietary");

    startTransition(async () => {
      setError(null);
      setMessage(null);
      const response = await fetch("/api/models/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: ModelRecord;
        error?: string;
      } | null;

      if (!response.ok || !payload?.success || !payload.data) {
        setError(payload?.error ?? "Character upload failed");
        return;
      }

      setUploadedCharacter(payload.data);
      setMessage(payload.data.hasAnimations
        ? "Character bundle uploaded. Enable the actions you want to expose in Map Editor."
        : "Character uploaded. Pick the humanoid markers on the mesh before running auto-rig.");
      router.refresh();
    });
  };

  const uploadAnimation = (formData: FormData) => {
    const file = formData.get("file");
    if (file instanceof File && !String(formData.get("name") || "").trim()) {
      formData.set("name", file.name.replace(/\.[^.]+$/, ""));
    }

    startTransition(async () => {
      setError(null);
      setMessage(null);
      const response = await fetch("/api/animations/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? "Animation upload failed");
        return;
      }

      setMessage("Animation uploaded. Close the popup to refresh the pack list.");
      router.refresh();
    });
  };

  return (
    <div className="mixamo-modal-backdrop" role="presentation">
      <section className="mixamo-upload-modal" role="dialog" aria-modal="true" aria-label={modalType === "characters" ? "Upload character + animation" : "Upload animation"}>
        <button className="mixamo-modal-close" onClick={onClose} type="button" aria-label="Close upload popup">
          x
        </button>
        <header className="mixamo-modal-title">
          <h2>{modalType === "characters" ? "Upload character + animation" : "Upload animation"}</h2>
        </header>

        {modalType === "animations" || !uploadedCharacter ? (
          <form
            className="mixamo-drop-form"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              if (modalType === "characters") uploadCharacter(formData);
              else uploadAnimation(formData);
            }}
          >
          <div className="mixamo-modal-copy">
            <h3>{modalType === "characters" ? "Character source" : "Animation source"}</h3>
            <p>
              {modalType === "characters"
                ? "Upload the character model first. Action bundles will be configured on the character record instead of a separate animation tab."
                : "Upload one FBX animation or a ZIP pack containing FBX actions. Packs are listed as action sets without card previews."}
            </p>
            <div className="mixamo-format-tags">
              {(modalType === "characters" ? ["ZIP", "FBX", "OBJ", "GLB", "GLTF"] : ["FBX", "ZIP"]).map((format) => (
                <span key={format}>{format}</span>
              ))}
            </div>
          </div>

          <label className="mixamo-drop-zone">
              <input
              name={modalType === "characters" ? "files" : "file"}
              type="file"
              accept={modalType === "characters" ? ".fbx,.obj,.glb,.gltf,.zip" : ".fbx,.zip"}
              multiple={modalType === "characters"}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setSelectedFiles(files);
                setUploadEntries([]);
                setSelectedCharacterFile("");
                void getUploadEntries(files).then((entries) => {
                  setUploadEntries(entries);
                  const glb = entries.find((entry) => /\.(glb|gltf)$/i.test(entry.fileName));
                  const characterCandidate = entries.filter((entry) => isCharacterCandidate(entry.fileName));
                  setSelectedCharacterFile(glb?.fileName ?? (characterCandidate.length === 1 ? characterCandidate[0].fileName : ""));
                });
              }}
              required
            />
            <span>Select {modalType === "characters" ? "character" : "animation"} file</span>
            <em>or drop file here.</em>
          </label>

          <div className="mixamo-modal-fields">
            {modalType === "characters" ? (
              <select name="assetMode" defaultValue="character_no_animation" aria-label="Character import mode">
                <option value="character_no_animation">Character with no animation</option>
                <option value="character_with_actions">Character with action files</option>
              </select>
            ) : null}
            {modalType === "characters" && modelFileOptions.length ? (
              <select
                name="characterFileName"
                value={selectedCharacterFile}
                onChange={(event) => setSelectedCharacterFile(event.target.value)}
                aria-label="Character file"
                required
              >
                <option value="">Choose character file</option>
                {modelFileOptions.map((entry) => (
                  <option key={`${entry.sourceFileName}-${entry.fileName}`} value={entry.fileName}>
                    {entry.fileName}
                  </option>
                ))}
              </select>
            ) : null}
            <input name="name" placeholder="Name" />
            <input name="tags" placeholder="Tags" />
            <textarea name="description" rows={2} placeholder="Description" />
          </div>

          {modalType === "characters" && (selectedFiles.length > 1 || uploadEntries.length > selectedFiles.length) ? (
            <div className="mixamo-upload-file-list">
              {(uploadEntries.length ? uploadEntries : selectedFiles.map((file) => ({ fileName: file.name, sourceFileName: file.name }))).map((entry) => (
                <span
                  className={entry.fileName === selectedCharacterFile ? "selected" : ""}
                  key={`${entry.sourceFileName}-${entry.fileName}`}
                >
                  {entry.fileName}
                </span>
              ))}
            </div>
          ) : null}

          <button className="mixamo-orange-button" disabled={isPending} type="submit">
            {isPending ? "Uploading..." : modalType === "characters" ? "Upload character + animation" : "Upload animation"}
          </button>
          </form>
        ) : null}

        {uploadedCharacter ? (
          <section className="mixamo-popup-preview">
            <div className="mixamo-popup-preview-head">
              <div>
                <span>Humanoid marker rig</span>
                <strong>{uploadedCharacter.name}</strong>
              </div>
            </div>
            {riggedUrl ? (
              <RiggedAnimationPreview cacheKey={String(Date.now())} src={riggedUrl} />
            ) : (
              <RiggingMarkerPanel
                model={uploadedCharacter}
                onRigComplete={(nextRiggedUrl) => {
                  setRiggedUrl(nextRiggedUrl);
                  setMessage(nextRiggedUrl ? "Auto-rig complete. Preview is ready in this popup." : "Auto-rig complete.");
                }}
              />
            )}
          </section>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
        {message ? <p className="success-text">{message}</p> : null}
      </section>
    </div>
  );
}
