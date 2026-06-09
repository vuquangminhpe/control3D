import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { persistUploadWithDelivery } from "@/lib/model-optimization";

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

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, "app"))
  ? cwd
  : path.join(cwd, "apps", "web");
const dataDir = path.join(appRoot, "data");
const publicUploadsDir = path.join(appRoot, "public", "uploads", "models");
const dbPath = path.join(dataDir, "control3d.sqlite");

type GlobalSqliteState = {
  control3dDb?: DatabaseSync;
  control3dDbInitialized?: boolean;
};

const globalSqliteState = globalThis as typeof globalThis & GlobalSqliteState;

mkdirSync(dataDir, { recursive: true });
mkdirSync(publicUploadsDir, { recursive: true });

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
  `);

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
  const record: ModelRecord = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    tags: normalizeTags(input.tags),
    category: ((input.category as ModelCategory) || "other") as ModelCategory,
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
    customProps: storedUpload.customProps,
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
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `
    UPDATE models
    SET name = ?, description = ?, tags_json = ?, category = ?, element_type_id = ?, license = ?,
        custom_props_json = ?, position_json = ?, rotation_json = ?, scale_json = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(
    updated.name,
    updated.description,
    JSON.stringify(updated.tags),
    updated.category,
    updated.elementTypeId,
    updated.license,
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
