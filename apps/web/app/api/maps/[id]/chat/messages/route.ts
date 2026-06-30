export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { chatSendSchema } from "@control3d/shared/schemas/chat";
import { authenticateRequest } from "@/lib/auth/session";
import { createChatMessage, getLevelById } from "@/lib/model-store";
import {
  isRealtimeHttpFallbackEnabled,
  realtimeHttpFallbackRequired,
} from "@/lib/realtime/http-fallback";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

async function getChatIdentity(request: Request) {
  const userAuth = await authenticateRequest(request, "user");
  if (userAuth?.subjectType === "user") {
    return {
      userId: userAuth.user.id,
      displayName: userAuth.user.displayName || userAuth.user.username,
      sessionId: userAuth.sessionId,
      isAdmin: false,
    };
  }

  const adminAuth = await authenticateRequest(request, "admin");
  if (adminAuth?.subjectType === "admin") {
    return {
      userId: adminAuth.admin.id,
      displayName: `Admin ${adminAuth.admin.email.split("@")[0]}`,
      sessionId: adminAuth.sessionId,
      isAdmin: true,
    };
  }

  return null;
}

export async function POST(request: Request, { params }: Context) {
  if (!isRealtimeHttpFallbackEnabled()) {
    return realtimeHttpFallbackRequired();
  }

  const { id } = await params;
  const identity = await getChatIdentity(request);
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
  const parsed = chatSendSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid chat message", 422);
  }

  const message = await createChatMessage({
    mapId: id,
    sessionId: identity.sessionId,
    userId: identity.userId,
    displayName: identity.displayName,
    channel: parsed.data.channel,
    body: parsed.data.body,
  });

  return ok({ message });
}
