"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  type SetStateAction,
} from "react";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import {
  Grid,
  Html,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import {
  ModelLoader,
  getRenderableBounds,
} from "@/components/3d/ModelLoader";
import { log3DDebug } from "@/lib/3d/debug";
import { getIntelligentScaleMultiplier } from "@/lib/3d/camera";
import { StoryGraphPanel } from "./StoryGraphPanel";
import { DialogueSystem } from "./DialogueSystem";
import { GameCanvas, type RemotePresencePlayer } from "./GameCanvas";
import { GameChatPanel, type GameChatMessage } from "./GameChatPanel";
import { useRealtimeGameRoom } from "./useRealtimeGameRoom";
import { HUD } from "./HUD";
import {
  useGameStore,
  weaponCatalog,
  type GameLevel,
  type LevelCharacter,
  type MapCharacter,
  type PlacedObject,
  type StoryEdge,
  type StoryGraph,
  type StoryNode,
  type StoryNodeKind,
  type WeaponActionPose,
  type WeaponHitbox,
  type WeaponLoadout,
  type WeaponTransform,
  type WeaponType,
} from "@/store/gameStore";

type WorkbenchTab = "play" | "maps" | "editor" | "objects" | "story";
type PlacementTool = "player" | "object" | "enemy_low" | "enemy_fantasy" | "npc";
type EditableLevelDraft = ReturnType<typeof buildEditableLevel>;
type AssetLibraryItem = {
  id: string;
  name: string;
  fileUrl: string;
  category: string;
  customProps?: Record<string, unknown> | null;
  format?: string;
  thumbnailUrl?: string | null;
};

type CharacterActionLink = {
  id: string;
  animationAssetId: string;
  actionId: string;
  name: string;
  fileUrl: string;
  sourceFormat: string;
  enabled: boolean;
  trigger: "none" | "attack" | "talk" | "move" | "custom" | "crouch" | "jump" | "idle";
  keyBinding: string | null;
  durationMs?: number | null;
};

const DEFAULT_MAP_URL = "";
const PLAYER_SPAWN_OFFSET = 1.5;
const EDITOR_MAP_MAX_SIZE = 92;
const MAP_CHARACTER_HEIGHT = 1.85;
const MAP_OBJECT_MAX_SIZE = 1.8;
const ROUTABLE_WORKBENCH_TABS: readonly WorkbenchTab[] = [
  "play",
  "maps",
  "editor",
  "objects",
];
const weaponActionPoses: WeaponActionPose[] = [
  "default",
  "idle",
  "walk",
  "run",
  "attack",
  "slash",
  "kick",
  "block",
];

const EMPTY_STORY_GRAPH: StoryGraph = {
  nodes: [
    {
      id: "story-start",
      kind: "start",
      title: "Start",
      text: "Story begins here.",
      position: { x: 96, y: 160 },
    },
  ],
  edges: [],
  variables: [],
};

type MapRelativeScale = {
  gameplayRatio: number;
  characterHeight: number;
  objectMaxSize: number;
};
const DEFAULT_MAP_RELATIVE_SCALE: MapRelativeScale = {
  gameplayRatio: 1,
  characterHeight: MAP_CHARACTER_HEIGHT,
  objectMaxSize: MAP_OBJECT_MAX_SIZE,
};

function formatVector(position: [number, number, number]) {
  return position.map((value) => Number(value.toFixed(2))).join(", ");
}

function parseWorkbenchTab(value: string | null): WorkbenchTab | null {
  if (value === "npc" || value === "character" || value === "lobby") {
    return "objects";
  }
  return ROUTABLE_WORKBENCH_TABS.includes(value as WorkbenchTab)
    ? (value as WorkbenchTab)
    : null;
}

function parseVector(value: string): [number, number, number] | null {
  const parts = value.split(",").map((entry) => Number(entry.trim()));
  if (parts.length !== 3 || parts.some((entry) => !Number.isFinite(entry)))
    return null;
  return [parts[0], parts[1], parts[2]];
}

function isEnvironmentAsset(name: string, fileUrl: string) {
  const lowerName = name.toLowerCase();
  const lowerUrl = fileUrl.toLowerCase();
  return (
    lowerName.includes("map") ||
    lowerName.includes("terrain") ||
    lowerName.includes("env") ||
    lowerName.includes("ground") ||
    lowerName.includes("scene") ||
    lowerName.includes("building") ||
    lowerName.includes("dungeon") ||
    lowerName.includes("sector") ||
    lowerName.includes("level") ||
    lowerName.includes("room") ||
    lowerName.includes("floor") ||
    lowerName.includes("cliff") ||
    lowerName.includes("rock") ||
    lowerName.includes("road") ||
    lowerUrl.includes("map") ||
    lowerUrl.includes("terrain") ||
    lowerUrl.includes("environment")
  );
}

function SceneRefGetter({ sceneRef }: { sceneRef: React.MutableRefObject<THREE.Scene | null> }) {
  const { scene } = useThree();
  useEffect(() => {
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
    };
  }, [scene, sceneRef]);
  return null;
}

function getSmartActionBinding(name: string): { trigger: CharacterActionLink["trigger"]; keyBinding: string | null } | null {
  const lowercase = name.toLowerCase();

  // Crouch matches
  if (
    lowercase.includes("crouch") ||
    lowercase.includes("cround") ||
    lowercase.includes("crch") ||
    lowercase.includes("crd")
  ) {
    return { trigger: "crouch", keyBinding: "Space" };
  }

  // Jump matches
  if (
    lowercase.includes("jump") ||
    lowercase.includes("jmp") ||
    lowercase.includes("leap")
  ) {
    return { trigger: "jump", keyBinding: "Space" };
  }

  // Attack/combo matches
  if (
    lowercase.includes("attack") ||
    lowercase.includes("slash") ||
    lowercase.includes("kick") ||
    lowercase.includes("punch") ||
    lowercase.includes("fight") ||
    lowercase.includes("shoot") ||
    lowercase.includes("hit") ||
    lowercase.includes("combo") ||
    lowercase.includes("light") ||
    lowercase.includes("heavy") ||
    lowercase.includes("alt")
  ) {
    let key: string | null = "J";
    if (lowercase.includes("heavy") || lowercase.includes("slash") || lowercase.includes("combo")) {
      key = "K";
    } else if (lowercase.includes("alt") || lowercase.includes("shoot")) {
      key = "RMB";
    }
    return { trigger: "attack", keyBinding: key };
  }

  // Idle matches
  if (
    lowercase.includes("idle") ||
    lowercase.includes("stand") ||
    lowercase.includes("breath") ||
    lowercase.includes("rest")
  ) {
    return { trigger: "idle", keyBinding: null };
  }

  // Move matches
  if (
    lowercase.includes("walk") ||
    lowercase.includes("run") ||
    lowercase.includes("sprint") ||
    lowercase.includes("move") ||
    lowercase.includes("go")
  ) {
    return { trigger: "move", keyBinding: "W+A+S+D" };
  }

  // Talk matches
  if (
    lowercase.includes("talk") ||
    lowercase.includes("speak") ||
    lowercase.includes("dialogue") ||
    lowercase.includes("bark") ||
    lowercase.includes("chat") ||
    lowercase.includes("say")
  ) {
    return { trigger: "talk", keyBinding: "E" };
  }

  return null;
}

function getCharacterActionsFromAsset(asset: AssetLibraryItem | null | undefined) {
  const manifest = asset?.customProps?.characterAnimation;
  if (!manifest || typeof manifest !== "object" || !("actions" in manifest)) {
    return [] as CharacterActionLink[];
  }
  const actions = (manifest as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [] as CharacterActionLink[];
  return actions.filter((action): action is CharacterActionLink => (
    Boolean(action && typeof action === "object" && "id" in action && "name" in action)
  ));
}

function writeCharacterActionsToCustomProps(
  customProps: AssetLibraryItem["customProps"],
  actions: CharacterActionLink[],
) {
  const currentManifest =
    customProps?.characterAnimation && typeof customProps.characterAnimation === "object"
      ? customProps.characterAnimation as Record<string, unknown>
      : {};
  return {
    ...(customProps ?? {}),
    characterAnimation: {
      ...currentManifest,
      actions,
      mode: "external_actions",
      updatedAt: new Date().toISOString(),
      version: 1,
    },
  };
}

function transformToInputs(transform: WeaponTransform) {
  return {
    position: formatVector(transform.position),
    rotation: formatVector(transform.rotation),
    scale: formatVector(transform.scale),
  };
}

function hitboxToInputs(hitbox: WeaponHitbox) {
  return {
    reach: String(hitbox.reach),
    radius: String(hitbox.radius),
    arcDegrees: String(hitbox.arcDegrees),
    damageMultiplier: String(hitbox.damageMultiplier),
  };
}

function buildEditableLevel(source?: GameLevel) {
  return {
    id: source?.id,
    name: source?.name ?? "Custom Sector",
    mapModelUrl: source?.mapModelUrl ?? DEFAULT_MAP_URL,
    playerCharacter: source?.playerCharacter ?? null,
    playerSpawn: formatVector(
      source?.playerSpawn ?? [0, PLAYER_SPAWN_OFFSET, 0],
    ),
    robotSpawn: formatVector(source?.robotSpawn ?? [0, 0, 0]),
    robotStory: source?.robotStory ?? "",
    storyGraph: normalizeStoryGraph(source?.storyGraph),
    mapCharacters: source?.mapCharacters ?? [],
    placedObjects: normalizePlacedObjects(source?.placedObjects ?? []),
    zombieSpawns: source?.zombieSpawns ?? [],
  };
}

function normalizeStoryGraph(graph?: StoryGraph | null): StoryGraph {
  if (!graph?.nodes?.length) {
    return {
      nodes: EMPTY_STORY_GRAPH.nodes.map((node) => ({
        ...node,
        position: { ...node.position },
      })),
      edges: [],
      variables: [],
    };
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      text: node.text ?? "",
      position: {
        x: Number.isFinite(node.position?.x) ? node.position.x : 96,
        y: Number.isFinite(node.position?.y) ? node.position.y : 160,
      },
    })),
    edges: (graph.edges ?? []).filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId),
    ),
    variables: graph.variables || [],
  };
}

function createPlacedObjectId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `obj-${crypto.randomUUID()}`;
  }
  return `obj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isMapAsset(asset: AssetLibraryItem) {
  const category = asset.category?.toLowerCase();
  const fileUrl = asset.fileUrl.toLowerCase();
  return (
    category === "map" ||
    category === "environment" ||
    category === "architecture" ||
    asset.customProps?.isMap === true ||
    fileUrl.includes("/maps/") ||
    fileUrl.includes("/map/") ||
    fileUrl.includes("/environment/") ||
    fileUrl.includes("/architecture/")
  );
}

function createMapLayer(asset: AssetLibraryItem, index: number): PlacedObject {
  return {
    id: createPlacedObjectId(),
    modelId: asset.id,
    name: asset.name,
    fileUrl: asset.fileUrl,
    position: [index * 10, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    isMap: true,
  };
}

function createDefaultPlayerCharacterFromAssets(assetLibrary: AssetLibraryItem[]): LevelCharacter {
  const characterAsset = assetLibrary.find((asset) => {
    const category = asset.category?.toLowerCase();
    const fileUrl = asset.fileUrl.toLowerCase();
    return (
      category === "character" ||
      category === "characters" ||
      category === "npc" ||
      fileUrl.includes("robot") ||
      fileUrl.includes("character")
    );
  });

  return {
    modelId: characterAsset?.id ?? "default-layer-player",
    name: characterAsset?.name ?? "Layer Player",
    fileUrl: characterAsset?.fileUrl ?? "/models/robot_tuan_tra_NPC.glb",
    format: characterAsset?.format ?? "glb",
  };
}

type SetupObjectKind = "NPC" | "Lobby" | "Character";

function getSetupObjectKind(object: PlacedObject): SetupObjectKind | null {
  if (object.isMap) return null;
  const match = object.name.match(/^\[(NPC|Lobby|Character)\]/);
  return match ? (match[1] as SetupObjectKind) : null;
}

function stripSetupObjectPrefix(name: string) {
  return name.replace(/^\[(NPC|Lobby|Character)\]\s*/, "");
}

function createSetupObject(kind: SetupObjectKind, name: string): PlacedObject {
  return {
    id: createPlacedObjectId(),
    modelId: `${kind.toLowerCase()}-object`,
    name: `[${kind}] ${name.trim() || kind}`,
    fileUrl: "/models/robot_tuan_tra_NPC.glb",
    position: [2, 0, 2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function vectorStep(
  value: [number, number, number],
  axis: 0 | 1 | 2,
  amount: number,
): [number, number, number] {
  const next: [number, number, number] = [...value];
  next[axis] = Number((next[axis] + amount).toFixed(2));
  return next;
}

function normalizePlacedObjects(objects: PlacedObject[]) {
  const seen = new Set<string>();
  return objects.map((object) => {
    if (object.id && !seen.has(object.id)) {
      seen.add(object.id);
      return object;
    }
    const id = createPlacedObjectId();
    seen.add(id);
    return { ...object, id };
  });
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

  // Keep local value in sync with value prop when not recording
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
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "7px",
          background: recording
            ? "rgba(0, 255, 196, 0.15)"
            : "rgba(255, 255, 255, 0.055)",
          color: recording ? "#00ffc4" : "#fff",
          fontSize: "10px",
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
            color: "#f87171",
            cursor: "pointer",
            fontSize: "9px",
            padding: "2px",
          }}
          title="Clear binding"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ManualActionConfigPanel({
  actions,
  activeActionId,
  onTriggerAction,
}: {
  actions: CharacterActionLink[];
  activeActionId: string | null;
  onTriggerAction: (actionId: string) => void;
}) {
  const enabledActions = actions.filter((a) => a.enabled);

  return (
    <div
      style={{
        position: "absolute",
        left: "24px",
        top: "140px",
        width: "260px",
        background: "rgba(8, 12, 28, 0.75)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "12px",
        padding: "14px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
        zIndex: 20,
        color: "#fff",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "6px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#00ffc4",
            letterSpacing: "1px",
          }}
        >
          MANUAL ACTION CONFIG
        </span>
        <span
          style={{
            fontSize: "9px",
            background: "rgba(0,255,196,0.15)",
            color: "#00ffc4",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: "bold",
          }}
        >
          Active
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          maxHeight: "250px",
          overflowY: "auto",
        }}
      >
        {enabledActions.map((action) => {
          const isActive = activeActionId === action.id;
          return (
            <div
              key={action.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: isActive
                  ? "rgba(0, 255, 196, 0.12)"
                  : "rgba(255, 255, 255, 0.04)",
                border: isActive
                  ? "1px solid #00ffc4"
                  : "1px solid rgba(255,255,255,0.06)",
                padding: "8px 10px",
                borderRadius: "8px",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  minWidth: 0,
                }}
              >
                <span
                  title={action.name}
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: isActive ? "#00ffc4" : "#f3f4f6",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {action.name}
                </span>
                <span style={{ fontSize: "8px", color: "#9ca3af" }}>
                  Trigger: {action.trigger}{" "}
                  {action.keyBinding ? `| Key: ${action.keyBinding}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onTriggerAction(action.id)}
                style={{
                  background: isActive ? "#00ffc4" : "rgba(255,255,255,0.08)",
                  border: "none",
                  color: isActive ? "#000" : "#fff",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "9px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {isActive ? "RUNNING" : "TRIGGER"}
              </button>
            </div>
          );
        })}
        {enabledActions.length === 0 && (
          <div
            style={{
              fontSize: "10px",
              color: "#9ca3af",
              fontStyle: "italic",
              textAlign: "center",
              padding: "10px 0",
            }}
          >
            No enabled actions configured.
          </div>
        )}
      </div>

      {activeActionId && (
        <div
          style={{
            marginTop: "4px",
            background: "rgba(0, 255, 196, 0.1)",
            border: "1px solid rgba(0, 255, 196, 0.2)",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "10px",
            color: "#00ffc4",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: "bold",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              background: "#00ffc4",
              borderRadius: "50%",
              display: "inline-block",
              boxShadow: "0 0 8px #00ffc4",
            }}
          />
          Running: {actions.find((a) => a.id === activeActionId)?.name}
        </div>
      )}
    </div>
  );
}

