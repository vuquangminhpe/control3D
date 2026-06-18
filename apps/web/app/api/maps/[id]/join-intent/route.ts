export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import {
  getLevelById,
  getModelById,
  grantUserCharacter,
  userOwnsCharacter,
} from "@/lib/model-store";
import { createRealtimeJoinToken } from "@/lib/realtime/join-token";
import { fail, ok } from "@/lib/response";
import type { LevelCharacter, MapCharacter } from "@/store/gameStore";

type Context = {
  params: Promise<{ id: string }>;
};

const REALTIME_ACTION_TRIGGERS = new Set([
  "none",
  "attack",
  "talk",
  "move",
  "custom",
  "crouch",
  "jump",
  "idle",
]);

function getRealtimeUrl(request: Request) {
  if (process.env.CONTROL3D_REALTIME_URL) return process.env.CONTROL3D_REALTIME_URL;
  const url = new URL(request.url);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.hostname}:3005`;
}

function sanitizeCharacterAction(action: unknown) {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const name = typeof record.name === "string" ? record.name : "";
  const fileUrl = typeof record.fileUrl === "string" ? record.fileUrl : "";
  if (!id || !name || !fileUrl) return null;
  return {
    id: id.slice(0, 120),
    name: name.slice(0, 120),
    fileUrl: fileUrl.slice(0, 2000),
    enabled: record.enabled !== false,
    trigger:
      typeof record.trigger === "string" && REALTIME_ACTION_TRIGGERS.has(record.trigger)
        ? record.trigger
        : "none",
    keyBinding: typeof record.keyBinding === "string" ? record.keyBinding.slice(0, 80) : null,
    durationMs:
      typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
        ? Math.max(1, Math.round(record.durationMs))
        : null,
  };
}

async function getCharacterActions(modelId: string | null | undefined) {
  if (!modelId) return [];
  const model = await getModelById(modelId);
  const manifest = model?.customProps?.characterAnimation;
  if (!manifest || typeof manifest !== "object") return [];
  const actions = (manifest as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions
    .map(sanitizeCharacterAction)
    .filter((action): action is NonNullable<ReturnType<typeof sanitizeCharacterAction>> => Boolean(action))
    .slice(0, 40);
}

type SelectedJoinCharacter = {
  characterId: string | null;
  modelId: string | null;
  name: string | null;
  fileUrl: string | null;
  pointPrice: number;
  isDefault: boolean;
};

function selectJoinCharacter(
  mapCharacters: MapCharacter[],
  fallback: LevelCharacter | null | undefined,
  requestedCharacterId: string | null,
): SelectedJoinCharacter | null {
  const playable = mapCharacters
    .filter((entry) => entry.role === "playable")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (requestedCharacterId) {
    const requested = playable.find(
      (entry) =>
        entry.characterId === requestedCharacterId ||
        entry.id === requestedCharacterId ||
        entry.modelId === requestedCharacterId,
    );
    if (!requested) return null;
    return {
      characterId: requested.characterId,
      modelId: requested.modelId,
      name: requested.displayLabel || requested.name,
      fileUrl: requested.fileUrl,
      pointPrice: requested.pointPrice,
      isDefault: requested.isDefault,
    };
  }

  const selected = playable.find((entry) => entry.isDefault) ?? playable[0];
  if (selected) {
    return {
      characterId: selected.characterId,
      modelId: selected.modelId,
      name: selected.displayLabel || selected.name,
      fileUrl: selected.fileUrl,
      pointPrice: selected.pointPrice,
      isDefault: selected.isDefault,
    };
  }

  if (!fallback) return null;
  return {
    characterId: fallback.modelId,
    modelId: fallback.modelId,
    name: fallback.name,
    fileUrl: fallback.fileUrl,
    pointPrice: 0,
    isDefault: true,
  };
}

async function getJoinIdentity(request: Request) {
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

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { characterId?: unknown } | null;
  const requestedCharacterId =
    typeof body?.characterId === "string" && body.characterId.trim()
      ? body.characterId.trim()
      : null;
  const identity = await getJoinIdentity(request);
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

  let token: string;
  try {
    const selectedCharacter = selectJoinCharacter(
      map.mapCharacters,
      map.playerCharacter,
      requestedCharacterId,
    );
    if (!selectedCharacter) {
      return fail("Character is not registered for this map", 403);
    }
    if (
      !identity.isAdmin &&
      selectedCharacter.characterId &&
      selectedCharacter.pointPrice > 0 &&
      !(await userOwnsCharacter(identity.userId, selectedCharacter.characterId))
    ) {
      return fail("Character is locked", 402);
    }
    if (
      !identity.isAdmin &&
      selectedCharacter.characterId &&
      (selectedCharacter.isDefault || selectedCharacter.pointPrice <= 0)
    ) {
      await grantUserCharacter(identity.userId, selectedCharacter.characterId, "free");
    }
    const characterActions = await getCharacterActions(selectedCharacter.modelId);
    token = createRealtimeJoinToken({
      mapId: id,
      userId: identity.userId,
      displayName: identity.displayName,
      characterId: selectedCharacter.characterId,
      characterName: selectedCharacter.name,
      characterFileUrl: selectedCharacter.fileUrl,
      characterActions,
      isAdmin: identity.isAdmin,
    });
  } catch {
    return fail("Realtime server is not configured", 503);
  }
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  return ok({
    mapId: id,
    realtimeUrl: getRealtimeUrl(request),
    joinToken: token,
    roomId: `map:${id}`,
    expiresAt,
  });
}
