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

export type AuthSubjectType = "admin" | "user";
export type AdminRole = "super_admin" | "map_manager" | "moderator" | "analyst";
export type UserStatus = "active" | "disabled" | "banned";

export type AdminRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  permissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionRecord = {
  id: string;
  subjectType: AuthSubjectType;
  adminId: string | null;
  userId: string | null;
  refreshTokenHash: string;
  refreshTokenFamily: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  revokedAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatChannel = "map" | "party" | "system";

export type ChatMessageRecord = {
  id: string;
  mapId: string;
  sessionId: string | null;
  userId: string;
  displayName: string;
  channel: ChatChannel;
  body: string;
  isDeleted: boolean;
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

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'map_manager',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      admin_id TEXT,
      user_id TEXT,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      refresh_token_family TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      rotated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_points (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      map_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'map',
      body TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (map_id) REFERENCES levels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model_id TEXT,
      file_url TEXT NOT NULL,
      format TEXT,
      animation_manifest_json TEXT,
      base_stats_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS auth_sessions_admin_idx ON auth_sessions(admin_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(refresh_token_family);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS chat_messages_map_created_idx ON chat_messages(map_id, created_at);
    CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON chat_messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS game_characters_model_idx ON game_characters(model_id);
    CREATE INDEX IF NOT EXISTS game_characters_active_idx ON game_characters(is_active);

    CREATE TABLE IF NOT EXISTS levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      map_model_url TEXT NOT NULL,
      player_character_json TEXT,
      player_spawn_json TEXT NOT NULL,
      robot_spawn_json TEXT NOT NULL,
      robot_story TEXT NOT NULL,
      story_graph_json TEXT NOT NULL DEFAULT '{"nodes":[{"id":"story-start","kind":"start","title":"Start","text":"Story begins here.","position":{"x":96,"y":160}}],"edges":[]}',
      zombie_spawns_json TEXT NOT NULL,
      map_characters_json TEXT NOT NULL DEFAULT '[]',
      placed_objects_json TEXT NOT NULL DEFAULT '[]',
      max_players INTEGER NOT NULL DEFAULT 50,
      published_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    database.exec("ALTER TABLE levels ADD COLUMN slug TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN description TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN placed_objects_json TEXT NOT NULL DEFAULT '[]';");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN map_characters_json TEXT NOT NULL DEFAULT '[]';");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN max_players INTEGER NOT NULL DEFAULT 50;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN published_at TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE levels ADD COLUMN archived_at TEXT;");
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

function normalizeAdminRole(input: unknown): AdminRole {
  return input === "super_admin" ||
    input === "moderator" ||
    input === "analyst" ||
    input === "map_manager"
    ? input
    : "map_manager";
}

function normalizeUserStatus(input: unknown): UserStatus {
  return input === "disabled" || input === "banned" || input === "active"
    ? input
    : "active";
}

function mapAdmin(row: Record<string, unknown>): AdminRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: normalizeAdminRole(row.role),
    permissions: parseJson(row.permissions_json as string | null, []),
    isActive: Number(row.is_active) === 1,
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
    status: normalizeUserStatus(row.status),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAuthSession(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: String(row.id),
    subjectType: row.subject_type === "admin" ? "admin" : "user",
    adminId: row.admin_id ? String(row.admin_id) : null,
    userId: row.user_id ? String(row.user_id) : null,
    refreshTokenHash: String(row.refresh_token_hash),
    refreshTokenFamily: String(row.refresh_token_family),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    rotatedAt: row.rotated_at ? String(row.rotated_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeChatChannel(input: unknown): ChatChannel {
  return input === "party" || input === "system" ? input : "map";
}

function mapChatMessage(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    mapId: String(row.map_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    userId: String(row.user_id),
    displayName: String(row.display_name),
    channel: normalizeChatChannel(row.channel),
    body: String(row.body),
    isDeleted: Number(row.is_deleted) === 1,
    createdAt: String(row.created_at),
  };
}

function mapGameCharacter(row: Record<string, unknown>): GameCharacterRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    modelId: row.model_id ? String(row.model_id) : null,
    fileUrl: String(row.file_url),
    format: row.format ? String(row.format) : null,
    animationManifest: parseJson(row.animation_manifest_json as string | null, null),
    baseStats: parseJson(row.base_stats_json as string | null, null),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLevel(row: Record<string, unknown>): LevelRecord {
  const playerCharacter = parseJson(row.player_character_json as string | null, null);
  const mapCharacters = normalizeMapCharacters(
    parseJson(row.map_characters_json as string | null, []),
    playerCharacter,
  );

  return {
    id: String(row.id),
    name: String(row.name),
    slug: row.slug ? String(row.slug) : slugify(String(row.name)),
    description: row.description ? String(row.description) : null,
    status: normalizeLevelStatus(row.status),
    mapModelUrl: String(row.map_model_url),
    playerCharacter,
    playerSpawn: parseJson(row.player_spawn_json as string | null, [0, 1.5, 5]),
    robotSpawn: parseJson(row.robot_spawn_json as string | null, [-9, 1.2, 12]),
    robotStory: String(row.robot_story ?? ""),
    storyGraph: parseJson(row.story_graph_json as string | null, EMPTY_STORY_GRAPH),
    zombieSpawns: parseJson(row.zombie_spawns_json as string | null, []),
    mapCharacters,
    placedObjects: parseJson(row.placed_objects_json as string | null, []),
    maxPlayers: Math.max(1, Number(row.max_players ?? 50) || 50),
    publishedAt: row.published_at ? String(row.published_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
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

function slugify(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `map-${randomUUID().slice(0, 8)}`;
}

function normalizeLevelStatus(input: unknown): LevelStatus {
  return input === "published" || input === "archived" || input === "draft"
    ? input
    : "draft";
}

function normalizeMapCharacters(
  input: unknown,
  playerCharacter: LevelRecord["playerCharacter"],
): MapCharacterRecord[] {
  const raw = Array.isArray(input) ? input : [];
  const normalized = raw
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .map((entry, index) => ({
      id: String(entry.id || `map-character-${index + 1}`),
      characterId: String(entry.characterId || entry.modelId || ""),
      modelId: String(entry.modelId || entry.characterId || ""),
      name: String(entry.name || entry.displayLabel || "Character"),
      fileUrl: String(entry.fileUrl || ""),
      format: entry.format ? String(entry.format) : undefined,
      role: (
        entry.role === "npc" ||
        entry.role === "story_actor" ||
        entry.role === "boss"
          ? entry.role
          : "playable"
      ) as MapCharacterRole,
      displayLabel: entry.displayLabel ? String(entry.displayLabel) : null,
      isDefault: Boolean(entry.isDefault),
      pointPrice: Math.max(0, Number(entry.pointPrice ?? 0) || 0),
      spawnPosition: Array.isArray(entry.spawnPosition) && entry.spawnPosition.length === 3
        ? (entry.spawnPosition.map(Number) as [number, number, number])
        : null,
      previewPosition: Array.isArray(entry.previewPosition) && entry.previewPosition.length === 3
        ? (entry.previewPosition.map(Number) as [number, number, number])
        : null,
      storyEnabled: Boolean(entry.storyEnabled),
      sortOrder: Math.max(0, Number(entry.sortOrder ?? index) || 0),
    }))
    .filter((entry) => entry.characterId && entry.modelId && entry.fileUrl);

  if (!normalized.length && playerCharacter) {
    return [
      {
        id: `map-character-${playerCharacter.modelId}`,
        characterId: playerCharacter.modelId,
        modelId: playerCharacter.modelId,
        name: playerCharacter.name,
        fileUrl: playerCharacter.fileUrl,
        format: playerCharacter.format,
        role: "playable",
        displayLabel: playerCharacter.name,
        isDefault: true,
        pointPrice: 0,
        spawnPosition: null,
        previewPosition: null,
        storyEnabled: true,
        sortOrder: 0,
      },
    ];
  }

  if (normalized.some((entry) => entry.isDefault)) {
    return normalized;
  }

  return normalized.map((entry, index) => ({
    ...entry,
    isDefault: index === 0 && entry.role === "playable",
  }));
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

export async function countAdmins() {
  const row = db.prepare("SELECT COUNT(*) as count FROM admins").get() as {
    count: number;
  };
  return Number(row.count ?? 0);
}

export async function createAdmin(input: {
  email: string;
  passwordHash: string;
  role?: AdminRole;
  permissions?: string[];
}) {
  const now = new Date().toISOString();
  const record: AdminRecord = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    role: input.role ?? "map_manager",
    permissions: input.permissions ?? [],
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO admins (
      id, email, password_hash, role, permissions_json, is_active, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.email,
    record.passwordHash,
    record.role,
    JSON.stringify(record.permissions),
    record.isActive ? 1 : 0,
    record.lastLoginAt,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function getAdminByEmail(email: string) {
  const row = db.prepare("SELECT * FROM admins WHERE email = ?").get(email.trim().toLowerCase()) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAdmin(row) : null;
}

export async function getAdminById(id: string) {
  const row = db.prepare("SELECT * FROM admins WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAdmin(row) : null;
}

export async function markAdminLogin(id: string) {
  db.prepare("UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    new Date().toISOString(),
    id,
  );
}

export async function listChatMessagesForMap(mapId: string, limit = 50) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM chat_messages
      WHERE map_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `,
    )
    .all(mapId, Math.max(1, Math.min(100, Math.floor(limit)))) as Record<
    string,
    unknown
  >[];

  return rows.map(mapChatMessage).reverse();
}

export async function createChatMessage(input: {
  id?: string;
  mapId: string;
  sessionId?: string | null;
  userId: string;
  displayName: string;
  channel?: ChatChannel;
  body: string;
  createdAt?: string;
}) {
  const now = input.createdAt ?? new Date().toISOString();
  const record: ChatMessageRecord = {
    id: input.id ?? randomUUID(),
    mapId: input.mapId,
    sessionId: input.sessionId ?? null,
    userId: input.userId,
    displayName: input.displayName.trim().slice(0, 40) || "Player",
    channel: input.channel ?? "map",
    body: input.body,
    isDeleted: false,
    createdAt: now,
  };

  db.prepare(
    `
    INSERT INTO chat_messages (
      id, map_id, session_id, user_id, display_name, channel, body, is_deleted, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.mapId,
    record.sessionId,
    record.userId,
    record.displayName,
    record.channel,
    record.body,
    record.isDeleted ? 1 : 0,
    record.createdAt,
  );

  return record;
}

export async function createUser(input: {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}) {
  const now = new Date().toISOString();
  const record: UserRecord = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    username: input.username.trim(),
    displayName: input.displayName.trim(),
    passwordHash: input.passwordHash,
    status: "active",
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO users (
      id, email, username, display_name, password_hash, status, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.email,
    record.username,
    record.displayName,
    record.passwordHash,
    record.status,
    record.lastLoginAt,
    record.createdAt,
    record.updatedAt,
  );

  db.prepare("INSERT INTO user_points (user_id, balance, lifetime, updated_at) VALUES (?, 0, 0, ?)").run(
    record.id,
    now,
  );

  return record;
}

export async function getUserByEmail(email: string) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUser(row) : null;
}

export async function getUserById(id: string) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUser(row) : null;
}

export async function markUserLogin(id: string) {
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    new Date().toISOString(),
    id,
  );
}

export async function createAuthSession(input: {
  subjectType: AuthSubjectType;
  adminId?: string | null;
  userId?: string | null;
  refreshTokenHash: string;
  refreshTokenFamily?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string;
}) {
  const now = new Date().toISOString();
  const record: AuthSessionRecord = {
    id: randomUUID(),
    subjectType: input.subjectType,
    adminId: input.adminId ?? null,
    userId: input.userId ?? null,
    refreshTokenHash: input.refreshTokenHash,
    refreshTokenFamily: input.refreshTokenFamily ?? randomUUID(),
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    expiresAt: input.expiresAt,
    revokedAt: null,
    rotatedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO auth_sessions (
      id, subject_type, admin_id, user_id, refresh_token_hash, refresh_token_family, user_agent,
      ip_address, expires_at, revoked_at, rotated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.id,
    record.subjectType,
    record.adminId,
    record.userId,
    record.refreshTokenHash,
    record.refreshTokenFamily,
    record.userAgent,
    record.ipAddress,
    record.expiresAt,
    record.revokedAt,
    record.rotatedAt,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function getAuthSessionByRefreshHash(refreshTokenHash: string) {
  const row = db
    .prepare("SELECT * FROM auth_sessions WHERE refresh_token_hash = ?")
    .get(refreshTokenHash) as Record<string, unknown> | undefined;
  return row ? mapAuthSession(row) : null;
}

export async function getAuthSessionById(id: string) {
  const row = db.prepare("SELECT * FROM auth_sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAuthSession(row) : null;
}

export async function revokeAuthSession(id: string) {
  const now = new Date().toISOString();
  db.prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE id = ?").run(
    now,
    now,
    id,
  );
}

export async function revokeAuthSessionFamily(refreshTokenFamily: string) {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE refresh_token_family = ?",
  ).run(now, now, refreshTokenFamily);
}

export async function rotateAuthSession(
  currentSession: AuthSessionRecord,
  nextRefreshTokenHash: string,
  expiresAt: string,
) {
  const now = new Date().toISOString();
  db.prepare("UPDATE auth_sessions SET revoked_at = ?, rotated_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    now,
    now,
    currentSession.id,
  );

  return createAuthSession({
    subjectType: currentSession.subjectType,
    adminId: currentSession.adminId,
    userId: currentSession.userId,
    refreshTokenHash: nextRefreshTokenHash,
    refreshTokenFamily: currentSession.refreshTokenFamily,
    userAgent: currentSession.userAgent,
    ipAddress: currentSession.ipAddress,
    expiresAt,
  });
}

export async function listGameCharacters(filters?: { includeInactive?: boolean }) {
  const rows = db
    .prepare(
      filters?.includeInactive
        ? "SELECT * FROM game_characters ORDER BY updated_at DESC"
        : "SELECT * FROM game_characters WHERE is_active = 1 ORDER BY updated_at DESC",
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapGameCharacter);
}

export async function getGameCharacterById(id: string) {
  const row = db.prepare("SELECT * FROM game_characters WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapGameCharacter(row) : null;
}

export async function createGameCharacter(input: {
  id?: string;
  name: string;
  description?: string | null;
  modelId?: string | null;
  fileUrl: string;
  format?: string | null;
  animationManifest?: unknown;
  baseStats?: unknown;
  isActive?: boolean;
}) {
  const now = new Date().toISOString();
  const existing = input.id ? await getGameCharacterById(input.id) : null;
  const record: GameCharacterRecord = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    description:
      typeof input.description === "string"
        ? input.description.trim() || null
        : existing?.description ?? null,
    modelId: input.modelId ?? existing?.modelId ?? null,
    fileUrl: input.fileUrl.trim(),
    format: input.format ?? existing?.format ?? null,
    animationManifest: input.animationManifest ?? existing?.animationManifest ?? null,
    baseStats: input.baseStats ?? existing?.baseStats ?? null,
    isActive: input.isActive ?? existing?.isActive ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO game_characters (
      id, name, description, model_id, file_url, format, animation_manifest_json, base_stats_json,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      model_id = excluded.model_id,
      file_url = excluded.file_url,
      format = excluded.format,
      animation_manifest_json = excluded.animation_manifest_json,
      base_stats_json = excluded.base_stats_json,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `,
  ).run(
    record.id,
    record.name,
    record.description,
    record.modelId,
    record.fileUrl,
    record.format,
    record.animationManifest ? JSON.stringify(record.animationManifest) : null,
    record.baseStats ? JSON.stringify(record.baseStats) : null,
    record.isActive ? 1 : 0,
    record.createdAt,
    record.updatedAt,
  );

  return record;
}

export async function updateGameCharacter(
  id: string,
  input: Partial<Omit<GameCharacterRecord, "id" | "createdAt" | "updatedAt">>,
) {
  const current = await getGameCharacterById(id);
  if (!current) return null;
  return createGameCharacter({
    ...current,
    ...input,
    id,
  });
}

export async function deleteGameCharacter(id: string) {
  const current = await getGameCharacterById(id);
  if (!current) return null;
  return updateGameCharacter(id, { isActive: false });
}

export async function assignCharacterToLevel(
  levelId: string,
  input: {
    characterId: string;
    role?: MapCharacterRole;
    displayLabel?: string | null;
    isDefault?: boolean;
    pointPrice?: number;
    spawnPosition?: [number, number, number] | null;
    previewPosition?: [number, number, number] | null;
    storyEnabled?: boolean;
    sortOrder?: number;
  },
) {
  const level = await getLevelById(levelId);
  if (!level) return null;
  const character = await getGameCharacterById(input.characterId);
  if (!character || !character.isActive) return null;

  const nextCharacter: MapCharacterRecord = {
    id:
      level.mapCharacters.find((entry) => entry.characterId === character.id)?.id ??
      `map-character-${randomUUID()}`,
    characterId: character.id,
    modelId: character.modelId ?? character.id,
    name: character.name,
    fileUrl: character.fileUrl,
    format: character.format ?? undefined,
    role: input.role ?? "playable",
    displayLabel: input.displayLabel ?? character.name,
    isDefault: Boolean(input.isDefault),
    pointPrice: Math.max(0, Number(input.pointPrice ?? 0) || 0),
    spawnPosition: input.spawnPosition ?? null,
    previewPosition: input.previewPosition ?? null,
    storyEnabled: Boolean(input.storyEnabled),
    sortOrder: Math.max(0, Number(input.sortOrder ?? level.mapCharacters.length) || 0),
  };

  const existing = level.mapCharacters.filter((entry) => entry.characterId !== character.id);
  const mapCharacters = [...existing, nextCharacter]
    .map((entry) => ({
      ...entry,
      isDefault:
        nextCharacter.isDefault && entry.characterId !== nextCharacter.characterId
          ? false
          : entry.isDefault,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return createLevel({
    ...level,
    mapCharacters,
    playerCharacter:
      nextCharacter.isDefault && nextCharacter.role === "playable"
        ? {
            modelId: nextCharacter.modelId,
            name: nextCharacter.name,
            fileUrl: nextCharacter.fileUrl,
            format: nextCharacter.format,
          }
        : level.playerCharacter,
  });
}

export async function updateLevelMapCharacter(
  levelId: string,
  mapCharacterId: string,
  input: Partial<MapCharacterInput>,
) {
  const level = await getLevelById(levelId);
  if (!level) return null;
  const current = level.mapCharacters.find((entry) => entry.id === mapCharacterId);
  if (!current) return null;

  const updated: MapCharacterRecord = {
    ...current,
    ...input,
    id: current.id,
    characterId: current.characterId,
    modelId: current.modelId,
    name: input.name ?? current.name,
    fileUrl: input.fileUrl ?? current.fileUrl,
    role: input.role ?? current.role,
    displayLabel:
      input.displayLabel === undefined ? current.displayLabel : input.displayLabel,
    isDefault: input.isDefault ?? current.isDefault,
    pointPrice: Math.max(0, Number(input.pointPrice ?? current.pointPrice) || 0),
    spawnPosition:
      input.spawnPosition === undefined ? current.spawnPosition : input.spawnPosition,
    previewPosition:
      input.previewPosition === undefined
        ? current.previewPosition
        : input.previewPosition,
    storyEnabled: input.storyEnabled ?? current.storyEnabled,
    sortOrder: Math.max(0, Number(input.sortOrder ?? current.sortOrder) || 0),
  };

  const mapCharacters = level.mapCharacters
    .map((entry) => {
      if (entry.id === mapCharacterId) return updated;
      return updated.isDefault ? { ...entry, isDefault: false } : entry;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return createLevel({
    ...level,
    mapCharacters,
    playerCharacter:
      updated.isDefault && updated.role === "playable"
        ? {
            modelId: updated.modelId,
            name: updated.name,
            fileUrl: updated.fileUrl,
            format: updated.format,
          }
        : level.playerCharacter,
  });
}

export async function removeCharacterFromLevel(levelId: string, mapCharacterId: string) {
  const level = await getLevelById(levelId);
  if (!level) return null;
  const exists = level.mapCharacters.some((entry) => entry.id === mapCharacterId);
  if (!exists) return null;

  const removed = level.mapCharacters.find((entry) => entry.id === mapCharacterId);
  const mapCharacters = level.mapCharacters.filter((entry) => entry.id !== mapCharacterId);
  const nextDefault = mapCharacters.some((entry) => entry.isDefault)
    ? mapCharacters
    : mapCharacters.map((entry, index) => ({
        ...entry,
        isDefault: index === 0 && entry.role === "playable",
      }));

  return createLevel({
    ...level,
    mapCharacters: nextDefault,
    playerCharacter:
      removed?.isDefault || removed?.modelId === level.playerCharacter?.modelId
        ? null
        : level.playerCharacter,
  });
}

export async function listLevels() {
  const rows = db
    .prepare("SELECT * FROM levels ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapLevel);
}

export async function listPublishedLevels() {
  const rows = db
    .prepare("SELECT * FROM levels WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC")
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
  slug?: string;
  description?: string | null;
  status?: LevelStatus;
  mapModelUrl: string;
  playerCharacter?: LevelRecord["playerCharacter"];
  playerSpawn: [number, number, number];
  robotSpawn: [number, number, number];
  robotStory: string;
  storyGraph?: StoryGraphRecord;
  zombieSpawns: ZombieSpawnRecord[];
  mapCharacters?: MapCharacterInput[];
  placedObjects?: LevelRecord["placedObjects"];
  maxPlayers?: number;
  publishedAt?: string | null;
  archivedAt?: string | null;
}) {
  const now = new Date().toISOString();
  const existing = input.id ? await getLevelById(input.id) : null;
  const status = input.status ?? existing?.status ?? "draft";
  const publishedAt =
    status === "published"
      ? input.publishedAt ?? existing?.publishedAt ?? now
      : input.publishedAt ?? existing?.publishedAt ?? null;
  const archivedAt =
    status === "archived"
      ? input.archivedAt ?? existing?.archivedAt ?? now
      : input.archivedAt ?? existing?.archivedAt ?? null;
  const level: LevelRecord = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    slug: input.slug?.trim() || existing?.slug || slugify(input.name),
    description:
      typeof input.description === "string"
        ? input.description.trim() || null
        : existing?.description ?? null,
    status,
    mapModelUrl: input.mapModelUrl.trim(),
    playerCharacter: input.playerCharacter ?? null,
    playerSpawn: input.playerSpawn,
    robotSpawn: input.robotSpawn,
    robotStory: input.robotStory.trim(),
    storyGraph: input.storyGraph ?? EMPTY_STORY_GRAPH,
    zombieSpawns: input.zombieSpawns,
    mapCharacters: normalizeMapCharacters(
      input.mapCharacters ?? existing?.mapCharacters ?? [],
      input.playerCharacter ?? existing?.playerCharacter ?? null,
    ),
    placedObjects: input.placedObjects ?? [],
    maxPlayers: Math.max(1, Number(input.maxPlayers ?? existing?.maxPlayers ?? 50) || 50),
    publishedAt,
    archivedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  db.prepare(
    `
    INSERT INTO levels (
      id, name, slug, description, status, map_model_url, player_character_json, player_spawn_json,
      robot_spawn_json, robot_story, story_graph_json, zombie_spawns_json, map_characters_json,
      placed_objects_json, max_players, published_at, archived_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      description = excluded.description,
      status = excluded.status,
      map_model_url = excluded.map_model_url,
      player_character_json = excluded.player_character_json,
      player_spawn_json = excluded.player_spawn_json,
      robot_spawn_json = excluded.robot_spawn_json,
      robot_story = excluded.robot_story,
      story_graph_json = excluded.story_graph_json,
      zombie_spawns_json = excluded.zombie_spawns_json,
      map_characters_json = excluded.map_characters_json,
      placed_objects_json = excluded.placed_objects_json,
      max_players = excluded.max_players,
      published_at = excluded.published_at,
      archived_at = excluded.archived_at,
      updated_at = excluded.updated_at
  `,
  ).run(
    level.id,
    level.name,
    level.slug,
    level.description,
    level.status,
    level.mapModelUrl,
    level.playerCharacter ? JSON.stringify(level.playerCharacter) : null,
    JSON.stringify(level.playerSpawn),
    JSON.stringify(level.robotSpawn),
    level.robotStory,
    JSON.stringify(level.storyGraph),
    JSON.stringify(level.zombieSpawns),
    JSON.stringify(level.mapCharacters),
    JSON.stringify(level.placedObjects),
    level.maxPlayers,
    level.publishedAt,
    level.archivedAt,
    level.createdAt,
    level.updatedAt,
  );

  return level;
}

export async function setLevelStatus(id: string, status: LevelStatus) {
  const current = await getLevelById(id);
  if (!current) return null;
  return createLevel({
    ...current,
    status,
    publishedAt:
      status === "published" ? current.publishedAt ?? new Date().toISOString() : current.publishedAt,
    archivedAt:
      status === "archived" ? current.archivedAt ?? new Date().toISOString() : current.archivedAt,
  });
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
