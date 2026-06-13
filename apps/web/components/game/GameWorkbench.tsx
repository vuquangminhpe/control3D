"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { getIntelligentScaleMultiplier } from "@/lib/3d/camera";
import { StoryGraphPanel } from "./StoryGraphPanel";
import { DialogueSystem } from "./DialogueSystem";
import { GameCanvas } from "./GameCanvas";
import { HUD } from "./HUD";
import {
  useGameStore,
  weaponCatalog,
  type GameLevel,
  type LevelCharacter,
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

type WorkbenchTab = "play" | "maps" | "editor" | "story";
type PlacementTool = "player" | "object";
type EditableLevelDraft = ReturnType<typeof buildEditableLevel>;
type AssetLibraryItem = {
  id: string;
  name: string;
  fileUrl: string;
  category: string;
  format?: string;
  thumbnailUrl?: string | null;
};

const DEFAULT_MAP_URL = "";
const PLAYER_SPAWN_OFFSET = 1.5;
const EDITOR_MAP_MAX_SIZE = 92;
const MAP_CHARACTER_HEIGHT = 0.8;
const MAP_OBJECT_MAX_SIZE = 1.0;
const weaponActionPoses: WeaponActionPose[] = ["default", "idle", "walk", "run", "attack", "slash", "kick", "block"];

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
  characterHeight: number;
  objectMaxSize: number;
};

const DEFAULT_MAP_RELATIVE_SCALE: MapRelativeScale = {
  characterHeight: MAP_CHARACTER_HEIGHT,
  objectMaxSize: MAP_OBJECT_MAX_SIZE,
};

function formatVector(position: [number, number, number]) {
  return position.map((value) => Number(value.toFixed(2))).join(", ");
}

function parseVector(value: string): [number, number, number] | null {
  const parts = value.split(",").map((entry) => Number(entry.trim()));
  if (parts.length !== 3 || parts.some((entry) => !Number.isFinite(entry))) return null;
  return [parts[0], parts[1], parts[2]];
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
    playerSpawn: formatVector(source?.playerSpawn ?? [0, PLAYER_SPAWN_OFFSET, 0]),
    robotSpawn: formatVector(source?.robotSpawn ?? [0, 0, 0]),
    robotStory: source?.robotStory ?? "",
    storyGraph: normalizeStoryGraph(source?.storyGraph),
    placedObjects: normalizePlacedObjects(source?.placedObjects ?? []),
    zombieSpawns: source?.zombieSpawns ?? [],
  };
}

function normalizeStoryGraph(graph?: StoryGraph | null): StoryGraph {
  if (!graph?.nodes?.length) {
    return {
      nodes: EMPTY_STORY_GRAPH.nodes.map((node) => ({ ...node, position: { ...node.position } })),
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
    edges: (graph.edges ?? []).filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)),
    variables: graph.variables || [],
  };
}

