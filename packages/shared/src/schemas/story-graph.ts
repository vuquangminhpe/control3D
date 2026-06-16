import { z } from "zod";
import { vector3Schema } from "./maps";

export const storyNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const storyNodeKindSchema = z.enum([
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
]);

const baseStoryNodeSchema = z.object({
  id: z.string().min(1),
  kind: storyNodeKindSchema,
  title: z.string().min(1).max(120),
  text: z.string().max(4000).default(""),
  position: storyNodePositionSchema,
});

export const storyCharacterNodeSchema = baseStoryNodeSchema.extend({
  kind: z.literal("character"),
  mapCharacterId: z.string().min(1),
  characterId: z.string().min(1),
  displayLabel: z.string().trim().min(1).max(80).optional(),
  previewPosition: vector3Schema.optional(),
});

export const storyNodeSchema = baseStoryNodeSchema.extend({
  modelId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  mapCharacterId: z.string().nullable().optional(),
  characterId: z.string().nullable().optional(),
  displayLabel: z.string().nullable().optional(),
  previewPosition: vector3Schema.optional(),
  action: z.string().nullable().optional(),
  characterActionId: z.string().nullable().optional(),
  characterActionName: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  currencyChange: z.number().nullable().optional(),
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
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  type: z.enum(["string", "number", "boolean", "character"]),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
});

export const storyGraphSchema = z
  .object({
    nodes: z.array(storyNodeSchema),
    edges: z.array(storyEdgeSchema),
    variables: z.array(storyVariableSchema).default([]),
  })
  .default({
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

export function getInvalidStoryCharacterReferences(input: {
  storyNodes: Array<{ kind: string; mapCharacterId?: string | null }>;
  allowedMapCharacterIds: Set<string>;
}) {
  return input.storyNodes
    .filter((node) => {
      if (!["character", "dialogue", "animation", "bark", "shop"].includes(node.kind)) {
        return false;
      }
      return !node.mapCharacterId || !input.allowedMapCharacterIds.has(node.mapCharacterId);
    })
    .map((node) => node.mapCharacterId ?? "");
}

export function assertStoryCharactersBelongToMap(input: {
  storyNodes: Array<{ kind: string; mapCharacterId?: string | null }>;
  allowedMapCharacterIds: Set<string>;
}) {
  const invalidRefs = getInvalidStoryCharacterReferences(input);
  if (invalidRefs.length > 0) {
    throw new Error("Story characters must be registered in this map first.");
  }
}

export type StoryGraphInput = z.infer<typeof storyGraphSchema>;
