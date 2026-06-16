import { z } from "zod";

export const vector3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((values) => values.every(Number.isFinite), {
    message: "Vector values must be finite numbers",
  });

export const mapStatusSchema = z.enum(["draft", "published", "archived"]);

export const mapCharacterRoleSchema = z.enum([
  "playable",
  "npc",
  "story_actor",
  "boss",
]);

export const placedObjectSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  name: z.string().min(1).max(120),
  fileUrl: z.string().min(1),
  position: vector3Schema,
  rotation: vector3Schema,
  scale: vector3Schema,
  isMap: z.boolean().optional(),
});

export const zombieSpawnSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["zombie_low", "zombie_fantasy"]),
  position: vector3Schema,
});

export const mapCharacterSchema = z.object({
  id: z.string().min(1).optional(),
  characterId: z.string().min(1),
  role: mapCharacterRoleSchema.default("playable"),
  displayLabel: z.string().trim().min(1).max(80).optional(),
  isDefault: z.boolean().default(false),
  pointPrice: z.number().int().min(0).default(0),
  spawnPosition: vector3Schema.optional(),
  previewPosition: vector3Schema.optional(),
  storyEnabled: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const mapRulesSchema = z
  .object({
    maxPlayers: z.number().int().min(1).max(200).default(50),
    pointRewardLowZombie: z.number().int().min(0).default(100),
    pointRewardFantasyZombie: z.number().int().min(0).default(300),
    allowGuestDisplayName: z.boolean().default(true),
  })
  .partial()
  .default({});

export const createGameMapSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(2000).optional(),
  status: mapStatusSchema.default("draft"),
  mapModelUrl: z.string().trim().min(1),
  playerSpawn: vector3Schema,
  robotSpawn: vector3Schema.optional(),
  placedObjects: z.array(placedObjectSchema).default([]),
  zombieSpawns: z.array(zombieSpawnSchema).default([]),
  storyGraph: z.unknown().optional(),
  rules: mapRulesSchema,
  maxPlayers: z.number().int().min(1).max(200).default(50),
  characters: z.array(mapCharacterSchema).default([]),
});

export const updateGameMapSchema = createGameMapSchema.partial().extend({
  id: z.string().min(1).optional(),
});

export const publishMapSchema = z.object({
  status: z.enum(["published", "draft", "archived"]),
});

export type Vector3 = z.infer<typeof vector3Schema>;
export type MapCharacterInput = z.infer<typeof mapCharacterSchema>;
export type CreateGameMapInput = z.infer<typeof createGameMapSchema>;
export type UpdateGameMapInput = z.infer<typeof updateGameMapSchema>;
