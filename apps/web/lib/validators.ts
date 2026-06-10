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

export const createLevelSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  mapModelUrl: z.string().min(1),
  playerSpawn: vector3Schema,
  robotSpawn: vector3Schema,
  robotStory: z.string().default(""),
  zombieSpawns: z.array(zombieSpawnSchema).min(1),
  placedObjects: z.array(z.object({
    id: z.string().min(1),
    modelId: z.string().min(1),
    name: z.string().min(1),
    fileUrl: z.string().min(1),
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema,
  })).default([]),
});
