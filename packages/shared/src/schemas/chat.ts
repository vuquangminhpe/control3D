import { z } from "zod";

export const chatChannelSchema = z.enum(["map", "party", "system"]);

export const chatSendSchema = z.object({
  channel: z.enum(["map"]).default("map"),
  body: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .transform((value) => value.replace(/\s+/g, " ")),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  mapId: z.string().min(1),
  sessionId: z.string().min(1).nullable().optional(),
  userId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  channel: chatChannelSchema,
  body: z.string().min(1).max(300),
  isDeleted: z.boolean().default(false),
  createdAt: z.string().min(1),
});

export const chatHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const chatReportSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const chatPanelModeSchema = z.enum(["collapsed", "compact", "expanded"]);

export const chatPanelUiStateSchema = z.object({
  mode: chatPanelModeSchema.default("compact"),
  width: z.number().int().min(300).max(560).default(360),
  height: z.number().int().min(220).max(720).default(320),
  draft: z.string().max(300).default(""),
});

export const muteUserSchema = z.object({
  mapId: z.string().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type ChatSendInput = z.infer<typeof chatSendSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatPanelMode = z.infer<typeof chatPanelModeSchema>;
export type ChatPanelUiState = z.infer<typeof chatPanelUiStateSchema>;
