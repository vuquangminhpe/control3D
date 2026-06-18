import { z } from "zod";
import { chatMessageSchema, chatSendSchema } from "./chat";

export const realtimeVector3Schema = z
  .array(z.number().finite())
  .length(3)
  .transform((value) => value as [number, number, number]);

export const realtimeJoinIntentSchema = z.object({
  mapId: z.string().min(1),
  realtimeUrl: z.string().min(1),
  joinToken: z.string().min(1),
  roomId: z.string().min(1),
  expiresAt: z.string().min(1),
});

export const realtimeCharacterActionSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  fileUrl: z.string().min(1).max(2000),
  enabled: z.boolean().default(true),
  trigger: z.enum([
    "none",
    "attack",
    "talk",
    "move",
    "custom",
    "crouch",
    "jump",
    "idle",
  ]).default("none"),
  keyBinding: z.string().max(80).nullable().default(null),
  durationMs: z.number().int().positive().nullable().default(null),
});

export const realtimePresencePlayerSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  mapId: z.string().min(1),
  characterId: z.string().max(120).nullable().default(null),
  seq: z.number().int().nonnegative().default(0),
  serverTimeMs: z.number().int().nonnegative().default(0),
  position: realtimeVector3Schema,
  velocity: realtimeVector3Schema.default([0, 0, 0]),
  characterName: z.string().max(80).nullable(),
  characterFileUrl: z.string().max(2000).nullable(),
  characterActions: z.array(realtimeCharacterActionSchema).max(40).default([]),
  actionState: z.string().trim().max(40).default("idle"),
  activeActionName: z.string().trim().max(120).nullable().default(null),
  activeActionUrl: z.string().trim().max(2000).nullable().default(null),
  updatedAt: z.string().min(1),
});

export const realtimePresenceUpdateSchema = z.object({
  position: realtimeVector3Schema,
  velocity: realtimeVector3Schema.optional(),
  characterName: z.string().trim().max(80).nullable().optional(),
  characterFileUrl: z.string().trim().max(2000).nullable().optional(),
  actionState: z.string().trim().max(40).optional(),
  activeActionName: z.string().trim().max(120).nullable().optional(),
  activeActionUrl: z.string().trim().max(2000).nullable().optional(),
});

export const realtimeEnemyStateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["zombie_low", "zombie_fantasy"]),
  position: realtimeVector3Schema,
  velocity: realtimeVector3Schema.default([0, 0, 0]),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  actionState: z.string().trim().max(40),
  isDead: z.boolean(),
  seq: z.number().int().nonnegative(),
});

export const realtimeNpcStateSchema = z.object({
  id: z.string().min(1),
  kind: z.string().trim().max(40),
  position: realtimeVector3Schema,
  actionState: z.string().trim().max(40),
  seq: z.number().int().nonnegative(),
});

export const realtimeWorldSnapshotSchema = z.object({
  mapId: z.string().min(1),
  serverTimeMs: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  enemies: z.array(realtimeEnemyStateSchema),
  npcs: z.array(realtimeNpcStateSchema),
});

export const realtimeCombatAttackSchema = z.object({
  clientAttackId: z.string().trim().max(80).optional(),
  mode: z.enum(["light", "heavy", "alt"]).default("light"),
  origin: realtimeVector3Schema,
  direction: realtimeVector3Schema,
});

export const realtimeClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("presence:update"),
    payload: realtimePresenceUpdateSchema,
  }),
  z.object({
    type: z.literal("chat:send"),
    payload: chatSendSchema,
  }),
  z.object({
    type: z.literal("combat:attack"),
    payload: realtimeCombatAttackSchema,
  }),
  z.object({
    type: z.literal("ping"),
    payload: z.object({ sentAt: z.number().optional() }).optional(),
  }),
]);

export const realtimeServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room:joined"),
    payload: z.object({
      self: realtimePresencePlayerSchema,
      players: z.array(realtimePresencePlayerSchema),
      messages: z.array(chatMessageSchema),
    }),
  }),
  z.object({
    type: z.literal("presence:update"),
    payload: realtimePresencePlayerSchema,
  }),
  z.object({
    type: z.literal("presence:left"),
    payload: z.object({ id: z.string().min(1), userId: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("chat:message"),
    payload: chatMessageSchema,
  }),
  z.object({
    type: z.literal("world:snapshot"),
    payload: realtimeWorldSnapshotSchema,
  }),
  z.object({
    type: z.literal("combat:hit"),
    payload: z.object({
      enemyId: z.string().min(1),
      userId: z.string().min(1),
      damage: z.number().int().positive(),
      hp: z.number().int().nonnegative(),
      isDead: z.boolean(),
      clientAttackId: z.string().max(80).nullable(),
    }),
  }),
  z.object({
    type: z.literal("reward:points"),
    payload: z.object({
      userId: z.string().min(1),
      enemyId: z.string().min(1),
      amount: z.number().int().positive(),
      balanceAfter: z.number().int().nonnegative().nullable(),
      transactionId: z.string().min(1),
      duplicate: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("player:damage"),
    payload: z.object({
      userId: z.string().min(1),
      enemyId: z.string().min(1),
      amount: z.number().int().positive(),
      hp: z.number().int().nonnegative(),
      maxHp: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal("error"),
    payload: z.object({ code: z.string().min(1), message: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("pong"),
    payload: z.object({ sentAt: z.number().optional(), receivedAt: z.number() }),
  }),
]);

export type RealtimeJoinIntent = z.infer<typeof realtimeJoinIntentSchema>;
export type RealtimePresencePlayer = z.infer<typeof realtimePresencePlayerSchema>;
export type RealtimePresenceUpdate = z.infer<typeof realtimePresenceUpdateSchema>;
export type RealtimeEnemyState = z.infer<typeof realtimeEnemyStateSchema>;
export type RealtimeNpcState = z.infer<typeof realtimeNpcStateSchema>;
export type RealtimeWorldSnapshot = z.infer<typeof realtimeWorldSnapshotSchema>;
export type RealtimeCombatAttack = z.infer<typeof realtimeCombatAttackSchema>;
export type RealtimeClientEvent = z.infer<typeof realtimeClientEventSchema>;
export type RealtimeServerEvent = z.infer<typeof realtimeServerEventSchema>;
