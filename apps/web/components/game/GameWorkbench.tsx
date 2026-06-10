"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { DialogueSystem } from "./DialogueSystem";
import { GameCanvas } from "./GameCanvas";
import { HUD } from "./HUD";
import { useGameStore, type EnemyType, type GameLevel, type PlacedObject, type ZombieSpawn } from "@/store/gameStore";

type WorkbenchTab = "play" | "maps" | "editor" | "assets";
type PlacementTool = "player" | "npc" | "zombie_low" | "zombie_fantasy" | "object";
type EditableLevelDraft = ReturnType<typeof buildEditableLevel>;
type AssetLibraryItem = { id: string; name: string; fileUrl: string; category: string };

const DEFAULT_MAP_URL = "/uploads/models/d9d70e25-4e3b-4d34-97be-c56ec50e8a26/delivery.glb";

function formatVector(position: [number, number, number]) {
  return position.map((value) => Number(value.toFixed(2))).join(", ");
}

function parseVector(value: string): [number, number, number] | null {
  const parts = value.split(",").map((entry) => Number(entry.trim()));
  if (parts.length !== 3 || parts.some((entry) => !Number.isFinite(entry))) return null;
  return [parts[0], parts[1], parts[2]];
}

function buildEditableLevel(source?: GameLevel) {
  return {
    id: source?.id,
    name: source?.name ?? "Custom Sector",
    mapModelUrl: source?.mapModelUrl ?? DEFAULT_MAP_URL,
    playerSpawn: formatVector(source?.playerSpawn ?? [0, 1.5, 5]),
    robotSpawn: formatVector(source?.robotSpawn ?? [-9, 1.2, 12]),
    robotStory: source?.robotStory ?? "I trade equipment for score and track the threat count in this sector.",
    placedObjects: source?.placedObjects ?? [],
    zombieSpawns: source?.zombieSpawns ?? [
      { id: "z1", type: "zombie_low", position: [8, 1.2, -14] },
      { id: "z2", type: "zombie_low", position: [-8, 1.2, -18] },
      { id: "z3", type: "zombie_fantasy", position: [0, 1.2, -28] },
    ],
  };
}

function nextId(prefix: string, existingIds: string[]) {
  let index = existingIds.length + 1;
  while (existingIds.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function MarkerLabel({ children }: { children: string }) {
  return (
    <Html center distanceFactor={12} position={[0, 1.55, 0]}>
      <span className="builder-marker-label">{children}</span>
    </Html>
  );
}

function PlayerMarker({
  onCommit,
  onSelect,
  position,
  selected,
}: {
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  position: [number, number, number];
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, 1.5, group.position.z]);
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
        <mesh castShadow>
          <capsuleGeometry args={[0.38, 1.1, 8, 16]} />
          <meshStandardMaterial color="#00ffc4" emissive={selected ? "#00ffc4" : "#00382f"} roughness={0.45} />
        </mesh>
        <MarkerLabel>PLAYER</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls object={groupRef.current} mode="translate" onMouseUp={commitTransform} />
      ) : null}
    </>
  );
}

function NpcMarker({
  onCommit,
  onSelect,
  position,
  selected,
}: {
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  position: [number, number, number];
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, 1.2, group.position.z]);
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
        <mesh castShadow>
          <cylinderGeometry args={[0.42, 0.42, 1.35, 18]} />
          <meshStandardMaterial color="#ffd166" emissive={selected ? "#ffd166" : "#332400"} roughness={0.48} />
        </mesh>
        <MarkerLabel>NPC</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls object={groupRef.current} mode="translate" onMouseUp={commitTransform} />
      ) : null}
    </>
  );
}

function ZombieMarker({
  onCommit,
  onSelect,
  position,
  selected,
  spawn,
}: {
  onCommit: (position: [number, number, number]) => void;
  onSelect: () => void;
  position: [number, number, number];
  selected: boolean;
  spawn: ZombieSpawn;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const color = spawn.type === "zombie_fantasy" ? "#ff4fd8" : "#ff5a3c";
  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    onCommit([group.position.x, 1.2, group.position.z]);
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
        <mesh castShadow>
          <boxGeometry args={[0.9, 1.45, 0.65]} />
          <meshStandardMaterial color={color} emissive={selected ? color : "#220000"} roughness={0.5} />
        </mesh>
        <MarkerLabel>{spawn.id}</MarkerLabel>
      </group>
      {selected && groupRef.current ? (
        <TransformControls object={groupRef.current} mode="translate" onMouseUp={commitTransform} />
      ) : null}
    </>
  );
}

