export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { getLevelById, purchaseUserCharacter } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const auth = await authenticateRequest(request, "user");
  if (!auth || auth.subjectType !== "user") {
    return fail("Unauthorized", 401);
  }

  const { id, characterId } = await params;
  const map = await getLevelById(id);
  if (!map || map.status !== "published") {
    return fail("Published map not found", 404);
  }

  const character = map.mapCharacters.find(
    (entry) =>
      entry.role === "playable" &&
      (entry.characterId === characterId ||
        entry.id === characterId ||
        entry.modelId === characterId),
  );
  if (!character) {
    return fail("Character is not registered for this map", 404);
  }

  try {
    return ok(
      await purchaseUserCharacter({
        userId: auth.user.id,
        mapId: id,
        character,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to buy character", 400);
  }
}
