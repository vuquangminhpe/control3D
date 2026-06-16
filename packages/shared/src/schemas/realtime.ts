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

export const realtimePresencePlayerSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  mapId: z.string().min(1),
  seq: z.number().int().nonnegative().default(0),
  serverTimeMs: z.number().int().nonnegative().default(0),
  position: realtimeVector3Schema,
  velocity: realtimeVector3Schema.default([0, 0, 0]),
  characterName: z.string().max(80).nullable(),
  characterFileUrl: z.string().max(2000).nullable(),
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
export type RealtimeClientEvent = z.infer<typeof realtimeClientEventSchema>;
export type RealtimeServerEvent = z.infer<typeof realtimeServerEventSchema>;
