import { z } from "zod";
import { vector3Schema } from "./maps";

export const joinMapIntentSchema = z.object({
  mapId: z.string().min(1),
  characterId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).optional(),
});

export const moveInputSchema = z.object({
  seq: z.number().int().min(0),
  direction: vector3Schema,
  positionHint: vector3Schema.optional(),
  clientTime: z.number().finite(),
});

export const attackInputSchema = z.object({
  seq: z.number().int().min(0),
  actionId: z.string().min(1).max(120),
  targetId: z.string().min(1).max(120).optional(),
  origin: vector3Schema.optional(),
  clientTime: z.number().finite(),
});

export const changeCharacterInputSchema = z.object({
  characterId: z.string().min(1),
});

export const leaveMapInputSchema = z.object({
  sessionId: z.string().min(1),
});

export type JoinMapIntentInput = z.infer<typeof joinMapIntentSchema>;
export type MoveInput = z.infer<typeof moveInputSchema>;
export type AttackInput = z.infer<typeof attackInputSchema>;
