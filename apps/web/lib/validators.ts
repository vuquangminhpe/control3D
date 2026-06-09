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