function MarkerLabel({ children }: { children: string }) {
  return (
    <Html center distanceFactor={12} position={[0, 1.55, 0]}>
      <span className="builder-marker-label">{children}</span>
    </Html>
  );
}

function BuilderModelViewer({
  compact = false,
  fitHeight,
  fitMaxSize = 1.25,
  interactive = true,
  src,
}: {
  compact?: boolean;
  fitHeight?: number;
  fitMaxSize?: number;
  interactive?: boolean;
  src: string;
}) {
  const [modelRoot, setModelRoot] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<any>(null);

  // Import ThumbnailAutoFit helper dynamically/inline or from ModelLoader
  const { ThumbnailAutoFit } = require("@/components/3d/ModelLoader");

  return (
    <div className={`builder-model-viewer${compact ? " compact" : ""}`}>
      <Canvas
        camera={{ position: [1.8, 1.25, 2.4], fov: 36 }}
        dpr={[1, compact ? 1 : 1.5]}
        frameloop="demand"
      >
        <color attach="background" args={["#111827"]} />
        <ambientLight intensity={0.85} />
        <directionalLight intensity={1.9} position={[3, 4, 3]} />
        <Suspense fallback={null}>
          <ModelLoader
            debugLabel={
              compact
                ? "builder-model-preview-compact"
                : "builder-model-preview"
            }
            fitHeight={fitHeight}
            fitMaxSize={fitMaxSize}
            groundToY={0}
            src={src}
            onSceneReady={setModelRoot}
          />
        </Suspense>
        <ThumbnailAutoFit controlsRef={controlsRef} model={modelRoot} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={interactive}
          enableRotate={interactive}
          makeDefault
        />
      </Canvas>
    </div>
  );
}

function BuilderAssetSummary({
  asset,
  selected,
}: {
  asset: AssetLibraryItem;
  selected?: boolean;
}) {
  return (
    <span className={`builder-asset-summary${selected ? " active" : ""}`}>
      <strong>{asset.name}</strong>
      <small>{asset.format?.toUpperCase() ?? asset.category}</small>
    </span>
  );
}

function BuilderPlacedSummary({ object }: { object: PlacedObject }) {
  return (
    <span className="builder-asset-summary">
      <strong>{object.name}</strong>
      <small>{object.scale[0].toFixed(2)}x</small>
    </span>
  );
}

function groundMarkerPosition(
  position: [number, number, number],
  offset: number,
): [number, number, number] {
  return [position[0], Number((position[1] - offset).toFixed(2)), position[2]];
}

function getMapRelativeScale(
  mapObject: THREE.Object3D | null,
): MapRelativeScale {
  if (!mapObject) return DEFAULT_MAP_RELATIVE_SCALE;
  const bounds = getRenderableBounds(mapObject, {
    debugLabel: "builder-map-relative-scale",
    loader: "builder-terrain",
    phase: "map-relative-scale",
  });
  if (bounds.isEmpty()) return DEFAULT_MAP_RELATIVE_SCALE;
  const size = bounds.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(size.x, size.z);
  const scaleRatio =
    horizontalSpan > 0.0001
      ? THREE.MathUtils.clamp(horizontalSpan / EDITOR_MAP_MAX_SIZE, 0.5, 1.5)
      : 1;
  const scale = {
    gameplayRatio: scaleRatio,
    characterHeight: MAP_CHARACTER_HEIGHT * scaleRatio,
    objectMaxSize: MAP_OBJECT_MAX_SIZE * scaleRatio,
  };
  log3DDebug(
    `builder-map-scale:${mapObject.uuid}`,
    "Builder map-relative scale",
    {
      mapSize: [size.x, size.y, size.z].map((value) =>
        Number(value.toFixed(4)),
      ),
      horizontalSpan: Number(horizontalSpan.toFixed(4)),
      scale,
    },
    { once: true },
  );
  return scale;
}

function getObjectBounds(object: THREE.Object3D | null) {
  if (!object) return null;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  return bounds.isEmpty() ? null : bounds;
}

function getTerrainHitNormalY(hit: THREE.Intersection) {
  if (!hit.face) return 1;
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);
  return normal.y;
}

function pickTerrainSurfaceHit(
  hits: THREE.Intersection[],
  preferredY: number,
) {
  const surfaceHits = hits.filter(
    (hit) =>
      hit.object.userData.isTerrainSurface &&
      !hit.object.userData.ignoreBuilderRaycast,
  );
  const upwardHits = surfaceHits.filter((hit) => getTerrainHitNormalY(hit) > 0.12);
  const candidates = upwardHits.length ? upwardHits : surfaceHits;
  return candidates.sort((a, b) => {
    const aDelta = Math.abs(a.point.y - preferredY);
    const bDelta = Math.abs(b.point.y - preferredY);
    if (Math.abs(aDelta - bDelta) > 0.001) return aDelta - bDelta;
    return b.point.y - a.point.y;
  })[0] ?? null;
}

function sameMapRelativeScale(a: MapRelativeScale, b: MapRelativeScale) {
  return (
    Math.abs(a.gameplayRatio - b.gameplayRatio) < 0.001 &&
    Math.abs(a.characterHeight - b.characterHeight) < 0.001 &&
    Math.abs(a.objectMaxSize - b.objectMaxSize) < 0.001
  );
}

function PlayerMarker({
  fitHeight,
  modelSrc,
  onCommit,
  onSelect,
  position,
  selected,
}: {
  fitHeight: number;
  modelSrc: string;
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  position: [number, number, number];
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, group.position.y, group.position.z]);
  };

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Suspense fallback={null}>
          <ModelLoader
            debugLabel="builder-player-marker"
            fitHeight={fitHeight}
            groundToY={0}
            src={modelSrc}
          />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry
              args={[fitHeight * 0.42, fitHeight, fitHeight * 0.42]}
            />
            <meshBasicMaterial
              color="#00ffc4"
              wireframe
              transparent
              opacity={0.75}
            />
          </mesh>
        ) : null}
        <MarkerLabel>PLAYER</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onMouseUp={commitTransform}
        />
      ) : null}
    </>
  );
}

function EnemyMarker({
  position,
  type,
  onCommit,
  onSelect,
  selected,
}: {
  position: [number, number, number];
  type: "zombie_low" | "zombie_fantasy";
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, group.position.y, group.position.z]);
  };

  const modelSrc = type === "zombie_fantasy" 
    ? "/models/zombie_fantasy_animated.glb" 
    : "/models/low_poly_zombie_game_animation.glb";

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Suspense fallback={null}>
          <ModelLoader
            debugLabel={`builder-enemy-${type}`}
            fitHeight={1.8}
            groundToY={0}
            src={modelSrc}
          />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[0.8, 1.8, 0.8]} />
            <meshBasicMaterial
              color="#ff3b3b"
              wireframe
              transparent
              opacity={0.75}
            />
          </mesh>
        ) : null}
        <MarkerLabel>{type === "zombie_fantasy" ? "ENEMY FANTASY" : "ENEMY LOW"}</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onMouseUp={commitTransform}
        />
      ) : null}
    </>
  );
}

function NpcMarker({
  position,
  onCommit,
  onSelect,
  selected,
}: {
  position: [number, number, number];
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, group.position.y, group.position.z]);
  };

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Suspense fallback={null}>
          <ModelLoader
            debugLabel="builder-npc"
            fitHeight={1.9}
            groundToY={0}
            src="/models/robot_tuan_tra_NPC.glb"
          />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[0.8, 1.9, 0.8]} />
            <meshBasicMaterial
              color="#3b82f6"
              wireframe
              transparent
              opacity={0.75}
            />
          </mesh>
        ) : null}
        <MarkerLabel>NPC</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          onMouseUp={commitTransform}
        />
      ) : null}
    </>
  );
}

function PlacedObjectMarker({
  fitMaxSize,
  object,
  onCommit,
  onSelect,
  selected,
  transformMode = "translate",
}: {
  fitMaxSize: number;
  object: PlacedObject;
  onCommit: (updates: Partial<PlacedObject>) => void;
  onSelect: () => void;
  selected: boolean;
  transformMode?: "translate" | "rotate" | "scale";
}) {
  const groupRef = useRef<THREE.Group | null>(null);

  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit({
      position: [group.position.x, group.position.y, group.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(group.rotation.x),
        THREE.MathUtils.radToDeg(group.rotation.y),
        THREE.MathUtils.radToDeg(group.rotation.z),
      ],
      scale: [group.scale.x, group.scale.y, group.scale.z],
    });
  };

  const isEnv = object.isMap || isEnvironmentAsset(object.name, object.fileUrl);
  const adjustedSize = isEnv
    ? EDITOR_MAP_MAX_SIZE
    : fitMaxSize * getIntelligentScaleMultiplier(object.name);

  return (
    <>
      <group
        ref={groupRef}
        position={object.position}
        rotation={
          object.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [
            number,
            number,
            number,
          ]
        }
        scale={object.scale}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Suspense fallback={null}>
          <ModelLoader
            debugLabel={`builder-placed-object:${object.name}`}
            fitMaxSize={adjustedSize}
            groundToY={0}
            src={object.fileUrl}
            markAsTerrain={isEnv}
            ignoreRaycast={selected}
          />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[adjustedSize, adjustedSize, adjustedSize]} />
            <meshBasicMaterial
              color="#00ffc4"
              wireframe
              transparent
              opacity={0.7}
            />
          </mesh>
        ) : null}
        <MarkerLabel>{object.name}</MarkerLabel>
      </group>

      {selected && groupRef.current ? (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          onMouseUp={commitTransform}
        />
      ) : null}
    </>
  );
}

