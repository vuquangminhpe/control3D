export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { getLevelById } from "@/lib/model-store";
import { createRealtimeJoinToken } from "@/lib/realtime/join-token";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

function getRealtimeUrl(request: Request) {
  if (process.env.CONTROL3D_REALTIME_URL) return process.env.CONTROL3D_REALTIME_URL;
  const url = new URL(request.url);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.hostname}:3005`;
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
    token = createRealtimeJoinToken({
      mapId: id,
      userId: identity.userId,
      displayName: identity.displayName,
      characterName: map.playerCharacter?.name ?? null,
      characterFileUrl: map.playerCharacter?.fileUrl ?? null,
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