function PlacedObjectMarker({
  object,
  onCommit,
  onSelect,
  selected,
}: {
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
          <ModelLoader groundToY={0} src={object.fileUrl} />
        </Suspense>
        {selected ? (
          <mesh>
            <boxGeometry args={[1.9, 1.9, 1.9]} />
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
  const [selectedCoreId, setSelectedCoreId] = useState<"player" | "npc" | "">("");
  const [selectedObjectId, setSelectedObjectId] = useState<string>("");
  const [selectedZombieId, setSelectedZombieId] = useState<string>("");
  const terrainObjectRef = useRef<THREE.Object3D | null>(null);
  const terrainRaycasterRef = useRef(new THREE.Raycaster());
  const lastTerrainSnapKeyRef = useRef("");
  const playerSpawn = parseVector(draft.playerSpawn) ?? [0, 1.5, 5];
  const robotSpawn = parseVector(draft.robotSpawn) ?? [-9, 1.2, 12];
  const selectedAsset = assetLibrary.find((asset) => asset.id === selectedAssetId);

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
      .filter((hit) => !hit.object.userData.ignoreBuilderRaycast);
    return hits[0]?.point.y ?? fallbackY;
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
    setSelectedZombieId("");

    if (placementTool === "player") {
      setDraft((current) => ({ ...current, playerSpawn: formatVector([x, terrainY + 1.5, z]) }));
      return;
    }
    if (placementTool === "npc") {
      setDraft((current) => ({ ...current, robotSpawn: formatVector([x, terrainY + 1.2, z]) }));
      return;
    }
    if (placementTool === "zombie_low" || placementTool === "zombie_fantasy") {
      setDraft((current) => ({
        ...current,
        zombieSpawns: [
          ...current.zombieSpawns,
          {
            id: nextId("z", current.zombieSpawns.map((spawn) => spawn.id)),
            type: placementTool,
            position: [x, terrainY + 1.2, z],
          },
        ],
      }));
      return;
    }
    if (placementTool === "object" && selectedAsset) {
      const id = nextId("obj", draft.placedObjects.map((object) => object.id));
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
              scale: [1, 1, 1],
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

  const snapDraftToTerrain = () => {
    if (!terrainObjectRef.current) return;
    setDraft((current) => {
      const currentPlayerSpawn = parseVector(current.playerSpawn) ?? [0, 1.5, 5];
      const currentRobotSpawn = parseVector(current.robotSpawn) ?? [-9, 1.2, 12];
      return {
        ...current,
        playerSpawn: formatVector(entityPosition(currentPlayerSpawn[0], currentPlayerSpawn[2], 1.5, currentPlayerSpawn[1] - 1.5)),
        robotSpawn: formatVector(entityPosition(currentRobotSpawn[0], currentRobotSpawn[2], 1.2, currentRobotSpawn[1] - 1.2)),
        zombieSpawns: current.zombieSpawns.map((spawn) => ({
          ...spawn,
          position: entityPosition(spawn.position[0], spawn.position[2], 1.2, spawn.position[1] - 1.2),
        })),
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
        <span>PLACE TOOL</span>
        {[
          ["player", "Player"],
          ["npc", "NPC"],
          ["zombie_low", "Low Zombie"],
          ["zombie_fantasy", "Fantasy Zombie"],
          ["object", "Uploaded Model"],
        ].map(([id, label]) => (
          <button
            className={placementTool === id ? "active" : ""}
            key={id}
            onClick={() => setPlacementTool(id as PlacementTool)}
            type="button"
          >
            {label}
          </button>
        ))}
        <label>
          Model
          <select
            disabled={assetLibrary.length === 0}
            value={selectedAssetId}
            onChange={(event) => setSelectedAssetId(event.target.value)}
          >
            {assetLibrary.length === 0 ? <option value="">No uploaded models</option> : null}
            {assetLibrary.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <div className="builder-viewport">
        <div className="builder-viewport-meta">
          <strong>{placementTool === "object" ? selectedAsset?.name ?? "Select a model" : "Click ground to place"}</strong>
          <span>Orbit with mouse, click the floor, then drag selected uploaded models with the gizmo.</span>
        </div>
        <Canvas camera={{ position: [16, 14, 20], fov: 48 }} shadows>
          <color attach="background" args={["#070b16"]} />
          <ambientLight intensity={0.65} />
          <directionalLight castShadow intensity={1.8} position={[8, 16, 10]} />
          <Grid args={[80, 80]} cellColor="#203047" sectionColor="#00ffc4" position={[0, 0.02, 0]} />
          <Suspense fallback={null}>
            {draft.mapModelUrl ? (
              <group position={[0, 0, 0]} scale={[1, 1, 1]}>
                <ModelLoader
                  groundToY={0}
                  onMeshClick={handleTerrainClick}
                  onSceneReady={(scene) => {
                    terrainObjectRef.current = scene;
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
            <meshStandardMaterial color="#0b1224" transparent opacity={0.18} side={THREE.DoubleSide} />
          </mesh>
          <PlayerMarker
            onCommit={(position) => {
              const snapped = entityPosition(position[0], position[2], 1.5, position[1] - 1.5);
              setDraft((current) => ({ ...current, playerSpawn: formatVector(snapped) }));
            }}
            onSelect={() => {
              setSelectedCoreId("player");
              setSelectedObjectId("");
              setSelectedZombieId("");
            }}
            position={playerSpawn}
            selected={selectedCoreId === "player"}
          />
          <NpcMarker
            onCommit={(position) => {
              const snapped = entityPosition(position[0], position[2], 1.2, position[1] - 1.2);
              setDraft((current) => ({ ...current, robotSpawn: formatVector(snapped) }));
            }}
            onSelect={() => {
              setSelectedCoreId("npc");
              setSelectedObjectId("");
              setSelectedZombieId("");
            }}
            position={robotSpawn}
            selected={selectedCoreId === "npc"}
          />
          {draft.zombieSpawns.map((spawn, index) => (
            <ZombieMarker
              key={spawn.id}
              onCommit={(position) => {
                const snapped = entityPosition(position[0], position[2], 1.2, position[1] - 1.2);
                setDraft((current) => ({
                  ...current,
                  zombieSpawns: current.zombieSpawns.map((entry, spawnIndex) =>
                    spawnIndex === index ? { ...entry, position: snapped } : entry
                  ),
                }));
              }}
              onSelect={() => {
                setSelectedCoreId("");
                setSelectedZombieId(spawn.id);
                setSelectedObjectId("");
              }}
              position={spawn.position}
              selected={selectedZombieId === spawn.id}
              spawn={spawn}
            />
          ))}
          {draft.placedObjects.map((object) => (
            <PlacedObjectMarker
              key={object.id}
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
                setSelectedZombieId("");
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

function MapsPanel({ onPlay }: { onPlay: () => void }) {
  const activeLevel = useGameStore((state) => state.activeLevel);
  const savedLevels = useGameStore((state) => state.savedLevels);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const deleteCustomLevel = useGameStore((state) => state.deleteCustomLevel);
  const defaultLevel = useMemo<GameLevel>(() => ({
    id: "default-sector",
    name: "Default Sector",
    mapModelUrl: DEFAULT_MAP_URL,
    playerSpawn: [0, 1.5, 5],
    robotSpawn: [-9, 1.2, 12],
    robotStory: "Default combat benchmark with 12 zombies and NPC gear shop.",
    placedObjects: [],
    zombieSpawns: Array.from({ length: 12 }, (_, index) => ({
      id: `e${index + 1}`,
      type: index === 2 || index === 3 || index === 8 || index === 9 ? "zombie_fantasy" : "zombie_low",
      position: [0, 1.2, -16 - index * 4] as [number, number, number],
    })),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }), []);
  const levels = useMemo(() => [defaultLevel, ...savedLevels], [defaultLevel, savedLevels]);
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
      </div>
      <div className="level-grid">
        {uniqueLevels.map((level) => (
          <article className={`level-card${level.id === activeLevel.id ? " active" : ""}`} key={level.id}>
            <h3>{level.name}</h3>
            <p>{level.robotStory}</p>
            <div className="level-meta">
              <span>{level.zombieSpawns.length} zombies</span>
              <span>Player {formatVector(level.playerSpawn)}</span>
              <span>NPC {formatVector(level.robotSpawn)}</span>
            </div>
            <div className="level-actions">
              <button type="button" onClick={() => { setActiveLevel(level.id); onPlay(); }}>
                Play
              </button>
              {level.id !== "default-sector" && (
                <button className="danger" type="button" onClick={() => deleteCustomLevel(level.id)}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LevelEditorPanel({ onPlay }: { onPlay: () => void }) {
  const activeLevel = useGameStore((state) => state.activeLevel);
  const saveCustomLevel = useGameStore((state) => state.saveCustomLevel);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const [draft, setDraft] = useState(() => buildEditableLevel(activeLevel));
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryItem[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");

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

  useEffect(() => {
    setDraft(buildEditableLevel(activeLevel));
  }, [activeLevel]);

  const updateSpawn = (index: number, updates: Partial<ZombieSpawn>) => {
    setDraft((current) => ({
      ...current,
      zombieSpawns: current.zombieSpawns.map((spawn, spawnIndex) =>
        spawnIndex === index ? { ...spawn, ...updates } : spawn
      ),
    }));
  };

  const updatePlacedObject = (index: number, updates: Partial<PlacedObject>) => {
    setDraft((current) => ({
      ...current,
      placedObjects: current.placedObjects.map((object, objectIndex) =>
        objectIndex === index ? { ...object, ...updates } : object
      ),
    }));
  };

  const saveLevel = async () => {
    const playerSpawn = parseVector(draft.playerSpawn);
    const robotSpawn = parseVector(draft.robotSpawn);
    if (!playerSpawn || !robotSpawn) return null;

    const levelId = draft.id === "default-sector" ? undefined : draft.id;
    const saved = await saveCustomLevel({
      id: levelId,
      name: draft.name.trim() || "Custom Sector",
      mapModelUrl: draft.mapModelUrl.trim() || DEFAULT_MAP_URL,
      playerSpawn,
      robotSpawn,
      robotStory: draft.robotStory.trim(),
      zombieSpawns: draft.zombieSpawns,
      placedObjects: draft.placedObjects,
    });
    if (saved) {
      setDraft(buildEditableLevel(saved));
    }
    return saved;
  };

  return (
    <section className="workbench-panel editor-panel">
      <div className="workbench-panel-header">
        <div>
          <span>LEVEL BUILDER</span>
          <h2>Spawn, Story & Action Preview</h2>
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

      <div className="editor-form-grid">
        <label>
          Level name
          <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          Map GLB URL
          <input value={draft.mapModelUrl} onChange={(event) => setDraft((current) => ({ ...current, mapModelUrl: event.target.value }))} />
        </label>
        <label>
          Player spawn
          <input value={draft.playerSpawn} onChange={(event) => setDraft((current) => ({ ...current, playerSpawn: event.target.value }))} />
        </label>
        <label>
          Robot NPC spawn
          <input value={draft.robotSpawn} onChange={(event) => setDraft((current) => ({ ...current, robotSpawn: event.target.value }))} />
        </label>
        <label className="wide">
          NPC story / shop briefing
          <textarea value={draft.robotStory} onChange={(event) => setDraft((current) => ({ ...current, robotStory: event.target.value }))} />
        </label>
      </div>

      <div className="spawn-editor">
        <div className="spawn-editor-header">
          <h3>Placed Objects</h3>
          <select
            defaultValue=""
            onChange={(event) => {
              const asset = assetLibrary.find((entry) => entry.id === event.target.value);
              if (!asset) return;
              setDraft((current) => ({
                ...current,
                placedObjects: [
                  ...current.placedObjects,
                  {
                    id: `obj${current.placedObjects.length + 1}`,
                    modelId: asset.id,
                    name: asset.name,
                    fileUrl: asset.fileUrl,
                    position: [0, 0, -8 - current.placedObjects.length * 3],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                  },
                ],
              }));
              event.currentTarget.value = "";
            }}
          >
            <option value="">Add uploaded model</option>
            {assetLibrary.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.category})
              </option>
            ))}
          </select>
        </div>
        <div className="spawn-list">
          {draft.placedObjects.map((object, index) => (
            <div className="spawn-row object-row" key={`${object.id}-${index}`}>
              <input value={object.name} onChange={(event) => updatePlacedObject(index, { name: event.target.value })} />
              <input
                value={formatVector(object.position)}
                onChange={(event) => {
                  const parsed = parseVector(event.target.value);
                  if (parsed) updatePlacedObject(index, { position: parsed });
                }}
              />
              <input
                value={formatVector(object.scale)}
                onChange={(event) => {
                  const parsed = parseVector(event.target.value);
                  if (parsed) updatePlacedObject(index, { scale: parsed });
                }}
              />
              <button
                className="danger"
                type="button"
                onClick={() => setDraft((current) => ({
                  ...current,
                  placedObjects: current.placedObjects.filter((_, objectIndex) => objectIndex !== index),
                }))}
              >
                Remove
              </button>
            </div>
          ))}
          {draft.placedObjects.length === 0 ? (
            <p className="builder-empty-note">No objects placed yet. Add uploaded models to compose this map.</p>
          ) : null}
        </div>
      </div>

      <div className="spawn-editor">
        <div className="spawn-editor-header">
          <h3>Zombie Spawns</h3>
          <button
            type="button"
            onClick={() => setDraft((current) => ({
              ...current,
              zombieSpawns: [
                ...current.zombieSpawns,
                { id: `z${current.zombieSpawns.length + 1}`, type: "zombie_low", position: [0, 1.2, -20 - current.zombieSpawns.length * 4] },
              ],
            }))}
          >
            Add Zombie
          </button>
        </div>
        <div className="spawn-list">
          {draft.zombieSpawns.map((spawn, index) => (
            <div className="spawn-row" key={`${spawn.id}-${index}`}>
              <input value={spawn.id} onChange={(event) => updateSpawn(index, { id: event.target.value })} />
              <select value={spawn.type} onChange={(event) => updateSpawn(index, { type: event.target.value as EnemyType })}>
                <option value="zombie_low">Low Zombie</option>
                <option value="zombie_fantasy">Fantasy Zombie</option>
              </select>
              <input
                value={formatVector(spawn.position)}
                onChange={(event) => {
                  const parsed = parseVector(event.target.value);
                  if (parsed) updateSpawn(index, { position: parsed });
                }}
              />
              <button
                className="danger"
                type="button"
                onClick={() => setDraft((current) => ({
                  ...current,
                  zombieSpawns: current.zombieSpawns.filter((_, spawnIndex) => spawnIndex !== index),
                }))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
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
  const loadSavedLevels = useGameStore((state) => state.loadSavedLevels);

  useEffect(() => {
    loadSavedLevels();
  }, [loadSavedLevels]);

  const openPlay = () => {
    requestGameFullscreen();
    setActiveTab("play");
  };

  return (
    <div className={`game-container${activeTab === "play" ? " game-container-play" : ""}`}>
      <nav className="game-workbench-nav">
        {[
          ["play", "Play Game"],
          ["maps", "All Games"],
          ["editor", "Map Editor"],
          ["assets", "Asset Manager"],
        ].map(([id, label]) => (
          <button
            className={activeTab === id ? "active" : ""}
            key={id}
            onClick={() => {
              if (id === "play") {
                openPlay();
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
      {activeTab === "maps" && <MapsPanel onPlay={openPlay} />}
      {activeTab === "editor" && <LevelEditorPanel onPlay={openPlay} />}
      {activeTab === "assets" && <AssetManagerPanel />}
    </div>
  );
}