function LevelBuilderViewport({
  assetLibrary,
  draft,
  selectedAssetId,
  setAssetLibrary,
  setDraft,
  setSelectedAssetId,
  selectedCoreId,
  setSelectedCoreId,
  selectedObjectId,
  setSelectedObjectId,
  transformMode,
  setTransformMode,
  updatePlacedObject,
  removePlacedObject,
}: {
  assetLibrary: AssetLibraryItem[];
  draft: EditableLevelDraft;
  selectedAssetId: string;
  setAssetLibrary: Dispatch<SetStateAction<AssetLibraryItem[]>>;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft>>;
  setSelectedAssetId: Dispatch<SetStateAction<string>>;
  selectedCoreId: string;
  setSelectedCoreId: Dispatch<SetStateAction<string>>;
  selectedObjectId: string;
  setSelectedObjectId: Dispatch<SetStateAction<string>>;
  transformMode: "translate" | "rotate" | "scale";
  setTransformMode: Dispatch<SetStateAction<"translate" | "rotate" | "scale">>;
  updatePlacedObject: (objectId: string, updates: Partial<PlacedObject>) => void;
  removePlacedObject: (objectId: string) => void;
}) {
  const [placementTool, setPlacementTool] = useState<PlacementTool>("player");
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  log3DDebug(
    "builder-viewport-render",
    "LevelBuilderViewport render",
    {
      mapModelUrl: draft.mapModelUrl,
      playerCharacterUrl: draft.playerCharacter?.fileUrl,
      placedObjectsCount: draft.placedObjects.length,
    },
    { intervalMs: 1000 },
  );
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedObjectId) return;
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.tagName === "SELECT")
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "w") {
        setTransformMode("translate");
      } else if (key === "e") {
        setTransformMode("rotate");
      } else if (key === "r") {
        setTransformMode("scale");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObjectId, setTransformMode]);

  const [mapRelativeScale, setMapRelativeScale] = useState<MapRelativeScale>(
    DEFAULT_MAP_RELATIVE_SCALE,
  );
  const terrainObjectRef = useRef<THREE.Object3D | null>(null);
  const editorSceneRef = useRef<THREE.Scene | null>(null);
  const terrainRaycasterRef = useRef(new THREE.Raycaster());
  const lastTerrainSnapKeyRef = useRef("");
  const lastMapSeedUrlRef = useRef("");
  const currentMapScale = draft.mapModelUrl
    ? mapRelativeScale.gameplayRatio
    : 1.0;
  const playerSpawn = parseVector(draft.playerSpawn) ?? [
    0,
    PLAYER_SPAWN_OFFSET * currentMapScale,
    0,
  ];
  const selectedAsset = assetLibrary.find(
    (asset) => asset.id === selectedAssetId,
  );
  const characterAssets = assetLibrary.filter(
    (asset) => asset.category === "character",
  );
  const selectedPlayerCharacter = draft.playerCharacter;
  const selectedPlayerAsset = selectedPlayerCharacter
    ? assetLibrary.find((asset) => asset.id === selectedPlayerCharacter.modelId)
    : null;
  const selectedPlayerActions = getCharacterActionsFromAsset(selectedPlayerAsset);

  const setPlayerCharacter = (assetId: string) => {
    const asset = characterAssets.find((entry) => entry.id === assetId);
    setDraft((current) => ({
      ...current,
      playerCharacter: asset
        ? ({
            modelId: asset.id,
            name: asset.name,
            fileUrl: asset.fileUrl,
            format: asset.format,
          } satisfies LevelCharacter)
        : null,
    }));
  };

  const updateCharacterActionBinding = async (
    actionId: string,
    updates: Partial<Pick<CharacterActionLink, "enabled" | "trigger" | "keyBinding">>,
  ) => {
    if (!selectedPlayerAsset) return;
    const nextActions = selectedPlayerActions.map((action) =>
      action.id === actionId ? { ...action, ...updates } : action,
    );
    const customProps = writeCharacterActionsToCustomProps(
      selectedPlayerAsset.customProps,
      nextActions,
    );
    setSavingActionId(actionId);
    setAssetLibrary((current) =>
      current.map((asset) =>
        asset.id === selectedPlayerAsset.id ? { ...asset, customProps } : asset,
      ),
    );
    try {
      await fetch(`/api/models/${selectedPlayerAsset.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customProps,
          hasAnimations: nextActions.some((action) => action.enabled),
        }),
      });
    } finally {
      setSavingActionId(null);
    }
  };

  const autoMatchActions = async () => {
    if (!selectedPlayerAsset || !selectedPlayerActions.length) return;
    let modified = false;
    const nextActions = selectedPlayerActions.map((action) => {
      const match = getSmartActionBinding(action.name);
      if (match && action.trigger === "none" && !action.keyBinding) {
        modified = true;
        return {
          ...action,
          trigger: match.trigger,
          keyBinding: match.keyBinding,
        };
      }
      return action;
    });

    if (!modified) return;

    const customProps = writeCharacterActionsToCustomProps(
      selectedPlayerAsset.customProps,
      nextActions,
    );
    setAssetLibrary((current) =>
      current.map((asset) =>
        asset.id === selectedPlayerAsset.id ? { ...asset, customProps } : asset,
      ),
    );
    try {
      await fetch(`/api/models/${selectedPlayerAsset.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customProps,
          hasAnimations: nextActions.some((action) => action.enabled),
        }),
      });
    } catch (err) {
      console.error("Failed to auto-bind actions:", err);
    }
  };

  useEffect(() => {
    if (!selectedPlayerAsset) return;
    const actions = getCharacterActionsFromAsset(selectedPlayerAsset);
    const needsAutoMatch = actions.length > 0 && actions.every((a) => a.trigger === "none" && !a.keyBinding);
    if (needsAutoMatch) {
      void autoMatchActions();
    }
  }, [selectedPlayerAsset?.id]);

  useEffect(() => {
    if (!selectedAssetId && assetLibrary[0]) {
      setSelectedAssetId(assetLibrary[0].id);
    }
  }, [assetLibrary, selectedAssetId, setSelectedAssetId]);

  const getTerrainY = (x: number, z: number, fallbackY = 0) => {
    const scene = editorSceneRef.current;
    const terrain = terrainObjectRef.current;
    if (!scene && !terrain) return fallbackY;
    
    let rayStartY = 1000;
    if (terrain) {
      terrain.updateMatrixWorld(true);
      const bounds = getObjectBounds(terrain);
      if (bounds) {
        rayStartY = bounds.max.y + Math.max(bounds.getSize(new THREE.Vector3()).y, 20);
      }
    }
    
    const raycaster = terrainRaycasterRef.current;
    raycaster.set(
      new THREE.Vector3(x, rayStartY, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = pickTerrainSurfaceHit(
      raycaster.intersectObject(scene || terrain!, true),
      fallbackY,
    );
    log3DDebug(
      `builder-terrain-y:${x.toFixed(2)}:${z.toFixed(2)}:${fallbackY.toFixed(2)}`,
      "Builder terrain surface sample",
      {
        fallbackY: Number(fallbackY.toFixed(4)),
        hitY: hit ? Number(hit.point.y.toFixed(4)) : null,
        normalY: hit ? Number(getTerrainHitNormalY(hit).toFixed(4)) : null,
        objectName: hit?.object.name ?? null,
        rayStartY: Number(rayStartY.toFixed(4)),
      },
      { intervalMs: 750 },
    );
    return hit?.point.y ?? fallbackY;
  };

  const getTerrainYAt = (
    terrain: THREE.Object3D,
    x: number,
    z: number,
    fallbackY = 0,
  ) => {
    terrain.updateMatrixWorld(true);
    const bounds = getObjectBounds(terrain);
    const rayStartY = bounds
      ? bounds.max.y + Math.max(bounds.getSize(new THREE.Vector3()).y, 20)
      : 1000;
    const raycaster = terrainRaycasterRef.current;
    raycaster.set(
      new THREE.Vector3(x, rayStartY, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = pickTerrainSurfaceHit(
      raycaster.intersectObject(terrain, true),
      fallbackY,
    );
    return hit?.point.y ?? fallbackY;
  };

  const reseedSpawnForMap = (scene: THREE.Object3D) => {
    const bounds = getObjectBounds(scene);
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3());
    const playerX = Number(center.x.toFixed(2));
    const playerZ = Number(center.z.toFixed(2));
    const playerGround = getTerrainYAt(scene, playerX, playerZ, center.y);
    const mapScale = mapRelativeScale.gameplayRatio;
    setDraft((current) => ({
      ...current,
      playerSpawn: formatVector([
        playerX,
        playerGround + PLAYER_SPAWN_OFFSET * mapScale,
        playerZ,
      ]),
      zombieSpawns: [],
      placedObjects: [],
    }));
  };

  const entityPosition = (
    x: number,
    z: number,
    heightOffset: number,
    fallbackY = 0,
  ): [number, number, number] => [
    Number(x.toFixed(2)),
    Number((getTerrainY(x, z, fallbackY) + heightOffset).toFixed(2)),
    Number(z.toFixed(2)),
  ];

  const placeAt = (point: THREE.Vector3) => {
    const x = Number(point.x.toFixed(2));
    const z = Number(point.z.toFixed(2));
    const terrainY = Number(getTerrainY(x, z, point.y).toFixed(2));
    setSelectedCoreId("");
    setSelectedObjectId("");

    if (placementTool === "player") {
      if (!selectedPlayerCharacter?.fileUrl) return;
      setDraft((current) => ({
        ...current,
        playerSpawn: formatVector([
          x,
          terrainY + PLAYER_SPAWN_OFFSET * currentMapScale,
          z,
        ]),
      }));
      return;
    }
    if (placementTool === "npc") {
      setDraft((current) => ({
        ...current,
        robotSpawn: formatVector([
          x,
          terrainY,
          z,
        ]),
      }));
      return;
    }
    if (placementTool === "enemy_low" || placementTool === "enemy_fantasy") {
      const type = placementTool === "enemy_low" ? "zombie_low" : "zombie_fantasy";
      setDraft((current) => ({
        ...current,
        zombieSpawns: [
          ...current.zombieSpawns,
          {
            id: `enemy-${Math.random().toString(36).substring(2, 9)}`,
            type,
            position: [x, terrainY, z],
          },
        ],
      }));
      return;
    }
    if (placementTool === "object" && selectedAsset) {
      const id = createPlacedObjectId();
      setSelectedObjectId(id);
      setDraft((current) => ({
        ...current,
        placedObjects: [
          ...current.placedObjects,
          {
            id,
            modelId: selectedAsset.id,
            name: selectedAsset.name,
            fileUrl: selectedAsset.fileUrl,
            position: [x, terrainY, z],
            rotation: [0, 0, 0],
            scale: [0.75, 0.75, 0.75],
          },
        ],
      }));
    }
  };

  const handleGroundClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    placeAt(event.point);
  };

  const handleTerrainClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    placeAt(event.point);
  };

  const snapDraftToTerrain = () => {
    if (!terrainObjectRef.current) return;
    const mapScale = currentMapScale;
    setDraft((current) => {
      const currentPlayerSpawn = parseVector(current.playerSpawn) ?? [
        0,
        PLAYER_SPAWN_OFFSET * mapScale,
        5,
      ];
      return {
        ...current,
        playerSpawn: formatVector(
          entityPosition(
            currentPlayerSpawn[0],
            currentPlayerSpawn[2],
            PLAYER_SPAWN_OFFSET * mapScale,
            currentPlayerSpawn[1] - PLAYER_SPAWN_OFFSET * mapScale,
          ),
        ),
        placedObjects: current.placedObjects.map((object) => {
          const isObjEnv = object.isMap || isEnvironmentAsset(object.name, object.fileUrl);
          return {
            ...object,
            position: isObjEnv
              ? object.position
              : entityPosition(
                  object.position[0],
                  object.position[2],
                  0,
                  object.position[1],
                ),
          };
        }),
      };
    });
  };

  return (
    <div className="builder-layout">
      <aside className="builder-toolbar">
        <section className="builder-player-panel">
          <header>
            <strong>Player character</strong>
            <span>
              {selectedPlayerCharacter?.format?.toUpperCase() ?? "NONE"}
            </span>
          </header>
          {selectedPlayerCharacter?.fileUrl ? (
            <BuilderModelViewer
              fitHeight={1.35}
              src={selectedPlayerCharacter.fileUrl}
            />
          ) : (
            <p className="builder-empty-note">
              Choose a registered character before placing a player.
            </p>
          )}
          <div className="builder-character-grid">
            {characterAssets.map((asset) => (
              <button
                className={
                  selectedPlayerCharacter?.modelId === asset.id ? "active" : ""
                }
                key={asset.id}
                onClick={() => setPlayerCharacter(asset.id)}
                type="button"
              >
                <BuilderAssetSummary
                  asset={asset}
                  selected={selectedPlayerCharacter?.modelId === asset.id}
                />
              </button>
            ))}
          </div>
        </section>
        <label>
          Add
          <select
            value={placementTool}
            onChange={(event) =>
              setPlacementTool(event.target.value as PlacementTool)
            }
          >
            <option value="player">Player</option>
            <option value="object">Uploaded Model</option>
            <option value="enemy_low">Enemy (Low Poly)</option>
            <option value="enemy_fantasy">Enemy (Fantasy)</option>
            <option value="npc">NPC</option>
          </select>
        </label>
        {placementTool === "object" ? (
          <div className="builder-asset-browser">
            <header>
              <strong>Models</strong>
              <span>{assetLibrary.length}</span>
            </header>
            {assetLibrary.length ? (
              <div className="builder-asset-grid">
                {assetLibrary.map((asset) => (
                  <button
                    className={`builder-asset-card${selectedAssetId === asset.id ? " active" : ""}`}
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    type="button"
                  >
                    <BuilderAssetSummary
                      asset={asset}
                      selected={selectedAssetId === asset.id}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="builder-empty-note">No uploaded models.</p>
            )}
          </div>
        ) : null}
        {placementTool === "object" && selectedAsset ? (
          <div className="builder-selected-model">
            <BuilderModelViewer src={selectedAsset.fileUrl} />
            <div>
              <strong>{selectedAsset.name}</strong>
              <span>{selectedAsset.format?.toUpperCase() ?? "MODEL"}</span>
            </div>
          </div>
        ) : null}
        <div className="builder-placed-panel">
          <header>
            <strong>Placed objects</strong>
            <span>{draft.placedObjects.filter((obj) => !obj.isMap).length}</span>
          </header>
          {draft.placedObjects.filter((obj) => !obj.isMap).length ? (
            <div className="builder-object-list">
              {draft.placedObjects
                .filter((obj) => !obj.isMap)
                .map((object, index) => (
                <article
                  className={`builder-object-card${selectedObjectId === object.id ? " active" : ""}`}
                  key={`${object.id}-${index}`}
                >
                  <button
                    className="builder-object-pick"
                    onClick={() => {
                      setSelectedCoreId("");
                      setSelectedObjectId(object.id);
                    }}
                    type="button"
                  >
                    <BuilderPlacedSummary object={object} />
                  </button>
                  <div className="builder-object-controls">
                    <select
                      aria-label={`Scale ${object.name}`}
                      value={formatVector(object.scale)}
                      onChange={(event) => {
                        const parsed = parseVector(event.target.value);
                        if (parsed)
                          updatePlacedObject(object.id, { scale: parsed });
                      }}
                    >
                      <option value="0.35, 0.35, 0.35">Tiny</option>
                      <option value="0.55, 0.55, 0.55">Small</option>
                      <option value="0.75, 0.75, 0.75">Normal</option>
                      <option value="1, 1, 1">Large</option>
                    </select>
                    <button
                      className="danger"
                      onClick={() => removePlacedObject(object.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="builder-empty-note">No placed models yet.</p>
          )}
        </div>

        <div className="builder-placed-panel">
          <header>
            <strong>Placed Enemies & NPCs</strong>
            <span>{draft.zombieSpawns.length + (draft.robotSpawn ? 1 : 0)}</span>
          </header>
          {draft.robotSpawn || draft.zombieSpawns.length ? (
            <div className="builder-object-list">
              {draft.robotSpawn && (
                <article
                  className={`builder-object-card${selectedCoreId === "robot" ? " active" : ""}`}
                >
                  <button
                    className="builder-object-pick"
                    onClick={() => {
                      setSelectedCoreId("robot");
                      setSelectedObjectId("");
                    }}
                    type="button"
                  >
                    <span>NPC Dialogue Robot</span>
                    <small>{draft.robotSpawn}</small>
                  </button>
                  <div className="builder-object-controls">
                    <button
                      className="danger"
                      onClick={() => setDraft((current) => ({ ...current, robotSpawn: "" }))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              )}
              {draft.zombieSpawns.map((spawn, index) => (
                <article
                  className={`builder-object-card${selectedCoreId === `enemy-${spawn.id}` ? " active" : ""}`}
                  key={`${spawn.id}-${index}`}
                >
                  <button
                    className="builder-object-pick"
                    onClick={() => {
                      setSelectedCoreId(`enemy-${spawn.id}`);
                      setSelectedObjectId("");
                    }}
                    type="button"
                  >
                    <span>{spawn.type === "zombie_fantasy" ? "Enemy (Fantasy)" : "Enemy (Low Poly)"}</span>
                    <small>{formatVector(spawn.position)}</small>
                  </button>
                  <div className="builder-object-controls">
                    <button
                      className="danger"
                      onClick={() => setDraft((current) => ({
                        ...current,
                        zombieSpawns: current.zombieSpawns.filter((s) => s.id !== spawn.id)
                      }))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="builder-empty-note">No enemies/NPCs placed yet.</p>
          )}
        </div>
      </aside>

      <div className="builder-viewport">
        <div className="builder-viewport-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>
            {placementTool === "object"
              ? (selectedAsset?.name ?? "Select a model")
              : selectedPlayerCharacter
                ? "Click ground to place player"
                : "Choose player character"}
          </strong>
          {selectedObjectId && (
            <div className="gizmo-mode-selector" style={{ display: "flex", gap: "4px", marginLeft: "12px" }}>
              <button
                type="button"
                style={{
                  background: transformMode === "translate" ? "#00ffc4" : "rgba(255, 255, 255, 0.1)",
                  color: transformMode === "translate" ? "#000" : "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
                onClick={() => setTransformMode("translate")}
              >
                Move (W)
              </button>
              <button
                type="button"
                style={{
                  background: transformMode === "rotate" ? "#00ffc4" : "rgba(255, 255, 255, 0.1)",
                  color: transformMode === "rotate" ? "#000" : "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
                onClick={() => setTransformMode("rotate")}
              >
                Rotate (E)
              </button>
              <button
                type="button"
                style={{
                  background: transformMode === "scale" ? "#00ffc4" : "rgba(255, 255, 255, 0.1)",
                  color: transformMode === "scale" ? "#000" : "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
                onClick={() => setTransformMode("scale")}
              >
                Scale (R)
              </button>
            </div>
          )}
        </div>
        <Canvas
          camera={{ position: [16, 14, 20], fov: 48 }}
          shadows="percentage"
        >
          <SceneRefGetter sceneRef={editorSceneRef} />
          <color attach="background" args={["#070b16"]} />
          <ambientLight intensity={0.65} />
          <directionalLight castShadow intensity={1.8} position={[8, 16, 10]} />
          <Grid
            args={[EDITOR_MAP_MAX_SIZE, EDITOR_MAP_MAX_SIZE]}
            cellColor="#203047"
            sectionColor="#00ffc4"
            position={[0, -0.02, 0]}
            visible={false}
          />
          <Suspense fallback={null}>
            {draft.mapModelUrl ? (
              <group position={[0, 0, 0]} scale={[1, 1, 1]}>
                <ModelLoader
                  key={draft.mapModelUrl}
                  debugLabel="builder-terrain"
                  fitMaxSize={EDITOR_MAP_MAX_SIZE}
                  groundToY={0}
                  markAsTerrain
                  onMeshClick={handleTerrainClick}
                  onSceneReady={(scene) => {
                    terrainObjectRef.current = scene;
                    const nextScale = getMapRelativeScale(scene);
                    log3DDebug(
                      `builder-terrain-ready:${draft.mapModelUrl}`,
                      "Builder terrain ready",
                      {
                        sceneName: scene?.name,
                        sceneScale: scene
                          ? [scene.scale.x, scene.scale.y, scene.scale.z].map(
                              (value) => Number(value.toFixed(4)),
                            )
                          : null,
                        nextScale,
                      },
                      { once: true },
                    );
                    setMapRelativeScale((current) =>
                      sameMapRelativeScale(current, nextScale)
                        ? current
                        : nextScale,
                    );
                    if (!lastMapSeedUrlRef.current) {
                      lastMapSeedUrlRef.current = draft.mapModelUrl;
                    } else if (
                      scene &&
                      lastMapSeedUrlRef.current !== draft.mapModelUrl
                    ) {
                      lastMapSeedUrlRef.current = draft.mapModelUrl;
                      reseedSpawnForMap(scene);
                      return;
                    }
                    const snapKey = `${draft.mapModelUrl}:${draft.zombieSpawns.length}:${draft.placedObjects.length}`;
                    if (scene && lastTerrainSnapKeyRef.current !== snapKey) {
                      lastTerrainSnapKeyRef.current = snapKey;
                      snapDraftToTerrain();
                    }
                  }}
                  src={draft.mapModelUrl}
                />
              </group>
            ) : null}
          </Suspense>
          {!draft.mapModelUrl ? (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={handleGroundClick}
              receiveShadow
            >
              <planeGeometry args={[120, 120]} />
              <meshStandardMaterial
                color="#0b1224"
                transparent
                opacity={0}
                side={THREE.DoubleSide}
              />
            </mesh>
          ) : null}
          {selectedPlayerCharacter?.fileUrl ? (
            <PlayerMarker
              fitHeight={mapRelativeScale.characterHeight}
              modelSrc={selectedPlayerCharacter.fileUrl}
              onCommit={(position) => {
                const snapped = entityPosition(
                  position[0],
                  position[2],
                  PLAYER_SPAWN_OFFSET * currentMapScale,
                  position[1],
                );
                setDraft((current) => ({
                  ...current,
                  playerSpawn: formatVector(snapped),
                }));
              }}
              onSelect={() => {
                setSelectedCoreId("player");
                setSelectedObjectId("");
              }}
              position={groundMarkerPosition(
                playerSpawn,
                PLAYER_SPAWN_OFFSET * currentMapScale,
              )}
              selected={selectedCoreId === "player"}
            />
          ) : null}
          {draft.placedObjects.map((object, index) => (
            <PlacedObjectMarker
              fitMaxSize={mapRelativeScale.objectMaxSize}
              key={`${object.id}-${index}`}
              object={object}
              transformMode={transformMode}
              onCommit={(updates) => {
                const isObjEnv = object.isMap || isEnvironmentAsset(object.name, object.fileUrl);
                const position = updates.position
                  ? (isObjEnv
                      ? ([Number(updates.position[0].toFixed(2)), Number(updates.position[1].toFixed(2)), Number(updates.position[2].toFixed(2))] as [number, number, number])
                      : entityPosition(
                          updates.position[0],
                          updates.position[2],
                          0,
                          updates.position[1],
                        )
                    )
                  : undefined;
                updatePlacedObject(object.id, {
                  ...updates,
                  ...(position ? { position } : {}),
                });
              }}
              onSelect={() => {
                setSelectedCoreId("");
                setSelectedObjectId(object.id);
              }}
              selected={selectedObjectId === object.id}
            />
          ))}

          {draft.robotSpawn ? (
            <NpcMarker
              position={parseVector(draft.robotSpawn) || [0, 0, 0]}
              onCommit={(pos) =>
                setDraft((current) => ({
                  ...current,
                  robotSpawn: formatVector(pos),
                }))
              }
              onSelect={() => {
                setSelectedCoreId("robot");
                setSelectedObjectId("");
              }}
              selected={selectedCoreId === "robot"}
            />
          ) : null}

          {draft.zombieSpawns.map((spawn, index) => (
            <EnemyMarker
              key={spawn.id || index}
              position={spawn.position}
              type={spawn.type}
              onCommit={(pos) =>
                setDraft((current) => ({
                  ...current,
                  zombieSpawns: current.zombieSpawns.map((s) =>
                    s.id === spawn.id ? { ...s, position: pos } : s,
                  ),
                }))
              }
              onSelect={() => {
                setSelectedCoreId(`enemy-${spawn.id}`);
                setSelectedObjectId("");
              }}
              selected={selectedCoreId === `enemy-${spawn.id}`}
            />
          ))}
          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </div>
  );
}

function requestGameFullscreen() {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function MapsPanel({
  onNewMap,
  onPlay,
}: {
  onNewMap: () => void;
  onPlay: () => void;
}) {
  const activeLevel = useGameStore((state) => state.activeLevel);
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const deleteCustomLevel = useGameStore((state) => state.deleteCustomLevel);
  const levels = useMemo(() => savedLevels, [savedLevels]);
  const uniqueLevels = useMemo(() => {
    const byId = new Map<string, GameLevel>();
    levels.forEach((level) => byId.set(level.id, level));
    return Array.from(byId.values());
  }, [levels]);

  return (
    <section className="workbench-panel">
      <div className="workbench-panel-header">
        <div>
          <span>GAME SETTINGS</span>
          <h2>All Games</h2>
          <p>
            Choose a game map, then open gameplay preview or move into the
            editor tabs.
          </p>
        </div>
        <div className="level-actions">
          <button type="button" onClick={onNewMap}>
            New Map
          </button>
        </div>
      </div>
      <div className="level-grid">
        {!uniqueLevels.length ? (
          <article className="level-card">
            <h3>No maps yet</h3>
            <p>
              Create a new map, upload/select terrain, then add registered
              models from the editor.
            </p>
            <div className="level-actions">
              <button type="button" onClick={onNewMap}>
                New Map
              </button>
            </div>
          </article>
        ) : null}
        {uniqueLevels.map((level) => (
          <article
            className={`level-card${level.id === activeLevel.id ? " active" : ""}`}
            key={level.id}
          >
            <h3>{level.name}</h3>
            <p>{level.mapModelUrl ? "Custom map" : "Map not selected yet"}</p>
            <div className="level-meta">
              <span>{level.placedObjects.length} objects</span>
              <span>{level.playerCharacter?.name ?? "No player"}</span>
            </div>
            <div className="level-actions">
              <button
                type="button"
                onClick={() => {
                  setActiveLevel(level.id);
                  onPlay();
                }}
              >
                Play
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => deleteCustomLevel(level.id)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.62)",
      }}
    >
      <section
        className="workbench-panel"
        style={{
          position: "relative",
          inset: "auto",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "88vh",
          overflow: "auto",
        }}
      >
        <div className="workbench-panel-header">
          <div>
            <span>SETUP</span>
            <h2>{title}</h2>
          </div>
          <div className="level-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      {label}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: 6 }}>
        <button type="button" onClick={() => onChange(Number((value - step).toFixed(2)))}>
          -
        </button>
        <input
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <button type="button" onClick={() => onChange(Number((value + step).toFixed(2)))}>
          +
        </button>
      </div>
    </label>
  );
}

function AxisLabel({ children, position }: { children: string; position: [number, number, number] }) {
  return (
    <Html center distanceFactor={18} position={position}>
      <span className="map-axis-label">{children}</span>
    </Html>
  );
}

function MapLayerWorkspaceViewer({
  layers,
  selectedLayerId,
  objects = [],
  selectedObjectId = null,
}: {
  layers: PlacedObject[];
  selectedLayerId: string | null;
  objects?: PlacedObject[];
  selectedObjectId?: string | null;
}) {
  return (
    <div className="map-game-viewport">
      <Canvas camera={{ position: [24, 18, 24], fov: 48 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#070b16"]} />
        <ambientLight intensity={0.9} />
        <directionalLight intensity={1.8} position={[12, 18, 8]} />
        <Grid
          args={[120, 120]}
          cellColor="#203047"
          cellSize={2}
          sectionColor="#00ffc4"
          sectionSize={10}
          fadeDistance={120}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
          position={[0, -0.02, 0]}
        />
        <axesHelper args={[18]} />
        <AxisLabel position={[19, 0, 0]}>X</AxisLabel>
        <AxisLabel position={[0, 19, 0]}>Y</AxisLabel>
        <AxisLabel position={[0, 0, 19]}>Z</AxisLabel>
        {layers.map((layer) => {
          const selected = layer.id === selectedLayerId;
          return (
            <group
              key={layer.id}
              position={layer.position}
              rotation={[
                (layer.rotation[0] * Math.PI) / 180,
                (layer.rotation[1] * Math.PI) / 180,
                (layer.rotation[2] * Math.PI) / 180,
              ]}
              scale={layer.scale}
            >
              <Suspense fallback={null}>
                <ModelLoader
                  debugLabel={`map-game-layer:${layer.name}`}
                  fitMaxSize={42}
                  groundToY={0}
                  markAsTerrain
                  src={layer.fileUrl}
                />
              </Suspense>
              {selected ? (
                <Html center distanceFactor={18} position={[0, 2.4, 0]}>
                  <span className="builder-marker-label">Selected</span>
                </Html>
              ) : null}
            </group>
          );
        })}
        {objects.map((object) => {
          const selected = object.id === selectedObjectId;
          return (
            <group
              key={object.id}
              position={object.position}
              rotation={[
                (object.rotation[0] * Math.PI) / 180,
                (object.rotation[1] * Math.PI) / 180,
                (object.rotation[2] * Math.PI) / 180,
              ]}
              scale={object.scale}
            >
              <Suspense fallback={null}>
                <ModelLoader
                  debugLabel={`map-game-object:${object.name}`}
                  fitMaxSize={2.4}
                  groundToY={0}
                  src={object.fileUrl}
                />
              </Suspense>
              <Html center distanceFactor={18} position={[0, selected ? 3.1 : 2.5, 0]}>
                <span className={selected ? "builder-marker-label" : "map-object-label"}>
                  {stripSetupObjectPrefix(object.name)}
                </span>
              </Html>
            </group>
          );
        })}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

function MapEditorAssetsPanel({
  assetLibrary,
  refreshAssets,
}: {
  assetLibrary: AssetLibraryItem[];
  refreshAssets: () => Promise<void>;
}) {
  const [uploadName, setUploadName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapAssets = useMemo(() => assetLibrary.filter(isMapAsset), [assetLibrary]);

  const uploadMap = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    setMessage(null);
    const cleanName = uploadName.trim() || file.name.replace(/\.[^.]+$/, "");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", cleanName);
    formData.set("category", "map");
    formData.set("license", "proprietary");
    formData.append("tags", "map");
    formData.append("tags", "game-map-asset");

    try {
      const response = await fetch("/api/models/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setMessage(payload?.error ?? "Upload map failed.");
        return;
      }
      setUploadName("");
      await refreshAssets();
      setMessage(`Uploaded "${payload.data?.name ?? cleanName}".`);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMap = async (assetId: string) => {
    await fetch(`/api/models/${encodeURIComponent(assetId)}`, { method: "DELETE" }).catch(() => undefined);
    await refreshAssets();
  };

  return (
    <section className="workbench-panel" style={{ width: "min(760px, calc(100vw - 32px))", margin: "72px auto 0" }}>
      <div className="workbench-panel-header">
        <div>
          <span>MAP EDITOR</span>
          <h2>Uploaded Maps</h2>
          <p>Upload and delete raw map files. Map Game creation is handled in the Map Game tab.</p>
        </div>
      </div>
      <div className="editor-glass-grid">
        <label style={{ gridColumn: "span 2" }}>
          Map name
          <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} />
        </label>
        <label className="map-upload-field" style={{ gridColumn: "span 2" }}>
          Upload map
          <input
            accept=".glb,.gltf,.fbx"
            disabled={isUploading}
            onChange={(event) => {
              void uploadMap(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      {message ? <p className="builder-empty-note">{message}</p> : null}
      <div className="level-grid" style={{ marginTop: 16 }}>
        {!mapAssets.length ? (
          <article className="level-card">
            <h3>Empty</h3>
            <p>No uploaded maps yet.</p>
          </article>
        ) : null}
        {mapAssets.map((asset) => (
          <article className="level-card" key={asset.id}>
            <h3>{asset.name}</h3>
            <p>{asset.fileUrl}</p>
            <div className="level-actions">
              <button className="danger" type="button" onClick={() => void deleteMap(asset.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MapGamePanel({
  assetLibrary,
  draft,
  setDraft,
  saveCustomLevel,
  saveLevel,
}: {
  assetLibrary: AssetLibraryItem[];
  draft: EditableLevelDraft | null;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft | null>>;
  saveCustomLevel: (level: Omit<GameLevel, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<GameLevel | null>;
  saveLevel: () => Promise<GameLevel | null>;
}) {
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const deleteCustomLevel = useGameStore((state) => state.deleteCustomLevel);
  const [showCreate, setShowCreate] = useState(false);
  const [mapGameName, setMapGameName] = useState("New Map Game");
  const [mapRows, setMapRows] = useState<string[]>([""]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [activeAxis, setActiveAxis] = useState<0 | 1 | 2>(0);
  const [showAddMap, setShowAddMap] = useState(false);
  const [selectedAddMapId, setSelectedAddMapId] = useState("");
  const mapAssets = useMemo(() => assetLibrary.filter(isMapAsset), [assetLibrary]);
  const mapLayers = draft?.placedObjects.filter((object) => object.isMap) ?? [];
  const selectedLayer = mapLayers.find((layer) => layer.id === selectedLayerId) ?? mapLayers[0] ?? null;

  useEffect(() => {
    if (!selectedLayerId && mapLayers[0]) setSelectedLayerId(mapLayers[0].id);
  }, [mapLayers, selectedLayerId]);

  const createMapGame = async () => {
    const selectedAssets = mapRows
      .map((id) => mapAssets.find((asset) => asset.id === id))
      .filter((asset): asset is AssetLibraryItem => Boolean(asset));
    if (!selectedAssets.length) return;

    const saved = await saveCustomLevel({
      name: mapGameName.trim() || "New Map Game",
      mapModelUrl: selectedAssets[0].fileUrl,
      playerCharacter: createDefaultPlayerCharacterFromAssets(assetLibrary),
      playerSpawn: [0, PLAYER_SPAWN_OFFSET, 0],
      robotSpawn: [4, 0, 4],
      robotStory: "",
      storyGraph: EMPTY_STORY_GRAPH,
      mapCharacters: [],
      placedObjects: selectedAssets.map(createMapLayer),
      zombieSpawns: [],
    });
    if (saved) {
      setActiveLevel(saved.id);
      setDraft(buildEditableLevel(saved));
      setSelectedLayerId(saved.placedObjects.find((object) => object.isMap)?.id ?? null);
      setShowCreate(false);
      setMapRows([""]);
      setMapGameName("New Map Game");
    }
  };

  const addMapLayerToGame = () => {
    const asset = mapAssets.find((entry) => entry.id === selectedAddMapId);
    if (!asset || !draft?.id) return;
    const nextLayer = createMapLayer(asset, mapLayers.length);
    nextLayer.position = [mapLayers.length * 10, 0, mapLayers.length * 6];

    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: [...current.placedObjects, nextLayer],
          }
        : current,
    );
    setSelectedLayerId(nextLayer.id);
    setSelectedAddMapId("");
    setShowAddMap(false);
  };

  const updateLayer = (layerId: string, updates: Partial<PlacedObject>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: current.placedObjects.map((object) =>
              object.id === layerId ? { ...object, ...updates } : object,
            ),
          }
        : current,
    );
  };

  const moveSelectedLayer = useCallback(
    (amount: number) => {
      if (!selectedLayer) return;
      updateLayer(selectedLayer.id, {
        position: vectorStep(selectedLayer.position, activeAxis, amount),
      });
    },
    [activeAxis, selectedLayer],
  );

  const scaleSelectedLayer = useCallback(
    (amount: number) => {
      if (!selectedLayer) return;
      const nextScale = Math.max(0.1, Number((selectedLayer.scale[0] + amount).toFixed(2)));
      updateLayer(selectedLayer.id, { scale: [nextScale, nextScale, nextScale] });
    },
    [selectedLayer],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedLayer) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSelectedLayer(event.shiftKey ? 5 : 1);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelectedLayer(event.shiftKey ? -5 : -1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveSelectedLayer, selectedLayer]);

  const handleWorkspaceWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || !selectedLayer) return;
    event.preventDefault();
    scaleSelectedLayer(event.deltaY < 0 ? 0.1 : -0.1);
  };

  return (
    <section className="workbench-panel map-game-workspace-panel">
      <div className="workbench-panel-header">
        <div>
          <span>MAP GAME</span>
          <h2>Map Game Manager</h2>
          <p>Create Map Games from uploaded maps, then edit each map layer position and scale.</p>
        </div>
        <div className="level-actions">
          <button type="button" onClick={() => setShowCreate(true)}>
            Create Map Game
          </button>
          {draft?.id ? (
            <button type="button" onClick={() => void saveLevel()}>
              Save
            </button>
          ) : null}
        </div>
      </div>

      <div className="level-grid">
        {!savedLevels.length ? (
          <article className="level-card">
            <h3>Empty</h3>
            <p>No Map Game has been created yet.</p>
          </article>
        ) : null}
        {savedLevels.map((level) => (
          <article
            className={`level-card${draft?.id === level.id ? " active" : ""}`}
            key={level.id}
            onClick={() => {
              setActiveLevel(level.id);
              setDraft(buildEditableLevel(level));
              setSelectedLayerId(level.placedObjects.find((object) => object.isMap)?.id ?? null);
            }}
            style={{ cursor: "pointer" }}
          >
            <h3>{level.name}</h3>
            <p>{level.placedObjects.filter((object) => object.isMap).length} map layer(s)</p>
            <div className="level-actions">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveLevel(level.id);
                  setDraft(buildEditableLevel(level));
                }}
              >
                Edit
              </button>
              <button
                className="danger"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteCustomLevel(level.id);
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {draft?.id ? (
        <div className="map-game-editor-workspace" onWheel={handleWorkspaceWheel}>
          <aside className="level-card map-game-layer-list">
            <div className="map-game-layer-header">
              <h3>Map layers</h3>
              <button
                disabled={!mapAssets.length}
                onClick={() => {
                  setSelectedAddMapId(mapAssets[0]?.id ?? "");
                  setShowAddMap(true);
                }}
                type="button"
              >
                Add Map
              </button>
            </div>
            {mapLayers.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {mapLayers.map((layer) => (
                  <button
                    className={selectedLayer?.id === layer.id ? "active" : ""}
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    type="button"
                  >
                    {layer.name}
                  </button>
                ))}
              </div>
            ) : (
              <p>Empty</p>
            )}
          </aside>
          <article className="level-card map-game-canvas-card">
            {selectedLayer ? (
              <>
                <MapLayerWorkspaceViewer layers={mapLayers} selectedLayerId={selectedLayer.id} />
                <div className="map-coordinate-readout">
                  <span>X {selectedLayer.position[0].toFixed(2)}</span>
                  <span>Y {selectedLayer.position[1].toFixed(2)}</span>
                  <span>Z {selectedLayer.position[2].toFixed(2)}</span>
                  <span>Scale {selectedLayer.scale[0].toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p>Select a map layer.</p>
            )}
          </article>
          <aside className="level-card map-game-transform-panel">
            {selectedLayer ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <h3>{selectedLayer.name}</h3>
                  <div className="axis-button-row">
                    {(["X", "Y", "Z"] as const).map((axis, index) => (
                      <button
                        className={activeAxis === index ? "active" : ""}
                        key={axis}
                        onClick={() => setActiveAxis(index as 0 | 1 | 2)}
                        type="button"
                      >
                        {axis}
                      </button>
                    ))}
                  </div>
                  <p className="builder-empty-note">
                    Select an axis, then use arrow keys. Shift + arrow moves faster. Shift + mouse wheel changes scale.
                  </p>
                  <NumberStepper
                    label="Scale"
                    step={0.1}
                    value={selectedLayer.scale[0]}
                    onChange={(value) => updateLayer(selectedLayer.id, { scale: [value, value, value] })}
                  />
                  {(["X", "Y", "Z"] as const).map((axis, index) => (
                    <NumberStepper
                      key={axis}
                      label={`Position ${axis}`}
                      value={selectedLayer.position[index]}
                      onChange={(value) => {
                        const next: [number, number, number] = [...selectedLayer.position];
                        next[index] = value;
                        updateLayer(selectedLayer.id, { position: next });
                      }}
                    />
                  ))}
                </div>
            ) : (
              <p>No layer selected.</p>
            )}
          </aside>
        </div>
      ) : null}

      {showCreate ? (
        <ModalShell title="Create Map Game" onClose={() => setShowCreate(false)}>
          <div className="editor-glass-grid">
            <label style={{ gridColumn: "span 2" }}>
              Map Game name
              <input value={mapGameName} onChange={(event) => setMapGameName(event.target.value)} />
            </label>
            <div style={{ gridColumn: "span 2", display: "grid", gap: 8 }}>
              <strong>Maps</strong>
              {mapRows.map((mapId, index) => (
                <select
                  key={index}
                  value={mapId}
                  onChange={(event) =>
                    setMapRows((current) =>
                      current.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)),
                    )
                  }
                >
                  <option value="">Select uploaded map...</option>
                  {mapAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              ))}
              <button type="button" onClick={() => setMapRows((current) => [...current, ""])}>
                +
              </button>
            </div>
            <div className="level-actions" style={{ gridColumn: "span 2" }}>
              <button disabled={!mapRows.some(Boolean)} type="button" onClick={() => void createMapGame()}>
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showAddMap ? (
        <ModalShell title="Add Map to Map Game" onClose={() => setShowAddMap(false)}>
          <div className="editor-glass-grid">
            <label style={{ gridColumn: "span 2" }}>
              Uploaded map
              <select
                value={selectedAddMapId}
                onChange={(event) => setSelectedAddMapId(event.target.value)}
              >
                <option value="">Select uploaded map...</option>
                {mapAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
            {!mapAssets.length ? (
              <p className="builder-empty-note" style={{ gridColumn: "span 2" }}>
                Upload a map in Map Editor before adding it to a Map Game.
              </p>
            ) : null}
            <div className="level-actions" style={{ gridColumn: "span 2" }}>
              <button disabled={!selectedAddMapId} type="button" onClick={addMapLayerToGame}>
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

function ObjectManagerPanel({
  draft,
  setDraft,
  saveLevel,
}: {
  draft: EditableLevelDraft | null;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft | null>>;
  saveLevel: () => Promise<GameLevel | null>;
}) {
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const [showAdd, setShowAdd] = useState(false);
  const [objectName, setObjectName] = useState("");
  const [objectKind, setObjectKind] = useState<SetupObjectKind>("NPC");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeAxis, setActiveAxis] = useState<0 | 1 | 2>(0);
  const mapLayers = draft?.placedObjects.filter((object) => object.isMap) ?? [];
  const objects = draft?.placedObjects.filter((object) => getSetupObjectKind(object)) ?? [];
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? objects[0] ?? null;
  const selectedKind = selectedObject ? getSetupObjectKind(selectedObject) ?? "NPC" : "NPC";

  useEffect(() => {
    if (!selectedObjectId && objects[0]) setSelectedObjectId(objects[0].id);
    if (selectedObjectId && !objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(objects[0]?.id ?? null);
    }
  }, [objects, selectedObjectId]);

  const updateObject = useCallback(
    (objectId: string, updates: Partial<PlacedObject>) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              placedObjects: current.placedObjects.map((object) =>
                object.id === objectId ? { ...object, ...updates } : object,
              ),
            }
          : current,
      );
    },
    [setDraft],
  );

  const addObject = () => {
    const nextObject = createSetupObject(objectKind, objectName);
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: [...current.placedObjects, nextObject],
          }
        : current,
    );
    setSelectedObjectId(nextObject.id);
    setObjectName("");
    setObjectKind("NPC");
    setShowAdd(false);
  };

  const deleteObject = (objectId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: current.placedObjects.filter((object) => object.id !== objectId),
          }
        : current,
    );
    setSelectedObjectId(null);
  };

  const moveSelectedObject = useCallback(
    (amount: number) => {
      if (!selectedObject) return;
      updateObject(selectedObject.id, {
        position: vectorStep(selectedObject.position, activeAxis, amount),
      });
    },
    [activeAxis, selectedObject, updateObject],
  );

  const scaleSelectedObject = useCallback(
    (amount: number) => {
      if (!selectedObject) return;
      const nextScale = Math.max(0.1, Number((selectedObject.scale[0] + amount).toFixed(2)));
      updateObject(selectedObject.id, { scale: [nextScale, nextScale, nextScale] });
    },
    [selectedObject, updateObject],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedObject) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSelectedObject(event.shiftKey ? 5 : 1);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelectedObject(event.shiftKey ? -5 : -1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveSelectedObject, selectedObject]);

  const handleWorkspaceWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || !selectedObject) return;
    event.preventDefault();
    scaleSelectedObject(event.deltaY < 0 ? 0.1 : -0.1);
  };

  return (
    <section className="workbench-panel map-game-workspace-panel">
      <div className="workbench-panel-header">
        <div>
          <span>OBJECTS</span>
          <h2>Object Manager</h2>
          <p>Select a Map Game, then add or edit NPC, Character, and Lobby objects on the map.</p>
        </div>
        <div className="level-actions">
          {draft?.id ? (
            <>
              <button type="button" onClick={() => setShowAdd(true)}>
                Add Object
              </button>
              <button type="button" onClick={() => void saveLevel()}>
                Save
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="map-game-editor-workspace object-editor-workspace" onWheel={handleWorkspaceWheel}>
        <aside className="level-card map-game-layer-list">
          <div className="object-list-section">
            <h3>Map Games</h3>
            {!savedLevels.length ? <p>Empty</p> : null}
            <div style={{ display: "grid", gap: 8 }}>
              {savedLevels.map((level) => (
                <button
                  className={draft?.id === level.id ? "active" : ""}
                  key={level.id}
                  onClick={() => {
                    setActiveLevel(level.id);
                    setDraft(buildEditableLevel(level));
                    setSelectedObjectId(null);
                  }}
                  type="button"
                >
                  {level.name}
                </button>
              ))}
            </div>
          </div>
          <div className="object-list-section">
            <h3>Objects</h3>
            {!draft?.id ? <p>Select a Map Game.</p> : null}
            {draft?.id && !objects.length ? <p>Empty</p> : null}
            <div style={{ display: "grid", gap: 8 }}>
              {objects.map((object) => (
                <button
                  className={selectedObject?.id === object.id ? "active" : ""}
                  key={object.id}
                  onClick={() => setSelectedObjectId(object.id)}
                  type="button"
                >
                  {stripSetupObjectPrefix(object.name)}
                  <small>{getSetupObjectKind(object)}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <article className="level-card map-game-canvas-card">
          {draft?.id ? (
            <>
              <MapLayerWorkspaceViewer
                layers={mapLayers}
                selectedLayerId={null}
                objects={objects}
                selectedObjectId={selectedObject?.id ?? null}
              />
              <div className="map-coordinate-readout">
                <span>Maps {mapLayers.length}</span>
                <span>Objects {objects.length}</span>
                {selectedObject ? (
                  <>
                    <span>X {selectedObject.position[0].toFixed(2)}</span>
                    <span>Y {selectedObject.position[1].toFixed(2)}</span>
                    <span>Z {selectedObject.position[2].toFixed(2)}</span>
                    <span>Scale {selectedObject.scale[0].toFixed(2)}</span>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-workspace-message">Select a Map Game to load its maps and objects.</div>
          )}
        </article>

        <aside className="level-card map-game-transform-panel">
          {selectedObject ? (
            <div style={{ display: "grid", gap: 10 }}>
              <h3>{stripSetupObjectPrefix(selectedObject.name)}</h3>
              <label>
                Name
                <input
                  value={stripSetupObjectPrefix(selectedObject.name)}
                  onChange={(event) =>
                    updateObject(selectedObject.id, {
                      name: `[${selectedKind}] ${event.target.value}`,
                    })
                  }
                />
              </label>
              <label>
                Type
                <select
                  value={selectedKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as SetupObjectKind;
                    const cleanName = stripSetupObjectPrefix(selectedObject.name) || nextKind;
                    updateObject(selectedObject.id, {
                      modelId: `${nextKind.toLowerCase()}-object`,
                      name: `[${nextKind}] ${cleanName}`,
                    });
                  }}
                >
                  <option value="NPC">NPC</option>
                  <option value="Character">Character</option>
                  <option value="Lobby">Lobby</option>
                </select>
              </label>
              <div className="axis-button-row">
                {(["X", "Y", "Z"] as const).map((axis, index) => (
                  <button
                    className={activeAxis === index ? "active" : ""}
                    key={axis}
                    onClick={() => setActiveAxis(index as 0 | 1 | 2)}
                    type="button"
                  >
                    {axis}
                  </button>
                ))}
              </div>
              <p className="builder-empty-note">
                Select an axis, then use arrow keys. Shift + arrow moves faster. Shift + mouse wheel changes scale.
              </p>
              <NumberStepper
                label="Scale"
                step={0.1}
                value={selectedObject.scale[0]}
                onChange={(value) => updateObject(selectedObject.id, { scale: [value, value, value] })}
              />
              {(["X", "Y", "Z"] as const).map((axis, index) => (
                <NumberStepper
                  key={axis}
                  label={`Position ${axis}`}
                  value={selectedObject.position[index]}
                  onChange={(value) => {
                    const next: [number, number, number] = [...selectedObject.position];
                    next[index] = value;
                    updateObject(selectedObject.id, { position: next });
                  }}
                />
              ))}
              <button className="danger" type="button" onClick={() => deleteObject(selectedObject.id)}>
                Delete
              </button>
            </div>
          ) : (
            <p>{draft?.id ? "No object selected." : "Select a Map Game."}</p>
          )}
        </aside>
      </div>

      {showAdd ? (
        <ModalShell title="Add Object" onClose={() => setShowAdd(false)}>
          <div className="editor-glass-grid">
            <label style={{ gridColumn: "span 2" }}>
              Name
              <input value={objectName} onChange={(event) => setObjectName(event.target.value)} />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              Type
              <select value={objectKind} onChange={(event) => setObjectKind(event.target.value as SetupObjectKind)}>
                <option value="NPC">NPC</option>
                <option value="Character">Character</option>
                <option value="Lobby">Lobby</option>
              </select>
            </label>
            <div className="level-actions" style={{ gridColumn: "span 2" }}>
              <button disabled={!draft?.id} type="button" onClick={addObject}>
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

function SetupObjectsPanel({
  mode,
  draft,
  setDraft,
  saveLevel,
}: {
  mode: SetupObjectKind;
  draft: EditableLevelDraft | null;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft | null>>;
  saveLevel: () => Promise<GameLevel | null>;
}) {
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const [showAdd, setShowAdd] = useState(false);
  const [objectName, setObjectName] = useState("");
  const [objectKind, setObjectKind] = useState<SetupObjectKind>(mode);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const objects = draft?.placedObjects.filter((object) => getSetupObjectKind(object) === mode) ?? [];
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? objects[0] ?? null;

  useEffect(() => {
    setObjectKind(mode);
    setSelectedObjectId(null);
  }, [mode, draft?.id]);

  const addObject = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: [...current.placedObjects, createSetupObject(objectKind, objectName)],
          }
        : current,
    );
    setObjectName("");
    setShowAdd(false);
  };

  const updateObject = (objectId: string, updates: Partial<PlacedObject>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: current.placedObjects.map((object) =>
              object.id === objectId ? { ...object, ...updates } : object,
            ),
          }
        : current,
    );
  };

  const deleteObject = (objectId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            placedObjects: current.placedObjects.filter((object) => object.id !== objectId),
          }
        : current,
    );
    setSelectedObjectId(null);
  };

  return (
    <section className="workbench-panel" style={{ width: "min(1100px, calc(100vw - 32px))", margin: "72px auto 0" }}>
      <div className="workbench-panel-header">
        <div>
          <span>{mode.toUpperCase()}</span>
          <h2>{mode} Manager</h2>
          <p>Select a Map Game, then add, edit, or delete {mode} objects.</p>
        </div>
        <div className="level-actions">
          {draft?.id ? (
            <>
              <button type="button" onClick={() => setShowAdd(true)}>
                Add
              </button>
              <button type="button" onClick={() => void saveLevel()}>
                Save
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="level-grid">
        {!savedLevels.length ? (
          <article className="level-card">
            <h3>Empty</h3>
            <p>No Map Game has been created yet.</p>
          </article>
        ) : null}
        {savedLevels.map((level) => (
          <article
            className={`level-card${draft?.id === level.id ? " active" : ""}`}
            key={level.id}
            onClick={() => {
              setActiveLevel(level.id);
              setDraft(buildEditableLevel(level));
            }}
            style={{ cursor: "pointer" }}
          >
            <h3>{level.name}</h3>
            <p>{level.placedObjects.filter((object) => getSetupObjectKind(object) === mode).length} {mode} object(s)</p>
          </article>
        ))}
      </div>

      {draft?.id ? (
        <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 16, marginTop: 16 }}>
          <aside className="level-card">
            <h3>{mode} list</h3>
            {objects.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {objects.map((object) => (
                  <button
                    className={selectedObject?.id === object.id ? "active" : ""}
                    key={object.id}
                    onClick={() => setSelectedObjectId(object.id)}
                    type="button"
                  >
                    {object.name.replace(/^\[(NPC|Lobby|Character)\]\s*/, "")}
                  </button>
                ))}
              </div>
            ) : (
              <p>Empty</p>
            )}
          </aside>
          <article className="level-card">
            {selectedObject ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16 }}>
                <div style={{ minHeight: 300 }}>
                  <BuilderModelViewer src={selectedObject.fileUrl} fitHeight={2.6} />
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label>
                    Name
                    <input
                      value={selectedObject.name.replace(/^\[(NPC|Lobby|Character)\]\s*/, "")}
                      onChange={(event) =>
                        updateObject(selectedObject.id, {
                          name: `[${mode}] ${event.target.value}`,
                        })
                      }
                    />
                  </label>
                  <NumberStepper
                    label="Scale"
                    step={0.1}
                    value={selectedObject.scale[0]}
                    onChange={(value) => updateObject(selectedObject.id, { scale: [value, value, value] })}
                  />
                  {(["X", "Y", "Z"] as const).map((axis, index) => (
                    <NumberStepper
                      key={axis}
                      label={`Position ${axis}`}
                      value={selectedObject.position[index]}
                      onChange={(value) => {
                        const next: [number, number, number] = [...selectedObject.position];
                        next[index] = value;
                        updateObject(selectedObject.id, { position: next });
                      }}
                    />
                  ))}
                  <button className="danger" type="button" onClick={() => deleteObject(selectedObject.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <p>Empty</p>
            )}
          </article>
        </div>
      ) : null}

      {showAdd ? (
        <ModalShell title={`Add ${mode}`} onClose={() => setShowAdd(false)}>
          <div className="editor-glass-grid">
            <label style={{ gridColumn: "span 2" }}>
              Name
              <input value={objectName} onChange={(event) => setObjectName(event.target.value)} />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              Type
              <select value={objectKind} onChange={(event) => setObjectKind(event.target.value as SetupObjectKind)}>
                <option value="NPC">NPC</option>
                <option value="Lobby">Lobby</option>
                <option value="Character">Character</option>
              </select>
            </label>
            <div className="level-actions" style={{ gridColumn: "span 2" }}>
              <button type="button" onClick={addObject}>
                OK
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}

function PlayGameSelectorPanel({
  onPlay,
}: {
  onPlay: (levelId: string) => void;
}) {
  const savedLevels = useGameStore((state) => state.savedLevels);

  return (
    <section className="workbench-panel" style={{ width: "min(920px, calc(100vw - 32px))", margin: "72px auto 0" }}>
      <div className="workbench-panel-header">
        <div>
          <span>PLAY GAME</span>
          <h2>Select Map Game</h2>
          <p>Only Map Games created from uploaded maps are shown here.</p>
        </div>
      </div>
      <div className="level-grid">
        {!savedLevels.length ? (
          <article className="level-card">
            <h3>Empty</h3>
            <p>Create a Map Game first.</p>
          </article>
        ) : null}
        {savedLevels.map((level) => (
          <article className="level-card" key={level.id}>
            <h3>{level.name}</h3>
            <p>{level.placedObjects.filter((object) => object.isMap).length} map layer(s)</p>
            <div className="level-actions">
              <button type="button" onClick={() => onPlay(level.id)}>
                Play
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MapScopedSetupPanel({
  mode,
  draft,
  setDraft,
  assetLibrary,
  saveLevel,
  onCreateMap,
  onPlay,
}: {
  mode: "npc" | "character" | "lobby";
  draft: EditableLevelDraft | null;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft | null>>;
  assetLibrary: AssetLibraryItem[];
  saveLevel: () => Promise<GameLevel | null>;
  onCreateMap: () => void;
  onPlay: () => void;
}) {
  const activeLevel = useGameStore((state) => state.activeLevel);
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const selectedMapExists = activeLevel.id !== "empty-map" && savedLevels.some((level) => level.id === activeLevel.id);
  const characterAssets = assetLibrary.filter((asset) => {
    const category = asset.category?.toLowerCase();
    const url = asset.fileUrl.toLowerCase();
    return category === "character" || category === "characters" || category === "npc" || url.includes("robot");
  });
  const title =
    mode === "npc" ? "NPC" : mode === "character" ? "Character" : "Lobby";

  if (!selectedMapExists || !draft) {
    return (
      <section className="workbench-panel">
        <div className="workbench-panel-header">
          <div>
            <span>{title.toUpperCase()}</span>
            <h2>Select Map Game</h2>
            <p>Select a saved Map Game before adding {title.toLowerCase()} settings.</p>
          </div>
          <div className="level-actions">
            <button type="button" onClick={onCreateMap}>
              Create Map Game
            </button>
          </div>
        </div>
        <div className="level-grid">
          {!savedLevels.length ? (
            <article className="level-card">
              <h3>No Map Game yet</h3>
              <p>Create a Map Game from uploaded map assets first.</p>
              <div className="level-actions">
                <button type="button" onClick={onCreateMap}>
                  Create Map Game
                </button>
              </div>
            </article>
          ) : null}
          {savedLevels.map((level) => (
            <article className="level-card" key={level.id}>
              <h3>{level.name}</h3>
              <p>{level.mapModelUrl}</p>
              <div className="level-meta">
                <span>{level.placedObjects.length + 1} map layer(s)</span>
                <span>{level.playerCharacter?.name ?? "No character"}</span>
              </div>
              <div className="level-actions">
                <button type="button" onClick={() => setActiveLevel(level.id)}>
                  Select
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const saveAndPlay = async () => {
    const saved = await saveLevel();
    if (saved) setActiveLevel(saved.id);
    onPlay();
  };

  return (
    <section className="workbench-panel">
      <div className="workbench-panel-header">
        <div>
          <span>{title.toUpperCase()}</span>
          <h2>{activeLevel.name}</h2>
          <p>Configure this Map Game. Player runtime history is not saved.</p>
        </div>
        <div className="level-actions">
          <button type="button" onClick={() => void saveLevel()}>
            Save Map Game
          </button>
          <button type="button" onClick={() => void saveAndPlay()}>
            Play
          </button>
        </div>
      </div>

      {mode === "npc" ? (
        <div className="editor-liquid-dock" style={{ position: "static" }}>
          <details className="editor-glass-section" open>
            <summary>NPC placement</summary>
            <div className="editor-glass-grid">
              <label style={{ gridColumn: "span 2" }}>
                NPC position
                <input
                  value={draft.robotSpawn}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, robotSpawn: event.target.value } : current,
                    )
                  }
                />
              </label>
              <div style={{ gridColumn: "span 2", display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) =>
                      current ? { ...current, robotSpawn: formatVector([4, 0, 4]) } : current,
                    )
                  }
                >
                  Place near center
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) =>
                      current ? { ...current, robotSpawn: formatVector([8, 0, 0]) } : current,
                    )
                  }
                >
                  Place east
                </button>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {mode === "character" ? (
        <div className="editor-liquid-dock" style={{ position: "static" }}>
          <details className="editor-glass-section" open>
            <summary>Player character</summary>
            <div className="builder-character-grid">
              {characterAssets.map((asset) => (
                <button
                  className={draft.playerCharacter?.modelId === asset.id ? "active" : ""}
                  key={asset.id}
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            playerCharacter: {
                              modelId: asset.id,
                              name: asset.name,
                              fileUrl: asset.fileUrl,
                              format: asset.format,
                            },
                          }
                        : current,
                    )
                  }
                  type="button"
                >
                  <BuilderAssetSummary asset={asset} selected={draft.playerCharacter?.modelId === asset.id} />
                </button>
              ))}
              {!characterAssets.length ? (
                <p className="builder-empty-note">No character assets found. Upload/register a character first.</p>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}

      {mode === "lobby" ? (
        <div className="level-grid">
          <article className="level-card active">
            <h3>{activeLevel.name}</h3>
            <p>This Map Game is available for lobby/play selection after saving.</p>
            <div className="level-meta">
              <span>{activeLevel.mapModelUrl}</span>
              <span>{activeLevel.playerCharacter?.name ?? "No character"}</span>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function LevelEditorPanel({
  onPlay,
  draft,
  setDraft,
  assetLibrary,
  setAssetLibrary,
  saveLevel,
}: {
  onPlay: () => void;
  draft: EditableLevelDraft;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft>>;
  assetLibrary: AssetLibraryItem[];
  setAssetLibrary: Dispatch<SetStateAction<AssetLibraryItem[]>>;
  saveLevel: () => Promise<GameLevel | null>;
}) {
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [isUploadingMap, setIsUploadingMap] = useState(false);
  const [mapUploadError, setMapUploadError] = useState<string | null>(null);
  const [mapUploadName, setMapUploadName] = useState("");
  const [mapGameName, setMapGameName] = useState(draft.name || "New Map Game");
  const [primaryMapAssetId, setPrimaryMapAssetId] = useState("");
  const [secondaryMapAssetIds, setSecondaryMapAssetIds] = useState<string[]>([]);
  const [mapGameMessage, setMapGameMessage] = useState<string | null>(null);
  const [isCreatingMapGame, setIsCreatingMapGame] = useState(false);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const saveCustomLevel = useGameStore((state) => state.saveCustomLevel);

  const [selectedCoreId, setSelectedCoreId] = useState<string>("");
  const [selectedObjectId, setSelectedObjectId] = useState<string>("");
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");

  const updatePlacedObject = (
    objectId: string,
    updates: Partial<PlacedObject>,
  ) => {
    setDraft((current) => ({
      ...current,
      placedObjects: current.placedObjects.map((object) =>
        object.id === objectId ? { ...object, ...updates } : object,
      ),
    }));
  };

  const removePlacedObject = (objectId: string) => {
    setDraft((current) => ({
      ...current,
      placedObjects: current.placedObjects.filter(
        (object) => object.id !== objectId,
      ),
    }));
    setSelectedObjectId((prev) => (prev === objectId ? "" : prev));
  };

  const mapAssets = assetLibrary.filter((asset) => {
    const category = asset.category?.toLowerCase();
    const fileUrl = asset.fileUrl.toLowerCase();
    return (
      category === "map" ||
      category === "environment" ||
      category === "architecture" ||
      asset.customProps?.isMap === true ||
      fileUrl.includes("/maps/") ||
      fileUrl.includes("/map/") ||
      fileUrl.includes("/environment/") ||
      fileUrl.includes("/architecture/")
    );
  });

  useEffect(() => {
    if (primaryMapAssetId && mapAssets.some((asset) => asset.id === primaryMapAssetId)) {
      return;
    }
    setPrimaryMapAssetId(mapAssets[0]?.id ?? "");
  }, [mapAssets, primaryMapAssetId]);

  const refreshAssets = async () => {
    const response = await fetch("/api/models", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: AssetLibraryItem[];
    } | null;
    if (payload?.success && Array.isArray(payload.data)) {
      setAssetLibrary(payload.data);
    }
  };

  const uploadMap = async (file: File | null | undefined) => {
    if (!file) return;
    setIsUploadingMap(true);
    setMapUploadError(null);
    setMapGameMessage(null);
    const cleanName = mapUploadName.trim() || file.name.replace(/\.[^.]+$/, "");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", cleanName);
    formData.set("category", "map");
    formData.set("license", "proprietary");
    formData.append("tags", "map");
    formData.append("tags", "game-map-asset");

    try {
      const response = await fetch("/api/models/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: AssetLibraryItem;
        error?: string;
      } | null;
      if (!response.ok || !payload?.success || !payload.data) {
        setMapUploadError(payload?.error ?? "Map upload failed");
        return;
      }
      await refreshAssets();
      setPrimaryMapAssetId(payload.data.id);
      setMapUploadName("");
      setMapGameMessage(`Uploaded map "${payload.data.name}". You can now create a Map Game.`);
    } finally {
      setIsUploadingMap(false);
    }
  };

  const createMapObject = (asset: AssetLibraryItem, index: number): PlacedObject => ({
    id: createPlacedObjectId(),
    modelId: asset.id,
    name: asset.name,
    fileUrl: asset.fileUrl,
    position: [(index + 1) * 8, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    isMap: true,
  });

  const createDefaultPlayerCharacter = (): LevelCharacter => {
    const characterAsset = assetLibrary.find((asset) => {
      const category = asset.category?.toLowerCase();
      const fileUrl = asset.fileUrl.toLowerCase();
      return (
        category === "character" ||
        category === "characters" ||
        category === "npc" ||
        fileUrl.includes("robot") ||
        fileUrl.includes("character")
      );
    });

    return {
      modelId: characterAsset?.id ?? "default-layer-player",
      name: characterAsset?.name ?? "Layer Player",
      fileUrl: characterAsset?.fileUrl ?? "/models/robot_tuan_tra_NPC.glb",
      format: characterAsset?.format ?? "glb",
    };
  };

  const createMapGame = async () => {
    setMapUploadError(null);
    setMapGameMessage(null);
    const primaryAsset = mapAssets.find((asset) => asset.id === primaryMapAssetId);
    if (!primaryAsset) {
      setMapGameMessage("Upload and select at least 1 map before creating a Map Game.");
      return;
    }

    setIsCreatingMapGame(true);
    try {
      const secondaryAssets = secondaryMapAssetIds
        .map((id) => mapAssets.find((asset) => asset.id === id))
        .filter((asset): asset is AssetLibraryItem => Boolean(asset));
      const saved = await saveCustomLevel({
        name: mapGameName.trim() || "New Map Game",
        mapModelUrl: primaryAsset.fileUrl,
        playerCharacter: createDefaultPlayerCharacter(),
        playerSpawn: [0, PLAYER_SPAWN_OFFSET, 0],
        robotSpawn: [4, 0, 4],
        robotStory: "",
        storyGraph: EMPTY_STORY_GRAPH,
        mapCharacters: [],
        placedObjects: secondaryAssets.map(createMapObject),
        zombieSpawns: [],
      });

      if (!saved) {
        setMapGameMessage("Could not create Map Game.");
        return;
      }

      setActiveLevel(saved.id);
      setDraft(buildEditableLevel(saved));
      setSecondaryMapAssetIds([]);
      setMapGameMessage(`Created Map Game "${saved.name}". Add NPC or characters in the editor.`);
    } finally {
      setIsCreatingMapGame(false);
    }
  };

  return (
    <section className="workbench-panel editor-panel">
      <div className="workbench-panel-header">
        <div>
          <span>MAP EDITOR</span>
          <h2>{draft.name}</h2>
        </div>
        <div className="level-actions">
          <button
            type="button"
            onClick={() => {
              void saveLevel();
            }}
          >
            Save Level
          </button>
          <button
            type="button"
            onClick={async () => {
              const saved = await saveLevel();
              if (saved) setActiveLevel(saved.id);
              onPlay();
            }}
          >
            Preview
          </button>
        </div>
      </div>

      <LevelBuilderViewport
        assetLibrary={assetLibrary}
        draft={draft}
        selectedAssetId={selectedAssetId}
        setAssetLibrary={setAssetLibrary}
        setDraft={setDraft}
        setSelectedAssetId={setSelectedAssetId}
        selectedCoreId={selectedCoreId}
        setSelectedCoreId={setSelectedCoreId}
        selectedObjectId={selectedObjectId}
        setSelectedObjectId={setSelectedObjectId}
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        updatePlacedObject={updatePlacedObject}
        removePlacedObject={removePlacedObject}
      />

      <div className="editor-liquid-dock">
        <details className="editor-glass-section" open>
          <summary>Create Map Game</summary>
          <div className="editor-glass-grid">
            <label style={{ gridColumn: "span 2" }}>
              Upload map name
              <input
                placeholder="Example: Factory floor"
                value={mapUploadName}
                onChange={(event) => setMapUploadName(event.target.value)}
              />
            </label>
            <label className="map-upload-field" style={{ gridColumn: "span 2" }}>
              Upload map asset to Java BE
              <input
                accept=".glb,.gltf,.fbx"
                disabled={isUploadingMap}
                onChange={(event) => {
                  void uploadMap(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "8px" }}>
              <strong>Uploaded maps</strong>
              {mapAssets.length ? (
                <div style={{ display: "grid", gap: "6px" }}>
                  {mapAssets.map((asset) => (
                    <div
                      key={asset.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <span>{asset.name}</span>
                      <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {asset.fileUrl}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="builder-empty-note">No uploaded maps yet. Upload at least 1 map asset first.</p>
              )}
            </div>
            <label style={{ gridColumn: "span 2" }}>
              Map Game name
              <input
                value={mapGameName}
                onChange={(event) => setMapGameName(event.target.value)}
              />
            </label>
            <label style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "4px" }}>
              Primary uploaded map
              <select
                disabled={!mapAssets.length}
                style={{ padding: "6px", width: "100%" }}
                value={primaryMapAssetId}
                onChange={(event) => {
                  setPrimaryMapAssetId(event.target.value);
                  setSecondaryMapAssetIds((current) =>
                    current.filter((id) => id !== event.target.value),
                  );
                }}
              >
                {mapAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "8px" }}>
              <strong>Secondary maps</strong>
              {mapAssets
                .filter((asset) => asset.id !== primaryMapAssetId)
                .map((asset) => (
                  <label key={asset.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      checked={secondaryMapAssetIds.includes(asset.id)}
                      onChange={(event) => {
                        setSecondaryMapAssetIds((current) =>
                          event.target.checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        );
                      }}
                      type="checkbox"
                    />
                    {asset.name}
                  </label>
                ))}
              {mapAssets.length <= 1 ? (
                <p className="builder-empty-note">Secondary maps are optional. Upload more map assets to combine them.</p>
              ) : null}
            </div>
            <div style={{ gridColumn: "span 2", display: "flex", gap: "8px" }}>
              <button
                disabled={!mapAssets.length || isCreatingMapGame}
                onClick={() => void createMapGame()}
                type="button"
              >
                {isCreatingMapGame ? "Creating..." : "Create Map Game"}
              </button>
              <button
                disabled={!draft.mapModelUrl}
                onClick={async () => {
                  const saved = await saveLevel();
                  if (saved) setActiveLevel(saved.id);
                  onPlay();
                }}
                type="button"
              >
                Play current
              </button>
            </div>
          </div>
          {mapUploadError ? <p className="builder-empty-note">{mapUploadError}</p> : null}
          {mapGameMessage ? <p className="builder-empty-note">{mapGameMessage}</p> : null}
        </details>
        <details className="editor-glass-section">
          <summary>Advanced map placement</summary>
          <div className="editor-glass-grid">
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "4px" }}>
              Primary Map
              <select
                style={{ padding: "6px", width: "100%" }}
                value={draft.mapModelUrl}
                onChange={(event) => {
                  const selectUrl = event.target.value;
                  if (!selectUrl) return;
                  setDraft((current) => ({
                    ...current,
                    mapModelUrl: selectUrl,
                  }));
                }}
              >
                {mapAssets.map((asset) => (
                  <option key={asset.id} value={asset.fileUrl}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="editor-active-maps-container" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontWeight: "bold" }}>Secondary maps</label>
              <div className="editor-active-maps-list" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {draft.placedObjects
                  .filter((object) => object.isMap || isEnvironmentAsset(object.name, object.fileUrl))
                  .map((object, index) => {
                    const isSelected = selectedObjectId === object.id;
                    return (
                      <div
                        key={`${object.id}-${index}`}
                        className={`active-map-item${isSelected ? " active" : ""}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          padding: "8px 10px",
                          background: isSelected ? "rgba(0, 255, 196, 0.15)" : "rgba(255, 255, 255, 0.05)",
                          border: isSelected ? "1px solid #00ffc4" : "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "6px",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setSelectedCoreId("");
                          setSelectedObjectId(object.id);
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "180px", fontWeight: isSelected ? "bold" : "normal" }}>
                            {object.name || object.fileUrl.split("/").pop()}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "#ef4444",
                              color: "#fff",
                              border: "none",
                              borderRadius: "4px",
                              padding: "2px 8px",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              removePlacedObject(object.id);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        {isSelected && (
                          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>Scale</span>
                              <select
                                style={{ background: "#111b30", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", padding: "2px", fontSize: "0.75rem" }}
                                value={formatVector(object.scale)}
                                onChange={(event) => {
                                  const parsed = parseVector(event.target.value);
                                  if (parsed) updatePlacedObject(object.id, { scale: parsed });
                                }}
                              >
                                <option value="0.25, 0.25, 0.25">0.25x</option>
                                <option value="0.5, 0.5, 0.5">0.5x</option>
                                <option value="0.75, 0.75, 0.75">0.75x</option>
                                <option value="1, 1, 1">1.0x (Normal)</option>
                                <option value="1.25, 1.25, 1.25">1.25x</option>
                                <option value="1.5, 1.5, 1.5">1.5x</option>
                                <option value="2, 2, 2">2.0x</option>
                              </select>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
                              <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>Rotate Y</span>
                              <select
                                style={{ background: "#111b30", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "4px", padding: "2px", fontSize: "0.75rem" }}
                                value={object.rotation[1].toString()}
                                onChange={(event) => {
                                  const rotY = Number(event.target.value);
                                  if (Number.isFinite(rotY)) {
                                    updatePlacedObject(object.id, { rotation: [object.rotation[0], rotY, object.rotation[2]] });
                                  }
                                }}
                              >
                                <option value="0">0°</option>
                                <option value="45">45°</option>
                                <option value="90">90°</option>
                                <option value="135">135°</option>
                                <option value="180">180°</option>
                                <option value="225">225°</option>
                                <option value="270">270°</option>
                                <option value="315">315°</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <select
                  style={{ flex: 1, padding: "6px" }}
                  value=""
                  onChange={(event) => {
                    const addUrl = event.target.value;
                    if (!addUrl) return;
                    const asset = mapAssets.find((a) => a.fileUrl === addUrl);
                    if (!asset) return;

                    const id = createPlacedObjectId();
                    setDraft((current) => ({
                      ...current,
                      placedObjects: [
                        ...current.placedObjects,
                        {
                          id,
                          modelId: asset.id,
                          name: asset.name,
                          fileUrl: asset.fileUrl,
                          position: [0, 0, 0],
                          rotation: [0, 0, 0],
                          scale: [1, 1, 1],
                          isMap: true,
                        },
                      ],
                    }));
                  }}
                >
                  <option value="">Add secondary map...</option>
                  {mapAssets.map((asset) => (
                    <option key={asset.id} value={asset.fileUrl}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="map-upload-field">
              Upload map
              <input
                accept=".glb,.gltf,.fbx"
                disabled={isUploadingMap}
                onChange={(event) => {
                  void uploadMap(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
          {mapUploadError ? (
            <p className="builder-empty-note">{mapUploadError}</p>
          ) : null}
        </details>
      </div>
    </section>
  );
}

function PlayerWeaponEditorPanel() {
  const selectedWeapon = useGameStore((state) => state.selectedWeapon);
  const ownedWeapons = useGameStore((state) => state.ownedWeapons);
  const equipWeapon = useGameStore((state) => state.equipWeapon);
  const weaponLoadouts = useGameStore((state) => state.weaponLoadouts);
  const updateWeaponLoadout = useGameStore(
    (state) => state.updateWeaponLoadout,
  );
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);
  const [weapon, setWeapon] = useState<WeaponType>(selectedWeapon);
  const [pose, setPose] = useState<WeaponActionPose>("default");
  const activeLoadout = weaponLoadouts[weapon];
  const activeTransform =
    pose === "default"
      ? activeLoadout.transform
      : (activeLoadout.actionTransforms[pose] ?? activeLoadout.transform);
  const transformInputs = transformToInputs(activeTransform);
  const hitboxInputs = hitboxToInputs(activeLoadout.hitbox);
  const weaponAssets = assetLibrary.filter((asset) => {
    const format =
      asset.format?.toLowerCase() ??
      asset.fileUrl.split(".").pop()?.toLowerCase();
    return format === "glb" || format === "gltf";
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload?.success && Array.isArray(payload.data)) {
          setAssetLibrary(payload.data);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const commitLoadout = (updates: Partial<WeaponLoadout>) => {
    updateWeaponLoadout(weapon, {
      ...activeLoadout,
      ...updates,
    });
  };

  const commitTransform = (field: keyof WeaponTransform, value: string) => {
    const parsed = parseVector(value);
    if (!parsed) return;
    const nextTransform = {
      ...activeTransform,
      [field]: parsed,
    };

    if (pose === "default") {
      commitLoadout({ transform: nextTransform });
      return;
    }

    commitLoadout({
      actionTransforms: {
        ...activeLoadout.actionTransforms,
        [pose]: nextTransform,
      },
    });
  };

  const clearPoseOverride = () => {
    if (pose === "default") return;
    const { [pose]: _removed, ...rest } = activeLoadout.actionTransforms;
    commitLoadout({ actionTransforms: rest });
  };

  const commitHitbox = (field: keyof WeaponHitbox, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped =
      field === "arcDegrees"
        ? Math.min(Math.max(parsed, 5), 180)
        : field === "damageMultiplier"
          ? Math.min(Math.max(parsed, 0.1), 5)
          : Math.max(parsed, 0);
    commitLoadout({
      hitbox: {
        ...activeLoadout.hitbox,
        [field]: Number(clamped.toFixed(2)),
      },
    });
  };

  return (
    <section className="workbench-panel weapon-editor-panel">
      <div className="workbench-panel-header">
        <div>
          <span>PLAYER EDITOR</span>
          <h2>Weapon attachments</h2>
          <p>
            Assign uploaded GLB weapons to player slots and tune per-action hand
            transforms.
          </p>
        </div>
      </div>

      <div className="weapon-editor-grid">
        <aside className="weapon-slot-panel">
          {(Object.keys(weaponCatalog) as WeaponType[]).map((weaponType) => {
            const catalog = weaponCatalog[weaponType];
            const loadout = weaponLoadouts[weaponType];
            return (
              <button
                className={`weapon-slot-card${weapon === weaponType ? " active" : ""}`}
                key={weaponType}
                onClick={() => {
                  setWeapon(weaponType);
                  setPose("default");
                }}
                type="button"
              >
                <span>{catalog.label}</span>
                <strong>{loadout.name}</strong>
                <small>
                  {ownedWeapons.includes(weaponType)
                    ? "Owned"
                    : `${catalog.cost} score`}
                </small>
              </button>
            );
          })}
        </aside>

        <section className="weapon-config-panel">
          <div className="weapon-config-header">
            <div>
              <span>{weaponCatalog[weapon].label}</span>
              <h3>{activeLoadout.name}</h3>
              <p>{weaponCatalog[weapon].description}</p>
            </div>
            <button
              type="button"
              onClick={() => equipWeapon(weapon)}
              disabled={!ownedWeapons.includes(weapon)}
            >
              {selectedWeapon === weapon ? "Equipped" : "Equip"}
            </button>
          </div>

          <div className="weapon-form-grid">
            <label>
              Uploaded GLB weapon
              <select
                value={activeLoadout.modelId ?? ""}
                onChange={(event) => {
                  const asset = weaponAssets.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (!asset) {
                    commitLoadout({
                      modelId: undefined,
                      fileUrl: undefined,
                      name: weaponCatalog[weapon].label,
                    });
                    return;
                  }
                  commitLoadout({
                    modelId: asset.id,
                    fileUrl: asset.fileUrl,
                    name: asset.name,
                  });
                }}
              >
                <option value="">Use procedural default</option>
                {weaponAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.format?.toUpperCase() ?? "GLB"})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Action pose
              <select
                value={pose}
                onChange={(event) =>
                  setPose(event.target.value as WeaponActionPose)
                }
              >
                {weaponActionPoses.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === "default" ? "Default attach" : entry}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="weapon-transform-grid">
            <label>
              Position X, Y, Z
              <input
                defaultValue={transformInputs.position}
                key={`${weapon}-${pose}-position`}
                onBlur={(event) =>
                  commitTransform("position", event.target.value)
                }
              />
            </label>
            <label>
              Rotation X, Y, Z
              <input
                defaultValue={transformInputs.rotation}
                key={`${weapon}-${pose}-rotation`}
                onBlur={(event) =>
                  commitTransform("rotation", event.target.value)
                }
              />
            </label>
            <label>
              Scale X, Y, Z
              <input
                defaultValue={transformInputs.scale}
                key={`${weapon}-${pose}-scale`}
                onBlur={(event) => commitTransform("scale", event.target.value)}
              />
            </label>
          </div>

          <div className="weapon-section-label">
            <span>Hitbox physics</span>
            <small>
              Used by runtime combat while the player action is active.
            </small>
          </div>

          <div className="weapon-hitbox-grid">
            <label>
              Reach
              <input
                defaultValue={hitboxInputs.reach}
                key={`${weapon}-hitbox-reach`}
                onBlur={(event) => commitHitbox("reach", event.target.value)}
              />
            </label>
            <label>
              Radius
              <input
                defaultValue={hitboxInputs.radius}
                key={`${weapon}-hitbox-radius`}
                onBlur={(event) => commitHitbox("radius", event.target.value)}
              />
            </label>
            <label>
              Arc degrees
              <input
                defaultValue={hitboxInputs.arcDegrees}
                key={`${weapon}-hitbox-arc`}
                onBlur={(event) =>
                  commitHitbox("arcDegrees", event.target.value)
                }
              />
            </label>
            <label>
              Damage x
              <input
                defaultValue={hitboxInputs.damageMultiplier}
                key={`${weapon}-hitbox-damage`}
                onBlur={(event) =>
                  commitHitbox("damageMultiplier", event.target.value)
                }
              />
            </label>
          </div>

          <div className="weapon-editor-actions">
            <button
              type="button"
              onClick={clearPoseOverride}
              disabled={pose === "default"}
            >
              Clear action override
            </button>
            <span>
              Values update on blur. Open Play Game to preview the weapon
              against live player actions.
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

function AssetManagerPanel() {
  return (
    <section className="workbench-panel">
      <div className="workbench-panel-header">
        <div>
          <span>ASSET MANAGER</span>
          <h2>Map & Character Inputs</h2>
        </div>
      </div>
      <div className="asset-manager-grid">
        <a className="asset-card" href="/upload">
          <strong>Upload GLB Map</strong>
          <span>
            Use the existing uploader, then paste the delivery GLB URL into the
            Level Builder.
          </span>
        </a>
        <div className="asset-card">
          <strong>Character Package Roadmap</strong>
          <span>
            Next backend step: zip upload, FBX action mapping, and per-level
            character package selection.
          </span>
        </div>
        <div className="asset-card">
          <strong>Runtime Optimization</strong>
          <span>
            Current combat path avoids parent rerenders. Next scale step is
            batching non-hero enemies or impostor LOD for distant mobs.
          </span>
        </div>
      </div>
    </section>
  );
}

export function GameWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("maps");
  log3DDebug(
    "game-workbench-render",
    "GameWorkbench render",
    { activeTab },
    { intervalMs: 1000 },
  );
  const loadSavedLevels = useGameStore((state) => state.loadSavedLevels);
  const loadWeaponLoadouts = useGameStore((state) => state.loadWeaponLoadouts);
  const saveCustomLevel = useGameStore((state) => state.saveCustomLevel);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const activeLevel = useGameStore((state) => state.activeLevel);
  const savedLevels = useGameStore((state) => state.savedLevels);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const playerVelocity = useGameStore((state) => state.playerVelocity);
  const playerActionState = useGameStore((state) => state.playerActionState);
  const activeGameplayActionUrl = useGameStore((state) => state.activeGameplayActionUrl);
  const activeGameplayActionName = useGameStore((state) => state.activeGameplayActionName);

  const [draft, setDraft] = useState<EditableLevelDraft | null>(null);
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);
  const [chatMessages, setChatMessages] = useState<GameChatMessage[]>([]);
  const [chatDisplayName, setChatDisplayName] = useState("Player");
  const [isChatConnected, setIsChatConnected] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<RemotePresencePlayer[]>([]);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const realtimeWebSocketEnabled =
    process.env.NEXT_PUBLIC_CONTROL3D_REALTIME_ENABLED === "true";
  const allowRealtimeFallback =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_CONTROL3D_ALLOW_REALTIME_FALLBACK !== "false";

  const selectedPlayerCharacter = draft?.playerCharacter;
  const selectedPlayerAsset = selectedPlayerCharacter
    ? assetLibrary.find((asset) => asset.id === selectedPlayerCharacter.modelId)
    : null;
  const selectedPlayerActions = useMemo(
    () => getCharacterActionsFromAsset(selectedPlayerAsset),
    [selectedPlayerAsset],
  );
  const realtimeFallbackAction = useMemo(() => {
    if (activeGameplayActionUrl) {
      return {
        fileUrl: activeGameplayActionUrl,
        name: activeGameplayActionName ?? playerActionState,
      };
    }
    return (
      selectedPlayerActions.find((action) => action.enabled && action.trigger === "idle") ??
      null
    );
  }, [
    activeGameplayActionName,
    activeGameplayActionUrl,
    playerActionState,
    selectedPlayerActions,
  ]);
  const playerPositionRef = useRef(playerPosition);
  const initialRouteAppliedRef = useRef(false);

  const refreshAssets = useCallback(async () => {
    const response = await fetch("/api/models", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.success && Array.isArray(payload.data)) {
      setAssetLibrary(payload.data);
    }
  }, []);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  const realtimeRoom = useRealtimeGameRoom({
    active: realtimeWebSocketEnabled && activeTab === "play",
    mapId: activeLevel?.id,
    playerPosition,
    playerVelocity,
    characterName: activeLevel?.playerCharacter?.name ?? null,
    characterFileUrl: activeLevel?.playerCharacter?.fileUrl ?? null,
    actionState: playerActionState,
    activeActionName: realtimeFallbackAction?.name ?? playerActionState,
    activeActionUrl: realtimeFallbackAction?.fileUrl ?? null,
  });

  const setActiveGameplayAction = useGameStore((state) => state.setActiveGameplayAction);

  const [activeGameplayActionId, setActiveGameplayActionId] = useState<
    string | null
  >(null);

  const triggerGameplayAction = (actionId: string) => {
    const action = selectedPlayerActions.find((a) => a.id === actionId);
    if (action) {
      setActiveGameplayAction(action.fileUrl, action.name);
      setActiveGameplayActionId(actionId);
      setTimeout(() => {
        setActiveGameplayActionId((current) => {
          if (current === actionId) {
            setActiveGameplayAction(null, null);
            return null;
          }
          return current;
        });
      }, 1500);
    }
  };

  useEffect(() => {
    // Disabled keyboard animation override to let Player.tsx handle animations
    return;
    if (activeTab !== "play" || !selectedPlayerActions.length) return;

    const keysPressed = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      let key = e.key;
      if (e.code === "Space") key = "Space";
      if (key === "Control") key = "Ctrl";
      if (key.length === 1) key = key.toUpperCase();

      keysPressed.add(key);

      const keysArray = Array.from(keysPressed);
      keysArray.sort((a, b) => {
        const modifiers = ["Ctrl", "Shift", "Alt"];
        const aIdx = modifiers.indexOf(a);
        const bIdx = modifiers.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
      });

      const pressedCombo = keysArray.join("+");

      let matchedAction = null;
      if (["W", "A", "S", "D"].includes(key)) {
        matchedAction = selectedPlayerActions.find(
          (action) => action.enabled && action.keyBinding === "W+A+S+D",
        );
      }
      if (!matchedAction) {
        matchedAction = selectedPlayerActions.find(
          (action) => action.enabled && action.keyBinding === pressedCombo,
        );
      }

      if (matchedAction) {
        setActiveGameplayAction(matchedAction.fileUrl, matchedAction.name);
        setActiveGameplayActionId(matchedAction.id);
        if (matchedAction.keyBinding !== "W+A+S+D") {
          setTimeout(() => {
            setActiveGameplayActionId((current) => {
              if (current === matchedAction!.id) {
                setActiveGameplayAction(null, null);
                return null;
              }
              return current;
            });
          }, 1500);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let key = e.key;
      if (e.code === "Space") key = "Space";
      if (key === "Control") key = "Ctrl";
      if (key.length === 1) key = key.toUpperCase();

      keysPressed.delete(key);

      const hasMovementKeys = Array.from(keysPressed).some((k) =>
        ["W", "A", "S", "D"].includes(k),
      );
      if (!hasMovementKeys) {
        setActiveGameplayActionId((current) => {
          if (current) {
            const currentAction = selectedPlayerActions.find((a) => a.id === current);
            if (currentAction && currentAction.keyBinding === "W+A+S+D") {
              setActiveGameplayAction(null, null);
              return null;
            }
          }
          return current;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTab, selectedPlayerActions, setActiveGameplayAction]);

  useEffect(() => {
    loadSavedLevels();
    loadWeaponLoadouts();
  }, [loadSavedLevels, loadWeaponLoadouts]);

  useEffect(() => {
    if (initialRouteAppliedRef.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const tab = parseWorkbenchTab(params.get("tab"));
    const mapId = params.get("map");

    if (mapId) {
      const routeLevel = savedLevels.find((level) => level.id === mapId);
      if (!routeLevel) {
        if (!savedLevels.length) return;
      } else {
        setActiveLevel(routeLevel.id);
      }
    }

    if (tab) {
      setActiveTab(tab);
    }
    initialRouteAppliedRef.current = true;
  }, [savedLevels, setActiveLevel]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      const endpoints = ["/api/auth/me", "/api/admin/auth/me"];
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success) continue;

          const user = payload.data?.user;
          const admin = payload.data?.admin;
          const nextName =
            user?.displayName ||
            user?.username ||
            (admin?.email ? `Admin ${String(admin.email).split("@")[0]}` : "");
          if (!cancelled && nextName) {
            setChatDisplayName(String(nextName));
            setIsChatConnected(true);
          }
          return;
        } catch {
          // Try the next auth context.
        }
      }

      if (!cancelled) {
        setIsChatConnected(false);
      }
    }

    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadChatMessages = useCallback(async (mapId: string) => {
    const response = await fetch(
      `/api/maps/${encodeURIComponent(mapId)}/chat/history?limit=60`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error ?? "Unable to load chat");
    }
    setChatMessages(payload.data?.messages ?? []);
  }, []);

  useEffect(() => {
    if (
      !allowRealtimeFallback ||
      realtimeRoom.connected ||
      activeTab !== "play" ||
      !activeLevel?.id ||
      activeLevel.id === "empty-map"
    ) {
      setChatMessages([]);
      return;
    }

    let cancelled = false;
    const mapId = activeLevel.id;
    const tick = async () => {
      try {
        if (!cancelled) await loadChatMessages(mapId);
      } catch {
        // Chat should not break gameplay while editing local/draft maps.
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeLevel?.id,
    activeTab,
    allowRealtimeFallback,
    loadChatMessages,
    realtimeRoom.connected,
  ]);

  const sendChatMessage = useCallback(
    async (body: string) => {
      if (!activeLevel?.id || activeLevel.id === "empty-map") {
        throw new Error("Select a saved map before chatting.");
      }
      const response = await fetch(
        `/api/maps/${encodeURIComponent(activeLevel.id)}/chat/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: "map", body }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Unable to send chat message");
      }
      await loadChatMessages(activeLevel.id);
    },
    [activeLevel?.id, loadChatMessages],
  );

  const sendRealtimeRequiredMessage = useCallback(async () => {
    throw new Error("Realtime room is not connected.");
  }, []);

  useEffect(() => {
    if (
      !allowRealtimeFallback ||
      realtimeRoom.connected ||
      activeTab !== "play" ||
      !activeLevel?.id ||
      activeLevel.id === "empty-map"
    ) {
      setRemotePlayers([]);
      return;
    }

    let cancelled = false;
    const mapId = activeLevel.id;
    const heartbeatBody = () => ({
      position: playerPositionRef.current,
      velocity: playerVelocity,
      characterName: activeLevel.playerCharacter?.name ?? null,
      characterFileUrl: activeLevel.playerCharacter?.fileUrl ?? null,
      actionState: playerActionState,
      activeActionName: realtimeFallbackAction?.name ?? playerActionState,
      activeActionUrl: realtimeFallbackAction?.fileUrl ?? null,
    });

    const tick = async () => {
      try {
        await fetch(`/api/maps/${encodeURIComponent(mapId)}/presence`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(heartbeatBody()),
        });
        const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}/presence`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled && response.ok && payload?.success) {
          setRemotePlayers(payload.data?.players ?? []);
        }
      } catch {
        if (!cancelled) setRemotePlayers([]);
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeLevel?.id,
    activeLevel?.playerCharacter?.fileUrl,
    activeLevel?.playerCharacter?.name,
    activeTab,
    allowRealtimeFallback,
    playerActionState,
    playerVelocity,
    realtimeFallbackAction?.fileUrl,
    realtimeFallbackAction?.name,
    realtimeRoom.connected,
  ]);

  const effectiveChatMessages = realtimeRoom.connected
    ? realtimeRoom.messages
    : allowRealtimeFallback
      ? chatMessages
      : [];
  const effectiveRemotePlayers = realtimeRoom.connected
    ? realtimeRoom.remotePlayers
    : allowRealtimeFallback
      ? remotePlayers
      : [];
  const effectiveChatConnected =
    realtimeRoom.connected || (allowRealtimeFallback && isChatConnected);
  const effectiveChatDisplayName = realtimeRoom.connected
    ? realtimeRoom.selfDisplayName
    : chatDisplayName;
  const effectiveSendChatMessage = realtimeRoom.connected
    ? realtimeRoom.sendMessage
    : allowRealtimeFallback
      ? sendChatMessage
      : sendRealtimeRequiredMessage;

  useEffect(() => {
    if (activeLevel) {
      setDraft(buildEditableLevel(activeLevel));
    } else {
      setDraft(null);
    }
  }, [activeLevel]);

  useEffect(() => {
    let cancelled = false;
    refreshAssets().catch(() => {
      if (!cancelled) setAssetLibrary([]);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAssets]);

  const saveLevel = async () => {
    if (!draft) return null;
    const playerSpawn = parseVector(draft.playerSpawn);
    const robotSpawn = parseVector(draft.robotSpawn);
    if (!playerSpawn || !robotSpawn || !draft.mapModelUrl.trim()) return null;

    const levelId = draft.id === "empty-map" ? undefined : draft.id;
    const saved = await saveCustomLevel({
      id: levelId,
      name: draft.name.trim() || "Custom Sector",
      mapModelUrl: draft.mapModelUrl.trim() || DEFAULT_MAP_URL,
      playerCharacter: draft.playerCharacter,
      playerSpawn,
      robotSpawn,
      robotStory: draft.robotStory.trim(),
      storyGraph: draft.storyGraph,
      zombieSpawns: draft.zombieSpawns,
      mapCharacters: draft.mapCharacters,
      placedObjects: draft.placedObjects,
    });
    if (saved) {
      setDraft(buildEditableLevel(saved));
    }
    return saved;
  };

  const openPlay = () => {
    requestGameFullscreen();
    setIsGameRunning(true);
    setActiveTab("play");
  };

  const openEditor = () => {
    setIsGameRunning(false);
    setActiveTab("editor");
  };

  const createNewMap = async () => {
    setDraft(buildEditableLevel());
    setActiveTab("editor");
  };

  const showStoryTab = false;

  return (
    <div
      className={`game-container${activeTab === "play" && isGameRunning ? " game-container-play" : ""}${activeTab === "story" ? " game-container-story" : ""}`}
    >
      <nav className="game-workbench-nav">
        {[
          ["play", "Play Game"],
          ["maps", "Map Game"],
          ["editor", "Map Editor"],
          ["objects", "Objects"],
          ...(showStoryTab ? [["story", "Story Graph"]] : []),
        ].map(([id, label]) => (
          <button
            className={activeTab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setIsGameRunning(false);
              if (id === "play") {
                setActiveTab("play");
                return;
              }
              if (id === "editor") {
                openEditor();
                return;
              }
              setActiveTab(id as WorkbenchTab);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "play" && isGameRunning && (
        <div style={{ position: "relative", width: "100%", height: "calc(100vh - 50px)" }}>
          <GameCanvas
            playerActions={selectedPlayerActions}
            remotePlayers={effectiveRemotePlayers}
          />
          <HUD />
        </div>
      )}
      {activeTab === "play" && !isGameRunning && (
        <PlayGameSelectorPanel
          onPlay={(levelId) => {
            setActiveLevel(levelId);
            openPlay();
          }}
        />
      )}
      {activeTab === "maps" && (
        <MapGamePanel
          assetLibrary={assetLibrary}
          draft={draft}
          setDraft={setDraft}
          saveCustomLevel={saveCustomLevel}
          saveLevel={saveLevel}
        />
      )}
      {activeTab === "editor" && (
        <MapEditorAssetsPanel
          assetLibrary={assetLibrary}
          refreshAssets={refreshAssets}
        />
      )}
      {activeTab === "objects" && (
        <ObjectManagerPanel
          draft={draft}
          setDraft={setDraft}
          saveLevel={saveLevel}
        />
      )}
      {activeTab === "story" && draft && (
        <div style={{ height: "calc(100vh - 50px)" }}>
          <StoryGraphPanel
            assetLibrary={assetLibrary}
            mapCharacters={draft.mapCharacters as MapCharacter[]}
            graph={draft.storyGraph}
            onChange={(storyGraph) =>
              setDraft((current) =>
                current ? { ...current, storyGraph } : null,
              )
            }
            onSave={saveLevel}
          />
        </div>
      )}
    </div>
  );
}
