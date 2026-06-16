export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getLevelById } from "@/lib/model-store";
import { ok, fail } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  const map = await getLevelById(id);
  if (!map || map.status !== "published") {
    return fail("Published map not found", 404);
  }

  return ok(
    map.mapCharacters
      .filter((entry) => entry.role === "playable" || entry.storyEnabled)
      .map((entry) => ({
        id: entry.id,
        characterId: entry.characterId,
        name: entry.displayLabel || entry.name,
        fileUrl: entry.fileUrl,
        format: entry.format,
        role: entry.role,
        isDefault: entry.isDefault,
        pointPrice: entry.pointPrice,
        storyEnabled: entry.storyEnabled,
      })),
  );
}
