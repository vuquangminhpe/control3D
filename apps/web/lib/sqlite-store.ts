import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
import { persistUploadWithDelivery } from "@/lib/model-optimization";
import { inferInitialRiggingMetadata } from "@/lib/model-rigging";

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
export type ModelFormat =
  | "glb"
  | "gltf"
  | "obj"
  | "fbx"
  | "stl"
  | "ply"
  | "usdz";

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
  | "jump";

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

export type LevelRecord = {
  id: string;
  name: string;
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
  placedObjects: Array<{
    id: string;
    modelId: string;
    name: string;
    fileUrl: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }>;
  createdAt: string;
  updatedAt: string;
};

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, "app"))
  ? cwd
  : path.join(cwd, "apps", "web");
const dataDir = path.join(appRoot, "data");
const publicUploadsDir = path.join(appRoot, "public", "uploads", "models");
const publicAnimationsDir = path.join(appRoot, "public", "uploads", "animations");
const dbPath = path.join(dataDir, "control3d.sqlite");

const EMPTY_STORY_GRAPH: StoryGraphRecord = {
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
};

type GlobalSqliteState = {
  control3dDb?: DatabaseSync;
  control3dDbInitialized?: boolean;
};

const globalSqliteState = globalThis as typeof globalThis & GlobalSqliteState;

mkdirSync(dataDir, { recursive: true });
mkdirSync(publicUploadsDir, { recursive: true });
mkdirSync(publicAnimationsDir, { recursive: true });

const seedElementTypes: Array<
  Omit<ElementTypeRecord, "createdAt" | "updatedAt">
> = [
  {
    id: "element-structural",
    key: "structural",
    name: "Structural",
    description: "Walls, floors, ceilings, frames",
    icon: null,
    color: "#8b7d6b",
    sortOrder: 1,
    isActive: true,
    schema: null,
  },
  {
    id: "element-display",
    key: "display",
    name: "Display",
    description: "Screens, panels, media surfaces",
    icon: null,
    color: "#3b82f6",
    sortOrder: 2,
    isActive: true,
    schema: null,
  },
  {
    id: "element-signage",
    key: "signage",
    name: "Signage",
    description: "Headers, wayfinding, logos",
    icon: null,
    color: "#059669",
    sortOrder: 3,
    isActive: true,
    schema: null,
  },
];

