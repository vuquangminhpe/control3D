export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/session";
import { getLevelById } from "@/lib/model-store";
import { listPresencePlayers, upsertPresencePlayer } from "@/lib/presence-store";
import {
  isRealtimeHttpFallbackEnabled,
  realtimeHttpFallbackRequired,
} from "@/lib/realtime/http-fallback";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

const vector3Schema = z
  .array(z.number().finite())
  .length(3)
  .transform((value) => value as [number, number, number]);

const heartbeatSchema = z.object({
  position: vector3Schema,
  velocity: vector3Schema.optional(),
  characterName: z.string().trim().max(80).nullable().optional(),
  characterFileUrl: z.string().trim().max(2000).nullable().optional(),
  actionState: z.string().trim().max(40).optional(),
  activeActionName: z.string().trim().max(120).nullable().optional(),
  activeActionUrl: z.string().trim().max(2000).nullable().optional(),
});

async function getPresenceIdentity(request: Request) {
  const userAuth = await authenticateRequest(request, "user");
  if (userAuth?.subjectType === "user") {
    return {
      userId: userAuth.user.id,
      displayName: userAuth.user.displayName || userAuth.user.username,
      isAdmin: false,
    };
  }

  const adminAuth = await authenticateRequest(request, "admin");
  if (adminAuth?.subjectType === "admin") {
    return {
      userId: adminAuth.admin.id,
      displayName: `Admin ${adminAuth.admin.email.split("@")[0]}`,
      isAdmin: true,
    };
  }

  return null;
}

export async function GET(request: Request, { params }: Context) {
  if (!isRealtimeHttpFallbackEnabled()) {
    return realtimeHttpFallbackRequired();
  }

  const { id } = await params;
  const identity = await getPresenceIdentity(request);
  if (!identity) {
    return fail("Unauthorized", 401);
  }

  const map = await getLevelById(id);
  if (!map) {
    return fail("Map not found", 404);
  }
  if (!identity.isAdmin && map.status !== "published") {
    return fail("Published map not found", 404);
  }

  return ok({
    players: listPresencePlayers(id, identity.userId),
  });
}

export async function POST(request: Request, { params }: Context) {
  if (!isRealtimeHttpFallbackEnabled()) {
    return realtimeHttpFallbackRequired();
  }

  const { id } = await params;
  const identity = await getPresenceIdentity(request);
  if (!identity) {
    return fail("Unauthorized", 401);
  }

  const map = await getLevelById(id);
  if (!map) {
    return fail("Map not found", 404);
  }
  if (!identity.isAdmin && map.status !== "published") {
    return fail("Published map not found", 404);
  }

  const payload = await request.json().catch(() => null);
  const parsed = heartbeatSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid presence heartbeat", 422);
  }

  const player = upsertPresencePlayer({
    mapId: id,
    userId: identity.userId,
    displayName: identity.displayName,
    position: parsed.data.position,
    velocity: parsed.data.velocity ?? [0, 0, 0],
    characterName: parsed.data.characterName ?? null,
    characterFileUrl: parsed.data.characterFileUrl ?? null,
    actionState: parsed.data.actionState || "idle",
    activeActionName: parsed.data.activeActionName ?? null,
    activeActionUrl: parsed.data.activeActionUrl ?? null,
  });

  return ok({ player });
}
