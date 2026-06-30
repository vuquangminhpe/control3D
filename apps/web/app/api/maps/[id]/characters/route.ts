export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getLevelById, listUserCharacters } from "@/lib/model-store";
import { authenticateRequest } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const map = await getLevelById(id);
  if (!map || map.status !== "published") {
    return fail("Published map not found", 404);
  }

  const auth = await authenticateRequest(request, "user");
  const owned = auth?.subjectType === "user"
    ? new Set((await listUserCharacters(auth.user.id)).map((entry) => entry.characterId))
    : new Set<string>();

  return ok(
    map.mapCharacters
      .filter((entry) => entry.role === "playable" || entry.storyEnabled)
      .map((entry) => ({
        id: entry.id,
        characterId: entry.characterId,
        modelId: entry.modelId,
        name: entry.displayLabel || entry.name,
        fileUrl: entry.fileUrl,
        format: entry.format,
        role: entry.role,
        isDefault: entry.isDefault,
        pointPrice: entry.pointPrice,
        storyEnabled: entry.storyEnabled,
        owned: entry.pointPrice <= 0 || entry.isDefault || owned.has(entry.characterId),
        locked: entry.pointPrice > 0 && !entry.isDefault && !owned.has(entry.characterId),
        canUse: entry.pointPrice <= 0 || entry.isDefault || owned.has(entry.characterId),
      })),
  );
}
