export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getLevelById } from "@/lib/model-store";
import { isInternalRealtimeRequest } from "@/lib/realtime/internal-secret";
import { fail, ok } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  if (!isInternalRealtimeRequest(request)) {
    return fail("Unauthorized", 401);
  }

  const { id } = await params;
  const url = new URL(request.url);
  const allowDraftPreview = url.searchParams.get("preview") === "1";
  const map = await getLevelById(id);
  if (!map) {
    return fail("Map not found", 404);
  }
  if (!allowDraftPreview && map.status !== "published") {
    return fail("Published map not found", 404);
  }

  return ok({
    map: {
      id: map.id,
      name: map.name,
      status: map.status,
      mapModelUrl: map.mapModelUrl,
      playerSpawn: map.playerSpawn,
      robotSpawn: map.robotSpawn,
      robotStory: map.robotStory,
      storyGraph: map.storyGraph,
      zombieSpawns: map.zombieSpawns,
      mapCharacters: map.mapCharacters,
      placedObjects: map.placedObjects,
      maxPlayers: map.maxPlayers,
      updatedAt: map.updatedAt,
    },
  });
}
