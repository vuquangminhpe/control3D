export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { z } from "zod";
import { awardUserPoints } from "@/lib/model-store";
import { isInternalRealtimeRequest } from "@/lib/realtime/internal-secret";
import { fail, ok } from "@/lib/response";

const rewardSchema = z.object({
  id: z.string().min(1).max(140),
  userId: z.string().min(1),
  mapId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  enemyId: z.string().min(1).optional(),
  enemyType: z.enum(["zombie_low", "zombie_fantasy"]).optional(),
  amount: z.number().int().positive().max(100_000),
  type: z.literal("monster_kill").default("monster_kill"),
});

export async function POST(request: Request) {
  if (!isInternalRealtimeRequest(request)) {
    return fail("Unauthorized", 401);
  }

  const payload = await request.json().catch(() => null);
  const parsed = rewardSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid reward payload", 422);
  }

  try {
    const result = await awardUserPoints({
      id: parsed.data.id,
      userId: parsed.data.userId,
      mapId: parsed.data.mapId ?? null,
      sessionId: parsed.data.sessionId ?? null,
      type: parsed.data.type,
      amount: parsed.data.amount,
      metadata: {
        source: "realtime",
        enemyId: parsed.data.enemyId,
        enemyType: parsed.data.enemyType,
      },
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to award points", 400);
  }
}