function initializeDb(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS element_types (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      schema_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tags_json TEXT NOT NULL,
      category TEXT NOT NULL,
      element_type_id TEXT,
      license TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      format TEXT NOT NULL,
      file_url TEXT NOT NULL,
      thumbnail_url TEXT,
      file_size INTEGER NOT NULL,
      polygon_count INTEGER,
      vertex_count INTEGER,
      material_count INTEGER,
      has_animations INTEGER NOT NULL DEFAULT 0,
      has_textures INTEGER NOT NULL DEFAULT 0,
      custom_props_json TEXT,
      bounding_box_json TEXT,
      position_json TEXT NOT NULL,
      rotation_json TEXT NOT NULL,
      scale_json TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (element_type_id) REFERENCES element_types(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      change_note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS animation_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tags_json TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      format TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      action_count INTEGER NOT NULL DEFAULT 1,
      actions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      map_model_url TEXT NOT NULL,
      player_character_json TEXT,
      player_spawn_json TEXT NOT NULL,
      robot_spawn_json TEXT NOT NULL,
      robot_story TEXT NOT NULL,
      story_graph_json TEXT NOT NULL DEFAULT '{"nodes":[{"id":"story-start","kind":"start","title":"Start","text":"Story begins here.","position":{"x":96,"y":160}}],"edges":[]}',
      zombie_spawns_json TEXT NOT NULL,
      placed_objects_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    database.exec("ALTER TABLE levels ADD COLUMN placed_objects_json TEXT NOT NULL DEFAULT '[]';");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN player_character_json TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec(`ALTER TABLE levels ADD COLUMN story_graph_json TEXT NOT NULL DEFAULT '{"nodes":[{"id":"story-start","kind":"start","title":"Start","text":"Story begins here.","position":{"x":96,"y":160}}],"edges":[]}';`);
  } catch {
    // Column already exists.
  }

  const insertSeed = database.prepare(`
    INSERT OR IGNORE INTO element_types (
      id, key, name, description, icon, color, sort_order, is_active, schema_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const row of seedElementTypes) {
    insertSeed.run(
      row.id,
      row.key,
      row.name,
      row.description,
      row.icon,
      row.color,
      row.sortOrder,
      row.isActive ? 1 : 0,
      row.schema ? JSON.stringify(row.schema) : null,
      now,
      now,
    );
  }
}

function getDb() {
  if (!globalSqliteState.control3dDb) {
    globalSqliteState.control3dDb = new DatabaseSync(dbPath);
  }

  if (!globalSqliteState.control3dDbInitialized) {
    initializeDb(globalSqliteState.control3dDb);
    globalSqliteState.control3dDbInitialized = true;
  }

  return globalSqliteState.control3dDb;
}

const db = getDb();

function parseJson<T>(input: string | null, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function mapElementType(row: Record<string, unknown>): ElementTypeRecord {
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    icon: row.icon ? String(row.icon) : null,
    color: row.color ? String(row.color) : null,
    sortOrder: Number(row.sort_order),
    isActive: Number(row.is_active) === 1,
    schema: parseJson(row.schema_json as string | null, null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapModel(row: Record<string, unknown>): ModelRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    tags: parseJson(row.tags_json as string | null, []),
    category: String(row.category) as ModelCategory,
    elementTypeId: row.element_type_id ? String(row.element_type_id) : null,
    license: String(row.license) as ModelLicense,
    originalFilename: String(row.original_filename),
    format: String(row.format) as ModelFormat,
    fileUrl: String(row.file_url),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    fileSize: Number(row.file_size),
    polygonCount: row.polygon_count === null ? null : Number(row.polygon_count),
    vertexCount: row.vertex_count === null ? null : Number(row.vertex_count),
    materialCount:
      row.material_count === null ? null : Number(row.material_count),
    hasAnimations: Number(row.has_animations) === 1,
    hasTextures: Number(row.has_textures) === 1,
    customProps: parseJson(row.custom_props_json as string | null, null),
    boundingBox: parseJson(row.bounding_box_json as string | null, null),
    position: parseJson(row.position_json as string | null, [0, 0, 0]),
    rotation: parseJson(row.rotation_json as string | null, [0, 0, 0]),
    scale: parseJson(row.scale_json as string | null, [1, 1, 1]),
    downloadCount: Number(row.download_count),
    viewCount: Number(row.view_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapVersion(row: Record<string, unknown>): ModelVersionRecord {
  return {
    id: String(row.id),
    modelId: String(row.model_id),
    versionNumber: Number(row.version_number),
    fileUrl: String(row.file_url),
    changeNote: row.change_note ? String(row.change_note) : null,
    createdAt: String(row.created_at),
  };
}

function mapAnimationAsset(row: Record<string, unknown>): AnimationAssetRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    tags: parseJson(row.tags_json as string | null, []),
    sourceKind: String(row.source_kind) as AnimationSourceKind,
    originalFilename: String(row.original_filename),
    format: String(row.format) as AnimationFormat,
    fileUrl: String(row.file_url),
    fileSize: Number(row.file_size),
    actionCount: Number(row.action_count),
    actions: parseJson(row.actions_json as string | null, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLevel(row: Record<string, unknown>): LevelRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    mapModelUrl: String(row.map_model_url),
    playerCharacter: parseJson(row.player_character_json as string | null, null),
    playerSpawn: parseJson(row.player_spawn_json as string | null, [0, 1.5, 5]),
    robotSpawn: parseJson(row.robot_spawn_json as string | null, [-9, 1.2, 12]),
    robotStory: String(row.robot_story ?? ""),
    storyGraph: parseJson(row.story_graph_json as string | null, EMPTY_STORY_GRAPH),
    zombieSpawns: parseJson(row.zombie_spawns_json as string | null, []),
    placedObjects: parseJson(row.placed_objects_json as string | null, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeTags(input: string | string[] | undefined) {
  if (!input) return [];
  const source = Array.isArray(input) ? input.join(",") : input;
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseVector(
  input: string | undefined,
  fallback: [number, number, number],
) {
  if (!input) return fallback;
  const values = input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length === 3
    ? ([values[0], values[1], values[2]] as [number, number, number])
    : fallback;
}

export function getFormatFromFilename(filename: string): ModelFormat | null {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  const allowed = ["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"] as const;
  return allowed.includes(ext as ModelFormat) ? (ext as ModelFormat) : null;
}

export function getAnimationFormatFromFilename(filename: string): AnimationFormat | null {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return ext === "fbx" || ext === "zip" ? ext : null;
}

function cleanAnimationName(input: string) {
  return path
    .basename(input, path.extname(input))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listFbxEntriesFromZip(buffer: Buffer) {
  return listZipEntriesFromZip(buffer).filter((filename) => filename.toLowerCase().endsWith(".fbx"));
}

function listZipEntriesFromZip(buffer: Buffer) {
  const entries: string[] = [];
  let offset = 0;

  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) break;

    const filename = buffer.toString("utf8", fileNameStart, fileNameEnd);
    if (filename && !filename.endsWith("/")) {
      entries.push(filename);
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

export function listBundleEntriesFromZip(buffer: Buffer) {
  return listZipEntriesFromZip(buffer).filter((filename) => {
    return Boolean(getFormatFromFilename(filename) || getAnimationFormatFromFilename(filename));
  });
}

function findZipEntry(buffer: Buffer, entryName: string) {
  let offset = 0;

  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) break;

    const filename = buffer.toString("utf8", fileNameStart, fileNameEnd);
    if (filename === entryName) {
      return {
        compressedSize,
        compressionMethod,
        localHeaderOffset,
      };
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return null;
}

function extractZipEntry(buffer: Buffer, entryName: string) {
  const entry = findZipEntry(buffer, entryName);
  if (!entry) {
    throw new Error(`Animation action not found in ZIP: ${entryName}`);
  }
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid ZIP local file header");
  }

  const localFileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > buffer.length) {
    throw new Error("Invalid ZIP action data range");
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return Buffer.from(compressed);
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

export function extractFileFromZip(buffer: Buffer, entryName: string) {
  return extractZipEntry(buffer, entryName);
}

export async function listModels(filters?: {
  q?: string;
  category?: string;
  format?: string;
  elementTypeId?: string;
  sort?: string;
}) {
  const rows = db.prepare("SELECT * FROM models").all() as Record<
    string,
    unknown
  >[];
  let models = rows.map(mapModel);

  if (filters?.q) {
    const query = filters.q.toLowerCase();
    models = models.filter((model) => {
      return [model.name, model.description ?? "", model.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  if (filters?.category) {
    models = models.filter((model) => model.category === filters.category);
  }

  if (filters?.format) {
    models = models.filter((model) => model.format === filters.format);
  }

  if (filters?.elementTypeId) {
    models = models.filter(
      (model) => model.elementTypeId === filters.elementTypeId,
    );
  }

  switch (filters?.sort) {
    case "downloads":
      models.sort((a, b) => b.downloadCount - a.downloadCount);
      break;
    case "name":
      models.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      models.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
  }

  return models;
}

export async function listAnimationAssets(filters?: {
  q?: string;
  sort?: string;
}) {
  const rows = db.prepare("SELECT * FROM animation_assets").all() as Record<
    string,
    unknown
  >[];
  let animations = rows.map(mapAnimationAsset);

  if (filters?.q) {
    const query = filters.q.toLowerCase();
    animations = animations.filter((animation) => {
      return [
        animation.name,
        animation.description ?? "",
        animation.tags.join(" "),
        animation.actions.map((action) => action.name).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  switch (filters?.sort) {
    case "actions":
      animations.sort((a, b) => b.actionCount - a.actionCount);
      break;
    case "name":
      animations.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      animations.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
  }

  return animations;
}

export async function getAnimationAssetById(id: string) {
  const row = db.prepare("SELECT * FROM animation_assets WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAnimationAsset(row) : null;
}

export async function resolveAnimationActionFile(input: {
  actionId: string;
  animation: AnimationAssetRecord;
}) {
  const action = input.animation.actions.find((entry) => entry.id === input.actionId);
  if (!action) {
    throw new Error("Animation action not found");
  }

  const animationDir = path.join(publicAnimationsDir, input.animation.id);
  if (input.animation.format === "fbx") {
    const sourcePath = path.join(animationDir, "source.fbx");
    if (!existsSync(sourcePath)) {
      throw new Error("Animation source FBX is missing");
    }
    return {
      action,
      sourcePath,
    };
  }

  const sourceZipPath = path.join(animationDir, "source.zip");
  if (!existsSync(sourceZipPath)) {
    throw new Error("Animation ZIP source is missing");
  }

  const safeActionName = action.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const actionsDir = path.join(animationDir, "actions");
  await mkdir(actionsDir, { recursive: true });
  const extractedPath = path.join(actionsDir, `${safeActionName}.fbx`);
  if (!existsSync(extractedPath)) {
    const zipBuffer = readFileSync(sourceZipPath);
    writeFileSync(extractedPath, extractZipEntry(zipBuffer, action.sourcePath));
  }

  return {
    action,
    sourcePath: extractedPath,
  };
}

export async function getModelById(id: string) {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapModel(row) : null;
}

export async function getElementTypes() {
  const rows = db
    .prepare(
      "SELECT * FROM element_types WHERE is_active = 1 ORDER BY sort_order ASC",
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapElementType);
}

export async function getVersionsForModel(modelId: string) {
  const rows = db
    .prepare(
      "SELECT * FROM model_versions WHERE model_id = ? ORDER BY version_number DESC",
    )
    .all(modelId) as Record<string, unknown>[];
  return rows.map(mapVersion);
}

export async function getStats() {
  const row = db
    .prepare(
      "SELECT COUNT(*) as totalModels, COALESCE(SUM(download_count), 0) as totalDownloads FROM models",
    )
    .get() as {
    totalModels: number;
    totalDownloads: number;
  };

  return {
    totalModels: Number(row.totalModels ?? 0),
    totalDownloads: Number(row.totalDownloads ?? 0),
  };
}

export async function listLevels() {
  const rows = db
    .prepare("SELECT * FROM levels ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapLevel);
}

export async function getLevelById(id: string) {
  const row = db.prepare("SELECT * FROM levels WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapLevel(row) : null;
}

export async function createLevel(input: {
  id?: string;
  name: string;
  mapModelUrl: string;
  playerCharacter?: LevelRecord["playerCharacter"];
  playerSpawn: [number, number, number];
  robotSpawn: [number, number, number];
  robotStory: string;
  storyGraph?: StoryGraphRecord;
  zombieSpawns: ZombieSpawnRecord[];
  placedObjects?: LevelRecord["placedObjects"];
}) {
  const now = new Date().toISOString();
  const existing = input.id ? await getLevelById(input.id) : null;
  const level: LevelRecord = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    mapModelUrl: input.mapModelUrl.trim(),
    playerCharacter: input.playerCharacter ?? null,
    playerSpawn: input.playerSpawn,
    robotSpawn: input.robotSpawn,
    robotStory: input.robotStory.trim(),
    storyGraph: input.storyGraph ?? EMPTY_STORY_GRAPH,
    zombieSpawns: input.zombieSpawns,
    placedObjects: input.placedObjects ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO levels (
      id, name, map_model_url, player_character_json, player_spawn_json, robot_spawn_json, robot_story, story_graph_json, zombie_spawns_json, placed_objects_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      map_model_url = excluded.map_model_url,
      player_character_json = excluded.player_character_json,
      player_spawn_json = excluded.player_spawn_json,
      robot_spawn_json = excluded.robot_spawn_json,
      robot_story = excluded.robot_story,
      story_graph_json = excluded.story_graph_json,
      zombie_spawns_json = excluded.zombie_spawns_json,
      placed_objects_json = excluded.placed_objects_json,
      updated_at = excluded.updated_at
  `,
  ).run(
    level.id,
    level.name,
    level.mapModelUrl,
    level.playerCharacter ? JSON.stringify(level.playerCharacter) : null,
    JSON.stringify(level.playerSpawn),
    JSON.stringify(level.robotSpawn),
    level.robotStory,
    JSON.stringify(level.storyGraph),
    JSON.stringify(level.zombieSpawns),
    JSON.stringify(level.placedObjects),
    level.createdAt,
    level.updatedAt,
  );

  return level;
}

export async function deleteLevel(id: string) {
  const result = db.prepare("DELETE FROM levels WHERE id = ?").run(id);
  return Number(result.changes ?? 0) > 0;
}

export async function createElementType(input: {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  schema?: unknown;
}) {
  const rowCount = db
    .prepare("SELECT COUNT(*) as count FROM element_types")
    .get() as { count: number };
  const now = new Date().toISOString();
  const record: ElementTypeRecord = {
    id: randomUUID(),
    key: input.key,
    name: input.name,
    description: input.description ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: Number(rowCount.count) + 1,
    isActive: true,
    schema: input.schema ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO element_types (
      id, key, name, description, icon, color, sort_order, is_active, schema_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.key,
    record.name,
    record.description,
    record.icon,
    record.color,
    record.sortOrder,
    record.isActive ? 1 : 0,
    record.schema ? JSON.stringify(record.schema) : null,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function updateElementType(
  id: string,
  input: Partial<ElementTypeRecord>,
) {
  const current = await getElementTypeById(id);
  if (!current) return null;

  const updated: ElementTypeRecord = {
    ...current,
    ...input,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `
    UPDATE element_types
    SET key = ?, name = ?, description = ?, icon = ?, color = ?, sort_order = ?, is_active = ?, schema_json = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(
    updated.key,
    updated.name,
    updated.description,
    updated.icon,
    updated.color,
    updated.sortOrder,
    updated.isActive ? 1 : 0,
    updated.schema ? JSON.stringify(updated.schema) : null,
    updated.updatedAt,
    id,
  );

  return updated;
}

async function getElementTypeById(id: string) {
  const row = db.prepare("SELECT * FROM element_types WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapElementType(row) : null;
}

export async function createModelFromUpload(input: {
  fileName: string;
  fileBuffer: Buffer;
  name: string;
  description?: string;
  tags?: string;
  category?: string;
  elementTypeId?: string;
  license?: string;
}) {
  const format = getFormatFromFilename(input.fileName);
  if (!format) {
    throw new Error("Unsupported file format");
  }

  const id = randomUUID();
  const safeName = path.basename(input.fileName);
  const modelDir = path.join(publicUploadsDir, id);
  await mkdir(modelDir, { recursive: true });
  const storedUpload = await persistUploadWithDelivery({
    fileBuffer: input.fileBuffer,
    format,
    modelDir,
    modelId: id,
  });

  const now = new Date().toISOString();
  const category = ((input.category as ModelCategory) || "other") as ModelCategory;
  const record: ModelRecord = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    tags: normalizeTags(input.tags),
    category,
    elementTypeId: input.elementTypeId || null,
    license: ((input.license as ModelLicense) || "CC0") as ModelLicense,
    originalFilename: safeName,
    format: storedUpload.format,
    fileUrl: storedUpload.fileUrl,
    thumbnailUrl: null,
    fileSize: storedUpload.fileSize,
    polygonCount: null,
    vertexCount: null,
    materialCount: null,
    hasAnimations: false,
    hasTextures: false,
    customProps: {
      ...(storedUpload.customProps ?? {}),
      rigging: inferInitialRiggingMetadata({
        category,
        format: storedUpload.format,
        hasAnimations: false,
      }),
    },
    boundingBox: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    downloadCount: 0,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO models (
      id, name, description, tags_json, category, element_type_id, license, original_filename, format, file_url,
      thumbnail_url, file_size, polygon_count, vertex_count, material_count, has_animations, has_textures,
      custom_props_json, bounding_box_json, position_json, rotation_json, scale_json, download_count,
      view_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.name,
    record.description,
    JSON.stringify(record.tags),
    record.category,
    record.elementTypeId,
    record.license,
    record.originalFilename,
    record.format,
    record.fileUrl,
    record.thumbnailUrl,
    record.fileSize,
    record.polygonCount,
    record.vertexCount,
    record.materialCount,
    record.hasAnimations ? 1 : 0,
    record.hasTextures ? 1 : 0,
    record.customProps ? JSON.stringify(record.customProps) : null,
    record.boundingBox ? JSON.stringify(record.boundingBox) : null,
    JSON.stringify(record.position),
    JSON.stringify(record.rotation),
    JSON.stringify(record.scale),
    record.downloadCount,
    record.viewCount,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function createAnimationAssetFromUpload(input: {
  fileName: string;
  fileBuffer: Buffer;
  name?: string;
  description?: string;
  tags?: string;
}) {
  const format = getAnimationFormatFromFilename(input.fileName);
  if (!format) {
    throw new Error("Animation uploads must be FBX files or ZIP packs");
  }

  const id = randomUUID();
  const safeName = path.basename(input.fileName);
  const animationDir = path.join(publicAnimationsDir, id);
  await mkdir(animationDir, { recursive: true });

  const storedFileName = `source.${format}`;
  const fileUrl = `/uploads/animations/${id}/${storedFileName}`;
  writeFileSync(path.join(animationDir, storedFileName), input.fileBuffer);

  const zipEntries = format === "zip" ? listFbxEntriesFromZip(input.fileBuffer) : [];
  const actions = (format === "zip" ? zipEntries : [safeName]).map((entry, index) => ({
    id: `${id}-action-${index + 1}`,
    name: cleanAnimationName(entry) || `Action ${index + 1}`,
    sourcePath: entry,
  }));

  if (!actions.length) {
    throw new Error("ZIP packs must contain at least one FBX animation");
  }

  const now = new Date().toISOString();
  const record: AnimationAssetRecord = {
    id,
    name: input.name?.trim() || cleanAnimationName(safeName) || "Untitled animation",
    description: input.description?.trim() || null,
    tags: normalizeTags(input.tags),
    sourceKind: format === "zip" ? "pack" : "single",
    originalFilename: safeName,
    format,
    fileUrl,
    fileSize: input.fileBuffer.byteLength,
    actionCount: actions.length,
    actions,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO animation_assets (
      id, name, description, tags_json, source_kind, original_filename, format, file_url,
      file_size, action_count, actions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.name,
    record.description,
    JSON.stringify(record.tags),
    record.sourceKind,
    record.originalFilename,
    record.format,
    record.fileUrl,
    record.fileSize,
    record.actionCount,
    JSON.stringify(record.actions),
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function createCharacterWithActionsFromUpload(input: {
  characterFileName: string;
  characterFileBuffer: Buffer;
  actionFiles: Array<{
    fileName: string;
    fileBuffer: Buffer;
  }>;
  name: string;
  description?: string;
  tags?: string;
  category?: string;
  elementTypeId?: string;
  license?: string;
}) {
  const model = await createModelFromUpload({
    fileName: input.characterFileName,
    fileBuffer: input.characterFileBuffer,
    name: input.name,
    description: input.description,
    tags: input.tags,
    category: input.category,
    elementTypeId: input.elementTypeId,
    license: input.license,
  });

  const actions: CharacterActionLinkRecord[] = [];
  for (const actionFile of input.actionFiles) {
    const animation = await createAnimationAssetFromUpload({
      fileName: actionFile.fileName,
      fileBuffer: actionFile.fileBuffer,
      name: cleanAnimationName(actionFile.fileName),
      tags: input.tags,
    });

    for (const action of animation.actions) {
      actions.push({
        id: `${animation.id}:${action.id}`,
        animationAssetId: animation.id,
        actionId: action.id,
        name: action.name,
        fileUrl: animation.fileUrl,
        sourceFilename: animation.originalFilename,
        sourceFormat: animation.format,
        sourcePath: action.sourcePath,
        enabled: true,
        trigger: "none",
        keyBinding: null,
        durationMs: null,
        dialogueText: null,
        targetModelId: null,
      });
    }
  }

  const manifest: CharacterAnimationManifest = {
    version: 1,
    mode: "external_actions",
    actions,
    updatedAt: new Date().toISOString(),
  };

  return updateModel(model.id, {
    hasAnimations: actions.length > 0,
    customProps: {
      ...(model.customProps ?? {}),
      characterAnimation: manifest,
    },
  });
}

export async function updateModel(id: string, input: Record<string, unknown>) {
  const current = await getModelById(id);
  if (!current) return null;

  const updated: ModelRecord = {
    ...current,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : current.name,
    description:
      typeof input.description === "string"
        ? input.description.trim() || null
        : current.description,
    tags:
      typeof input.tags === "string"
        ? normalizeTags(input.tags)
        : Array.isArray(input.tags)
          ? input.tags.filter(
              (item): item is string => typeof item === "string",
            )
          : current.tags,
    category:
      typeof input.category === "string"
        ? (input.category as ModelCategory)
        : current.category,
    elementTypeId:
      typeof input.elementTypeId === "string"
        ? input.elementTypeId || null
        : current.elementTypeId,
    license:
      typeof input.license === "string"
        ? (input.license as ModelLicense)
        : current.license,
    position:
      typeof input.position === "string"
        ? parseVector(input.position, current.position)
        : current.position,
    rotation:
      typeof input.rotation === "string"
        ? parseVector(input.rotation, current.rotation)
        : current.rotation,
    scale:
      typeof input.scale === "string"
        ? parseVector(input.scale, current.scale)
        : current.scale,
    customProps:
      input.customProps && typeof input.customProps === "object"
        ? (input.customProps as Record<string, unknown>)
        : current.customProps,
    hasAnimations:
      typeof input.hasAnimations === "boolean"
        ? input.hasAnimations
        : current.hasAnimations,
    hasTextures:
      typeof input.hasTextures === "boolean"
        ? input.hasTextures
        : current.hasTextures,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `
    UPDATE models
    SET name = ?, description = ?, tags_json = ?, category = ?, element_type_id = ?, license = ?,
        has_animations = ?, has_textures = ?, custom_props_json = ?, position_json = ?, rotation_json = ?, scale_json = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(
    updated.name,
    updated.description,
    JSON.stringify(updated.tags),
    updated.category,
    updated.elementTypeId,
    updated.license,
    updated.hasAnimations ? 1 : 0,
    updated.hasTextures ? 1 : 0,
    updated.customProps ? JSON.stringify(updated.customProps) : null,
    JSON.stringify(updated.position),
    JSON.stringify(updated.rotation),
    JSON.stringify(updated.scale),
    updated.updatedAt,
    id,
  );

  return updated;
}

export async function incrementModelView(id: string) {
  db.prepare(
    "UPDATE models SET view_count = view_count + 1, updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), id);
  return getModelById(id);
}

export async function incrementModelDownload(id: string) {
  db.prepare(
    "UPDATE models SET download_count = download_count + 1, updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), id);
  return getModelById(id);
}

export async function createModelVersion(id: string, changeNote?: string) {
  const model = await getModelById(id);
  if (!model) return null;

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM model_versions WHERE model_id = ?")
    .get(id) as {
    count: number;
  };
  const nextVersion = Number(countRow.count) + 1;
  const versionFile = `v${nextVersion}.${model.format}`;
  const sourcePath = path.join(
    appRoot,
    "public",
    model.fileUrl.replace(/^\//, ""),
  );
  const targetPath = path.join(publicUploadsDir, id, versionFile);

  if (existsSync(sourcePath)) {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  } else {
    writeFileSync(targetPath, "");
  }

  const version: ModelVersionRecord = {
    id: randomUUID(),
    modelId: id,
    versionNumber: nextVersion,
    fileUrl: `/uploads/models/${id}/${versionFile}`,
    changeNote: changeNote?.trim() || null,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO model_versions (id, model_id, version_number, file_url, change_note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    version.id,
    version.modelId,
    version.versionNumber,
    version.fileUrl,
    version.changeNote,
    version.createdAt,
  );

  return version;
}

export async function deleteModel(id: string) {
  const model = await getModelById(id);
  if (!model) return false;

  db.prepare("DELETE FROM model_versions WHERE model_id = ?").run(id);
  db.prepare("DELETE FROM models WHERE id = ?").run(id);
  rmSync(path.join(publicUploadsDir, id), { recursive: true, force: true });
  return true;
}
