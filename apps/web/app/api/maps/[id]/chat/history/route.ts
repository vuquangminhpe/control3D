export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { chatHistoryQuerySchema } from "@control3d/shared/schemas/chat";
import { authenticateRequest } from "@/lib/auth/session";
import { getLevelById, listChatMessagesForMap } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

async function getChatHistoryIdentity(request: Request) {
  const userAuth = await authenticateRequest(request, "user");
  if (userAuth?.subjectType === "user") {
    return { isAdmin: false };
  }

  const adminAuth = await authenticateRequest(request, "admin");
  if (adminAuth?.subjectType === "admin") {
    return { isAdmin: true };
  }

  return null;
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const identity = await getChatHistoryIdentity(request);
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

  const url = new URL(request.url);
  const parsed = chatHistoryQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return fail("Invalid chat history query", 422);
  }

  const messages = await listChatMessagesForMap(id, parsed.data.limit);
  return ok({ messages });
}