function createPlacedObjectId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `obj-${crypto.randomUUID()}`;
  }
  return `obj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
      <Canvas camera={{ position: [1.8, 1.25, 2.4], fov: 36 }} dpr={[1, compact ? 1 : 1.5]} frameloop="demand">
        <color attach="background" args={["#111827"]} />
        <ambientLight intensity={0.85} />
        <directionalLight intensity={1.9} position={[3, 4, 3]} />
        <Suspense fallback={null}>
          <ModelLoader fitHeight={fitHeight} fitMaxSize={fitMaxSize} groundToY={0} src={src} onSceneReady={setModelRoot} />
        </Suspense>
        <ThumbnailAutoFit controlsRef={controlsRef} model={modelRoot} />
        <OrbitControls ref={controlsRef} enablePan={false} enableZoom={interactive} enableRotate={interactive} makeDefault />
      </Canvas>
    </div>
  );
}


function groundMarkerPosition(position: [number, number, number], offset: number): [number, number, number] {
  return [position[0], Number((position[1] - offset).toFixed(2)), position[2]];
}

function getMapRelativeScale(mapObject: THREE.Object3D | null): MapRelativeScale {
  if (!mapObject) return DEFAULT_MAP_RELATIVE_SCALE;
  const scaleRatio = mapObject.scale.x;
  const scale = {
    characterHeight: 1.85 * scaleRatio,
    objectMaxSize: 1.8 * scaleRatio,
  };
  console.log("[antigravity-debug] getMapRelativeScale:", {
    scaleRatio,
    scale
  });
  return scale;
}

function getObjectBounds(object: THREE.Object3D | null) {
  if (!object) return null;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  return bounds.isEmpty() ? null : bounds;
}

function sameMapRelativeScale(a: MapRelativeScale, b: MapRelativeScale) {
  return Math.abs(a.characterHeight - b.characterHeight) < 0.001
    && Math.abs(a.objectMaxSize - b.objectMaxSize) < 0.001;
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
          <ModelLoader fitHeight={fitHeight} groundToY={0} src={modelSrc} />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[fitHeight * 0.42, fitHeight, fitHeight * 0.42]} />
            <meshBasicMaterial color="#00ffc4" wireframe transparent opacity={0.75} />
          </mesh>
        ) : null}
        <MarkerLabel>PLAYER</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls object={groupRef.current} mode="translate" onMouseUp={commitTransform} />
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
}: {
  fitMaxSize: number;
  object: PlacedObject;
  onCommit: (updates: Partial<PlacedObject>) => void;
  onSelect: () => void;
  selected: boolean;
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

  const adjustedSize = fitMaxSize * getIntelligentScaleMultiplier(object.name);

  return (
    <>
      <group
        ref={groupRef}
        position={object.position}
        rotation={object.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [number, number, number]}
        scale={object.scale}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Suspense fallback={null}>
          <ModelLoader fitMaxSize={adjustedSize} groundToY={0} src={object.fileUrl} />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[adjustedSize, adjustedSize, adjustedSize]} />
            <meshBasicMaterial color="#00ffc4" wireframe transparent opacity={0.7} />
          </mesh>
        ) : null}
        <MarkerLabel>{object.name}</MarkerLabel>
      </group>

      {selected && groupRef.current ? (
        <TransformControls object={groupRef.current} mode="translate" onMouseUp={commitTransform} />
      ) : null}
    </>
  );
}

function LevelBuilderViewport({
  assetLibrary,
  draft,
  selectedAssetId,
  setDraft,
  setSelectedAssetId,
}: {
  assetLibrary: AssetLibraryItem[];
  draft: EditableLevelDraft;
  selectedAssetId: string;
  setDraft: Dispatch<SetStateAction<EditableLevelDraft>>;
  setSelectedAssetId: Dispatch<SetStateAction<string>>;
}) {
  const [placementTool, setPlacementTool] = useState<PlacementTool>("player");
  console.log("[antigravity-debug] LevelBuilderViewport render:", {
    mapModelUrl: draft.mapModelUrl,
    playerCharacterUrl: draft.playerCharacter?.fileUrl,
    placedObjectsCount: draft.placedObjects.length
  });
  const [selectedCoreId, setSelectedCoreId] = useState<"player" | "">("");
  const [selectedObjectId, setSelectedObjectId] = useState<string>("");
  const [mapRelativeScale, setMapRelativeScale] = useState<MapRelativeScale>(DEFAULT_MAP_RELATIVE_SCALE);
  const terrainObjectRef = useRef<THREE.Object3D | null>(null);
  const terrainRaycasterRef = useRef(new THREE.Raycaster());
  const lastTerrainSnapKeyRef = useRef("");
  const lastMapSeedUrlRef = useRef("");
  const currentMapScale = draft.mapModelUrl ? (terrainObjectRef.current?.scale.x ?? 1.0) : 1.0;
  const playerSpawn = parseVector(draft.playerSpawn) ?? [0, PLAYER_SPAWN_OFFSET * currentMapScale, 0];
  const selectedAsset = assetLibrary.find((asset) => asset.id === selectedAssetId);
  const characterAssets = assetLibrary.filter((asset) => asset.category === "character");
  const selectedPlayerCharacter = draft.playerCharacter;

  const setPlayerCharacter = (assetId: string) => {
    const asset = characterAssets.find((entry) => entry.id === assetId);
    setDraft((current) => ({
      ...current,
      playerCharacter: asset
        ? {
            modelId: asset.id,
            name: asset.name,
            fileUrl: asset.fileUrl,
            format: asset.format,
          } satisfies LevelCharacter
        : null,
    }));
  };

  useEffect(() => {
    if (!selectedAssetId && assetLibrary[0]) {
      setSelectedAssetId(assetLibrary[0].id);
    }
  }, [assetLibrary, selectedAssetId, setSelectedAssetId]);

  const getTerrainY = (x: number, z: number, fallbackY = 0) => {
    const terrain = terrainObjectRef.current;
    if (!terrain) return fallbackY;
    terrain.updateMatrixWorld(true);
    const raycaster = terrainRaycasterRef.current;
    raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(terrain, true)
      .filter((hit) => hit.object.userData.isTerrainSurface && !hit.object.userData.ignoreBuilderRaycast);
    return hits[0]?.point.y ?? fallbackY;
  };

  const getTerrainYAt = (terrain: THREE.Object3D, x: number, z: number, fallbackY = 0) => {
    terrain.updateMatrixWorld(true);
    const raycaster = terrainRaycasterRef.current;
    raycaster.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(terrain, true)
      .filter((hit) => hit.object.userData.isTerrainSurface && !hit.object.userData.ignoreBuilderRaycast);
    return hits[0]?.point.y ?? fallbackY;
  };

  const reseedSpawnForMap = (scene: THREE.Object3D) => {
    const bounds = getObjectBounds(scene);
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3());
    const playerX = Number(center.x.toFixed(2));
    const playerZ = Number(center.z.toFixed(2));
    const playerGround = getTerrainYAt(scene, playerX, playerZ, center.y);
    const mapScale = scene.scale.x;
    setDraft((current) => ({
      ...current,
      playerSpawn: formatVector([playerX, playerGround + PLAYER_SPAWN_OFFSET * mapScale, playerZ]),
      zombieSpawns: [],
      placedObjects: [],
    }));
  };

  const entityPosition = (x: number, z: number, heightOffset: number, fallbackY = 0): [number, number, number] => [
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
      setDraft((current) => ({ ...current, playerSpawn: formatVector([x, terrainY + PLAYER_SPAWN_OFFSET * currentMapScale, z]) }));
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

  const updatePlacedObject = (objectId: string, updates: Partial<PlacedObject>) => {
    setDraft((current) => ({
      ...current,
      placedObjects: current.placedObjects.map((object) =>
        object.id === objectId ? { ...object, ...updates } : object
      ),
    }));
  };

  const removePlacedObject = (objectId: string) => {
    setDraft((current) => ({
      ...current,
      placedObjects: current.placedObjects.filter((object) => object.id !== objectId),
    }));
    if (selectedObjectId === objectId) setSelectedObjectId("");
  };

  const snapDraftToTerrain = () => {
    if (!terrainObjectRef.current) return;
    const mapScale = terrainObjectRef.current.scale.x;
    setDraft((current) => {
      const currentPlayerSpawn = parseVector(current.playerSpawn) ?? [0, PLAYER_SPAWN_OFFSET * mapScale, 5];
      return {
        ...current,
        playerSpawn: formatVector(entityPosition(currentPlayerSpawn[0], currentPlayerSpawn[2], PLAYER_SPAWN_OFFSET * mapScale, currentPlayerSpawn[1] - PLAYER_SPAWN_OFFSET * mapScale)),
        placedObjects: current.placedObjects.map((object) => ({
          ...object,
          position: entityPosition(object.position[0], object.position[2], 0, object.position[1]),
        })),
      };
    });
  };

  return (
    <div className="builder-layout">
      <aside className="builder-toolbar">
        <section className="builder-player-panel">
          <header>
            <strong>Player character</strong>
            <span>{selectedPlayerCharacter?.format?.toUpperCase() ?? "NONE"}</span>
          </header>
          {selectedPlayerCharacter?.fileUrl ? (
            <BuilderModelViewer
              fitHeight={1.35}
              src={selectedPlayerCharacter.fileUrl}
            />
          ) : (
            <p className="builder-empty-note">Choose a registered character before placing a player.</p>
          )}
          <div className="builder-character-grid">
            {characterAssets.map((asset) => (
              <button
                className={selectedPlayerCharacter?.modelId === asset.id ? "active" : ""}
                key={asset.id}
                onClick={() => setPlayerCharacter(asset.id)}
                type="button"
              >
                <BuilderModelViewer compact fitHeight={0.95} interactive={false} src={asset.fileUrl} />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
        </section>
        <label>
          Add
          <select
            value={placementTool}
            onChange={(event) => setPlacementTool(event.target.value as PlacementTool)}
          >
            <option value="player">Player</option>
            <option value="object">Uploaded Model</option>
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
                    <BuilderModelViewer compact fitMaxSize={0.95} interactive={false} src={asset.fileUrl} />
                    <span>
                      <strong>{asset.name}</strong>
                      <small>{asset.format?.toUpperCase() ?? asset.category}</small>
                    </span>
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
            <span>{draft.placedObjects.length}</span>
          </header>
          {draft.placedObjects.length ? (
            <div className="builder-object-list">
              {draft.placedObjects.map((object, index) => (
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
                    <BuilderModelViewer compact fitMaxSize={0.95} interactive={false} src={object.fileUrl} />
                    <span>
                      <strong>{object.name}</strong>
                      <small>{object.scale[0].toFixed(2)}x</small>
                    </span>
                  </button>
                  <div className="builder-object-controls">
                    <select
                      aria-label={`Scale ${object.name}`}
                      value={formatVector(object.scale)}
                      onChange={(event) => {
                        const parsed = parseVector(event.target.value);
                        if (parsed) updatePlacedObject(object.id, { scale: parsed });
                      }}
                    >
                      <option value="0.35, 0.35, 0.35">Tiny</option>
                      <option value="0.55, 0.55, 0.55">Small</option>
                      <option value="0.75, 0.75, 0.75">Normal</option>
                      <option value="1, 1, 1">Large</option>
                    </select>
                    <button className="danger" onClick={() => removePlacedObject(object.id)} type="button">
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
      </aside>

      <div className="builder-viewport">
          <div className="builder-viewport-meta">
          <strong>
            {placementTool === "object"
              ? selectedAsset?.name ?? "Select a model"
              : selectedPlayerCharacter
                ? "Click ground to place player"
                : "Choose player character"}
          </strong>
        </div>
        <Canvas camera={{ position: [16, 14, 20], fov: 48 }} shadows="percentage">
          <color attach="background" args={["#070b16"]} />
          <ambientLight intensity={0.65} />
          <directionalLight castShadow intensity={1.8} position={[8, 16, 10]} />
          <Grid args={[EDITOR_MAP_MAX_SIZE, EDITOR_MAP_MAX_SIZE]} cellColor="#203047" sectionColor="#00ffc4" position={[0, -0.02, 0]} visible={false} />
          <Suspense fallback={null}>
            {draft.mapModelUrl ? (
              <group position={[0, 0, 0]} scale={[1, 1, 1]}>
                <ModelLoader
                  fitMaxSize={EDITOR_MAP_MAX_SIZE}
                  groundToY={0}
                  markAsTerrain
                  onMeshClick={handleTerrainClick}
                  onSceneReady={(scene) => {
                    terrainObjectRef.current = scene;
                    const nextScale = getMapRelativeScale(scene);
                    console.log("[antigravity-debug] Editor Terrain Loaded:", {
                      sceneName: scene?.name,
                      sceneScaleX: scene?.scale.x,
                      nextScale
                    });
                    setMapRelativeScale((current) =>
                      sameMapRelativeScale(current, nextScale) ? current : nextScale,
                    );
                    if (!lastMapSeedUrlRef.current) {
                      lastMapSeedUrlRef.current = draft.mapModelUrl;
                    } else if (scene && lastMapSeedUrlRef.current !== draft.mapModelUrl) {
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleGroundClick} receiveShadow>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color="#0b1224" transparent opacity={0} side={THREE.DoubleSide} />
          </mesh>
          {selectedPlayerCharacter?.fileUrl ? (
            <PlayerMarker
              fitHeight={mapRelativeScale.characterHeight}
              modelSrc={selectedPlayerCharacter.fileUrl}
              onCommit={(position) => {
                const snapped = entityPosition(position[0], position[2], PLAYER_SPAWN_OFFSET * currentMapScale, position[1]);
                setDraft((current) => ({ ...current, playerSpawn: formatVector(snapped) }));
              }}
              onSelect={() => {
                setSelectedCoreId("player");
                setSelectedObjectId("");
              }}
              position={groundMarkerPosition(playerSpawn, PLAYER_SPAWN_OFFSET * currentMapScale)}
              selected={selectedCoreId === "player"}
            />
          ) : null}
          {draft.placedObjects.map((object, index) => (
            <PlacedObjectMarker
              fitMaxSize={mapRelativeScale.objectMaxSize}
              key={`${object.id}-${index}`}
              object={object}
              onCommit={(updates) => {
                const position = updates.position
                  ? entityPosition(updates.position[0], updates.position[2], 0, updates.position[1])
                  : undefined;
                updatePlacedObject(object.id, { ...updates, ...(position ? { position } : {}) });
              }}
              onSelect={() => {
                setSelectedCoreId("");
                setSelectedObjectId(object.id);
              }}
              selected={selectedObjectId === object.id}
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

function MapsPanel({ onNewMap, onPlay }: { onNewMap: () => void; onPlay: () => void }) {
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
          <p>Choose a game map, then open gameplay preview or move into the editor tabs.</p>
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
            <p>Create a new map, upload/select terrain, then add registered models from the editor.</p>
            <div className="level-actions">
              <button type="button" onClick={onNewMap}>
                New Map
              </button>
            </div>
          </article>
        ) : null}
        {uniqueLevels.map((level) => (
          <article className={`level-card${level.id === activeLevel.id ? " active" : ""}`} key={level.id}>
            <h3>{level.name}</h3>
            <p>{level.mapModelUrl ? "Custom map" : "Map not selected yet"}</p>
            <div className="level-meta">
              <span>{level.placedObjects.length} objects</span>
              <span>{level.playerCharacter?.name ?? "No player"}</span>
            </div>
            <div className="level-actions">
              <button type="button" onClick={() => { setActiveLevel(level.id); onPlay(); }}>
                Play
              </button>
              <button className="danger" type="button" onClick={() => deleteCustomLevel(level.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
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
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);


  const mapAssets = assetLibrary.filter((asset) => {
    const format = asset.format?.toLowerCase() ?? asset.fileUrl.split(".").pop()?.toLowerCase();
    return asset.category === "environment" || asset.category === "architecture" || format === "glb" || format === "gltf" || format === "fbx";
  });

  const refreshAssets = async () => {
    const response = await fetch("/api/models", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as {
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
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", file.name.replace(/\.[^.]+$/, ""));
    formData.set("category", "environment");
    formData.set("license", "proprietary");

    try {
      const response = await fetch("/api/models/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        data?: AssetLibraryItem;
        error?: string;
      } | null;
      if (!response.ok || !payload?.success || !payload.data) {
        setMapUploadError(payload?.error ?? "Map upload failed");
        return;
      }
      setDraft((current) => ({ ...current, mapModelUrl: payload.data?.fileUrl ?? current.mapModelUrl }));
      await refreshAssets();
    } finally {
      setIsUploadingMap(false);
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
          <button type="button" onClick={() => { void saveLevel(); }}>Save Level</button>
          <button type="button" onClick={async () => {
            const saved = await saveLevel();
            if (saved) setActiveLevel(saved.id);
            onPlay();
          }}>
            Preview
          </button>
        </div>
      </div>

      <LevelBuilderViewport
        assetLibrary={assetLibrary}
        draft={draft}
        selectedAssetId={selectedAssetId}
        setDraft={setDraft}
        setSelectedAssetId={setSelectedAssetId}
      />


      <div className="editor-liquid-dock">
        <details className="editor-glass-section" open>
          <summary>Map</summary>
          <div className="editor-glass-grid">
            <label>
              Name
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Active map
              <select
                value={draft.mapModelUrl}
                onChange={(event) => setDraft((current) => ({ ...current, mapModelUrl: event.target.value }))}
              >
                <option value="">Choose map</option>
                {mapAssets.map((asset) => (
                  <option key={asset.id} value={asset.fileUrl}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
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
          {mapUploadError ? <p className="builder-empty-note">{mapUploadError}</p> : null}
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
  const updateWeaponLoadout = useGameStore((state) => state.updateWeaponLoadout);
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);
  const [weapon, setWeapon] = useState<WeaponType>(selectedWeapon);
  const [pose, setPose] = useState<WeaponActionPose>("default");
  const activeLoadout = weaponLoadouts[weapon];
  const activeTransform = pose === "default"
    ? activeLoadout.transform
    : activeLoadout.actionTransforms[pose] ?? activeLoadout.transform;
  const transformInputs = transformToInputs(activeTransform);
  const hitboxInputs = hitboxToInputs(activeLoadout.hitbox);
  const weaponAssets = assetLibrary.filter((asset) => {
    const format = asset.format?.toLowerCase() ?? asset.fileUrl.split(".").pop()?.toLowerCase();
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
      field === "arcDegrees" ? Math.min(Math.max(parsed, 5), 180) :
      field === "damageMultiplier" ? Math.min(Math.max(parsed, 0.1), 5) :
      Math.max(parsed, 0);
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
          <p>Assign uploaded GLB weapons to player slots and tune per-action hand transforms.</p>
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
                <small>{ownedWeapons.includes(weaponType) ? "Owned" : `${catalog.cost} score`}</small>
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
            <button type="button" onClick={() => equipWeapon(weapon)} disabled={!ownedWeapons.includes(weapon)}>
              {selectedWeapon === weapon ? "Equipped" : "Equip"}
            </button>
          </div>

          <div className="weapon-form-grid">
            <label>
              Uploaded GLB weapon
              <select
                value={activeLoadout.modelId ?? ""}
                onChange={(event) => {
                  const asset = weaponAssets.find((entry) => entry.id === event.target.value);
                  if (!asset) {
                    commitLoadout({ modelId: undefined, fileUrl: undefined, name: weaponCatalog[weapon].label });
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
              <select value={pose} onChange={(event) => setPose(event.target.value as WeaponActionPose)}>
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
              <input defaultValue={transformInputs.position} key={`${weapon}-${pose}-position`} onBlur={(event) => commitTransform("position", event.target.value)} />
            </label>
            <label>
              Rotation X, Y, Z
              <input defaultValue={transformInputs.rotation} key={`${weapon}-${pose}-rotation`} onBlur={(event) => commitTransform("rotation", event.target.value)} />
            </label>
            <label>
              Scale X, Y, Z
              <input defaultValue={transformInputs.scale} key={`${weapon}-${pose}-scale`} onBlur={(event) => commitTransform("scale", event.target.value)} />
            </label>
          </div>

          <div className="weapon-section-label">
            <span>Hitbox physics</span>
            <small>Used by runtime combat while the player action is active.</small>
          </div>

          <div className="weapon-hitbox-grid">
            <label>
              Reach
              <input defaultValue={hitboxInputs.reach} key={`${weapon}-hitbox-reach`} onBlur={(event) => commitHitbox("reach", event.target.value)} />
            </label>
            <label>
              Radius
              <input defaultValue={hitboxInputs.radius} key={`${weapon}-hitbox-radius`} onBlur={(event) => commitHitbox("radius", event.target.value)} />
            </label>
            <label>
              Arc degrees
              <input defaultValue={hitboxInputs.arcDegrees} key={`${weapon}-hitbox-arc`} onBlur={(event) => commitHitbox("arcDegrees", event.target.value)} />
            </label>
            <label>
              Damage x
              <input defaultValue={hitboxInputs.damageMultiplier} key={`${weapon}-hitbox-damage`} onBlur={(event) => commitHitbox("damageMultiplier", event.target.value)} />
            </label>
          </div>

          <div className="weapon-editor-actions">
            <button type="button" onClick={clearPoseOverride} disabled={pose === "default"}>
              Clear action override
            </button>
            <span>
              Values update on blur. Open Play Game to preview the weapon against live player actions.
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
          <span>Use the existing uploader, then paste the delivery GLB URL into the Level Builder.</span>
        </a>
        <div className="asset-card">
          <strong>Character Package Roadmap</strong>
          <span>Next backend step: zip upload, FBX action mapping, and per-level character package selection.</span>
        </div>
        <div className="asset-card">
          <strong>Runtime Optimization</strong>
          <span>Current combat path avoids parent rerenders. Next scale step is batching non-hero enemies or impostor LOD for distant mobs.</span>
        </div>
      </div>
    </section>
  );
}

export function GameWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("maps");
  console.log("[antigravity-debug] GameWorkbench mounting/rendering. ActiveTab is:", activeTab);
  const loadSavedLevels = useGameStore((state) => state.loadSavedLevels);
  const loadWeaponLoadouts = useGameStore((state) => state.loadWeaponLoadouts);
  const saveCustomLevel = useGameStore((state) => state.saveCustomLevel);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const activeLevel = useGameStore((state) => state.activeLevel);

  const [draft, setDraft] = useState<EditableLevelDraft | null>(null);
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);

  useEffect(() => {
    loadSavedLevels();
    loadWeaponLoadouts();
  }, [loadSavedLevels, loadWeaponLoadouts]);

  useEffect(() => {
    if (activeLevel) {
      setDraft(buildEditableLevel(activeLevel));
    } else {
      setDraft(null);
    }
  }, [activeLevel]);

  useEffect(() => {
    let cancelled = false;
    const loadAssets = () => fetch("/api/models", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload?.success && Array.isArray(payload.data)) {
          setAssetLibrary(payload.data);
        }
      })
      .catch(() => undefined);
    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

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
      placedObjects: draft.placedObjects,
    });
    if (saved) {
      setDraft(buildEditableLevel(saved));
    }
    return saved;
  };

  const openPlay = () => {
    requestGameFullscreen();
    setActiveTab("play");
  };

  const openEditor = () => {
    requestGameFullscreen();
    setActiveTab("editor");
  };

  const createNewMap = async () => {
    const saved = await saveCustomLevel({
      name: "New Map",
      mapModelUrl: DEFAULT_MAP_URL,
      playerCharacter: null,
      playerSpawn: [0, PLAYER_SPAWN_OFFSET, 0],
      robotSpawn: [0, 0, 0],
      robotStory: "",
      storyGraph: EMPTY_STORY_GRAPH,
      placedObjects: [],
      zombieSpawns: [],
    });
    if (saved) {
      setActiveLevel(saved.id);
      openEditor();
    }
  };

  const showStoryTab = !!draft;

  return (
    <div className={`game-container${activeTab === "play" ? " game-container-play" : ""}${activeTab === "editor" ? " game-container-editor" : ""}${activeTab === "story" ? " game-container-story" : ""}`}>
      <nav className="game-workbench-nav">
        {[
          ["play", "Play Game"],
          ["maps", "All Games"],
          ["editor", "Map Editor"],
          ...(showStoryTab ? [["story", "Story Graph"]] : []),
        ].map(([id, label]) => (
          <button
            className={activeTab === id ? "active" : ""}
            key={id}
            onClick={() => {
              if (id === "play") {
                openPlay();
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

      {activeTab === "play" && (
        <>
          <GameCanvas />
          <HUD />
          <DialogueSystem />
        </>
      )}
      {activeTab === "maps" && <MapsPanel onNewMap={() => { void createNewMap(); }} onPlay={openPlay} />}
      {activeTab === "editor" && draft && (
        <LevelEditorPanel
          onPlay={openPlay}
          draft={draft}
          setDraft={setDraft as any}
          assetLibrary={assetLibrary}
          setAssetLibrary={setAssetLibrary}
          saveLevel={saveLevel}
        />
      )}
      {activeTab === "story" && draft && (
        <div style={{ height: "calc(100vh - 50px)" }}>
          <StoryGraphPanel
            assetLibrary={assetLibrary}
            graph={draft.storyGraph}
            onChange={(storyGraph) => setDraft((current) => current ? ({ ...current, storyGraph }) : null)}
            onSave={saveLevel}
          />
        </div>
      )}
    </div>
  );
}
