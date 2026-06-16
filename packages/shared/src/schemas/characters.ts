import { z } from "zod";
import { mapCharacterRoleSchema, vector3Schema } from "./maps";

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
  fileUrl: z.string().trim().min(1),
  format: z.string().trim().max(12).nullable().optional(),
  animationManifest: z.unknown().nullable().optional(),
  baseStats: z.unknown().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const createCharacterSchema = characterSchema.omit({ id: true }).extend({
  description: z.string().trim().max(2000).optional(),
  modelId: z.string().min(1).optional(),
  format: z.string().trim().max(12).optional(),
  isActive: z.boolean().optional(),
});

export const updateCharacterSchema = createCharacterSchema.partial();

export const assignMapCharacterSchema = z.object({
  characterId: z.string().min(1),
  role: mapCharacterRoleSchema.default("playable"),
  displayLabel: z.string().trim().min(1).max(80).nullable().optional(),
  isDefault: z.boolean().default(false),
  pointPrice: z.number().int().min(0).default(0),
  spawnPosition: vector3Schema.nullable().optional(),
  previewPosition: vector3Schema.nullable().optional(),
  storyEnabled: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateMapCharacterSchema = assignMapCharacterSchema
  .omit({ characterId: true })
  .partial();

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type AssignMapCharacterInput = z.infer<typeof assignMapCharacterSchema>;
