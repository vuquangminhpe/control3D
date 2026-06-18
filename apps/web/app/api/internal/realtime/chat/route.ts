export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { chatMessageSchema } from "@control3d/shared/schemas/chat";
import { createChatMessage } from "@/lib/model-store";
import { isInternalRealtimeRequest } from "@/lib/realtime/internal-secret";
import { fail, ok } from "@/lib/response";

export async function POST(request: Request) {
  if (!isInternalRealtimeRequest(request)) {
    return fail("Unauthorized", 401);
  }

  const payload = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid realtime chat message", 422);
  }

  const message = await createChatMessage({
    id: parsed.data.id,
    mapId: parsed.data.mapId,
    sessionId: parsed.data.sessionId ?? null,
    userId: parsed.data.userId,
    displayName: parsed.data.displayName,
    channel: parsed.data.channel === "party" ? "map" : parsed.data.channel,
    body: parsed.data.body,
    createdAt: parsed.data.createdAt,
  });

  return ok({ message });
}
