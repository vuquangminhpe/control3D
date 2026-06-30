export type ModelCategory =
  | "architecture"
  | "character"
  | "vehicle"
  | "environment"
  | "prop"
  | "furniture"
  | "electronics"
  | "other";

export type ModelLicense = "CC0" | "CC_BY" | "MIT" | "proprietary";
export type ModelFormat = "glb" | "gltf" | "obj" | "fbx" | "stl" | "ply" | "usdz";

export type ElementTypeRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  schema: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ModelRecord = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  category: ModelCategory;
  elementTypeId: string | null;
  license: ModelLicense;
  originalFilename: string;
  format: ModelFormat;
  fileUrl: string;
  thumbnailUrl: string | null;
  fileSize: number;
  polygonCount: number | null;
  vertexCount: number | null;
  materialCount: number | null;
  hasAnimations: boolean;
  hasTextures: boolean;
  customProps: Record<string, unknown> | null;
  boundingBox: Record<string, unknown> | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  downloadCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ModelVersionRecord = {
  id: string;
  modelId: string;
  versionNumber: number;
  fileUrl: string;
  changeNote: string | null;
  createdAt: string;
};

export type AnimationSourceKind = "single" | "pack";
export type AnimationFormat = "fbx" | "zip";

export type AnimationActionRecord = {
  id: string;
  name: string;
  sourcePath: string;
};

export type AnimationAssetRecord = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  sourceKind: AnimationSourceKind;
  originalFilename: string;
  format: AnimationFormat;
  fileUrl: string;
  fileSize: number;
  actionCount: number;
  actions: AnimationActionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type CharacterActionTrigger =
  | "none"
  | "attack"
  | "talk"
  | "move"
  | "custom"
  | "crouch"
  | "jump"
  | "idle";

export type CharacterActionLinkRecord = {
  id: string;
  animationAssetId: string;
  actionId: string;
  name: string;
  fileUrl: string;
  sourceFilename: string;
  sourceFormat: AnimationFormat;
  sourcePath: string;
  enabled: boolean;
  trigger: CharacterActionTrigger;
  keyBinding: string | null;
  durationMs: number | null;
  dialogueText: string | null;
  targetModelId: string | null;
};

export type CharacterAnimationManifest = {
  version: 1;
  mode: "external_actions";
  actions: CharacterActionLinkRecord[];
  updatedAt: string;
};

export type EnemyType = "zombie_low" | "zombie_fantasy";

export type ZombieSpawnRecord = {
  id: string;
  type: EnemyType;
  position: [number, number, number];
};

export type StoryNodeKind =
  | "start"
  | "character"
  | "dialogue"
  | "choice"
  | "event"
  | "shop"
  | "condition"
  | "set_variable"
  | "random"
  | "delay"
  | "comment"
  | "bark"
  | "animation";

export type StoryNodeRecord = {
  id: string;
  kind: StoryNodeKind;
  title: string;
  text: string;
  modelId?: string | null;
  modelName?: string | null;
  fileUrl?: string | null;
  mapCharacterId?: string | null;
  characterId?: string | null;
  displayLabel?: string | null;
  previewPosition?: [number, number, number] | null;
  action?: string | null;
  characterActionId?: string | null;
  characterActionName?: string | null;
  condition?: string | null;
  currencyChange?: number | null;
  position: { x: number; y: number };
};

export type StoryEdgeRecord = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  condition?: string | null;
};

export type StoryGraphRecord = {
  nodes: StoryNodeRecord[];
  edges: StoryEdgeRecord[];
};

export type LevelStatus = "draft" | "published" | "archived";
export type MapCharacterRole = "playable" | "npc" | "story_actor" | "boss";

export type MapCharacterRecord = {
  id: string;
  characterId: string;
  modelId: string;
  name: string;
  fileUrl: string;
  format?: string;
  role: MapCharacterRole;
  displayLabel: string | null;
  isDefault: boolean;
  pointPrice: number;
  spawnPosition: [number, number, number] | null;
  previewPosition: [number, number, number] | null;
  storyEnabled: boolean;
  sortOrder: number;
};

export type MapCharacterInput = {
  id?: string;
  characterId: string;
  modelId: string;
  name: string;
  fileUrl: string;
  format?: string;
  role?: MapCharacterRole;
  displayLabel?: string | null;
  isDefault?: boolean;
  pointPrice?: number;
  spawnPosition?: [number, number, number] | null;
  previewPosition?: [number, number, number] | null;
  storyEnabled?: boolean;
  sortOrder?: number;
};

export type GameCharacterRecord = {
  id: string;
  name: string;
  description: string | null;
  modelId: string | null;
  fileUrl: string;
  format: string | null;
  animationManifest: unknown | null;
  baseStats: unknown | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LevelRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: LevelStatus;
  mapModelUrl: string;
  playerCharacter: {
    modelId: string;
    name: string;
    fileUrl: string;
    format?: string;
  } | null;
  playerSpawn: [number, number, number];
  robotSpawn: [number, number, number];
  robotStory: string;
  storyGraph: StoryGraphRecord;
  zombieSpawns: ZombieSpawnRecord[];
  mapCharacters: MapCharacterRecord[];
  placedObjects: Array<{
    id: string;
    modelId: string;
    name: string;
    fileUrl: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    isMap?: boolean;
  }>;
  maxPlayers: number;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

function javaApiBaseUrl() {
  return process.env.CONTROL3D_JAVA_API_BASE_URL ?? "http://localhost:8778";
}

async function getApi<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${javaApiBaseUrl()}${path}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | T | null;
    if (!response.ok || !payload) return fallback;
    if (typeof payload === "object" && "success" in payload) {
      return payload.success && "data" in payload ? (payload.data as T) : fallback;
    }
    return payload as T;
  } catch {
    return fallback;
  }
}

export async function listModels(filters?: {
  category?: string | null;
  q?: string | null;
  sort?: "newest" | "name" | "downloads";
}) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.sort) params.set("sort", filters.sort);
  const query = params.toString();
  return getApi<ModelRecord[]>(`/api/models${query ? `?${query}` : ""}`, []);
}

export async function getModelById(id: string) {
  return getApi<ModelRecord | null>(`/api/models/${encodeURIComponent(id)}`, null);
}

export async function incrementModelView(id: string) {
  return getModelById(id);
}

export async function getElementTypes() {
  return getApi<ElementTypeRecord[]>("/api/element-types", []);
}

export async function getVersionsForModel(modelId: string) {
  return getApi<ModelVersionRecord[]>(`/api/models/${encodeURIComponent(modelId)}/version`, []);
}
