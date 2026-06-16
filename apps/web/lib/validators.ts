import { z } from "zod";

export const createModelSchema = z.object({
  name: z.string().min(1),
  format: z.enum(["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"]),
  fileUrl: z.string().url(),
  originalFilename: z.string().min(1),
});

export const createElementTypeSchema = z.object({
  key: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  schema: z.unknown().optional(),
});

const vector3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((values) => values.every((value) => Number.isFinite(value)), {
    message: "Vector values must be finite numbers",
  });

export const zombieSpawnSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["zombie_low", "zombie_fantasy"]),
  position: vector3Schema,
});

const storyNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const storyNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "start",
    "character",
    "dialogue",
    "choice",
    "event",
    "shop",
    "condition",
    "set_variable",
    "random",
    "delay",
    "comment",
    "bark",
    "animation",
  ]),
  title: z.string().min(1),
  text: z.string().default(""),
  modelId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  mapCharacterId: z.string().nullable().optional(),
  characterId: z.string().nullable().optional(),
  displayLabel: z.string().nullable().optional(),
  previewPosition: vector3Schema.nullable().optional(),
  action: z.string().nullable().optional(),
  characterActionId: z.string().nullable().optional(),
  characterActionName: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  currencyChange: z.number().nullable().optional(),
  position: storyNodePositionSchema,
  variableId: z.string().nullable().optional(),
  variableValue: z.string().nullable().optional(),
  variableOperator: z.string().nullable().optional(),
  choices: z.array(z.string()).nullable().optional(),
  delayDuration: z.number().nullable().optional(),
  animationName: z.string().nullable().optional(),
  conditionVariableId: z.string().nullable().optional(),
  conditionOperator: z.string().nullable().optional(),
  conditionValue: z.string().nullable().optional(),
});

export const storyEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().default(""),
  condition: z.string().nullable().optional(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const storyVariableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "character"]),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
});

export const storyGraphSchema = z.object({
  nodes: z.array(storyNodeSchema),
  edges: z.array(storyEdgeSchema),
  variables: z.array(storyVariableSchema).optional().default([]),
}).default({
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
});


export const mapCharacterSchema = z.object({
  id: z.string().min(1).optional(),
  characterId: z.string().min(1),
  modelId: z.string().min(1),
  name: z.string().min(1),
  fileUrl: z.string().min(1),
  format: z.string().optional(),
  role: z.enum(["playable", "npc", "story_actor", "boss"]).default("playable"),
  displayLabel: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
  pointPrice: z.number().int().min(0).default(0),
  spawnPosition: vector3Schema.nullable().optional(),
  previewPosition: vector3Schema.nullable().optional(),
  storyEnabled: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const createLevelSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  mapModelUrl: z.string().min(1),
  playerCharacter: z.object({
    modelId: z.string().min(1),
    name: z.string().min(1),
    fileUrl: z.string().min(1),
    format: z.string().optional(),
  }).nullable().optional(),
  playerSpawn: vector3Schema,
  robotSpawn: vector3Schema,
  robotStory: z.string().default(""),
  storyGraph: storyGraphSchema,
  zombieSpawns: z.array(zombieSpawnSchema),
  mapCharacters: z.array(mapCharacterSchema).default([]),
  placedObjects: z.array(z.object({
    id: z.string().min(1),
    modelId: z.string().min(1),
    name: z.string().min(1),
    fileUrl: z.string().min(1),
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema,
    isMap: z.boolean().optional(),
  })).default([]),
  maxPlayers: z.number().int().min(1).max(200).default(50),
  publishedAt: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const updateLevelStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});
