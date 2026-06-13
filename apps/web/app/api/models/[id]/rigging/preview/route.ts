export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { normalizeRiggingPreviewView, renderRiggingPreview } from "@/lib/blender-autorig";
import { fail } from "@/lib/response";
import { getModelById } from "@/lib/model-store";
import { isHumanoidRigCandidate } from "@/lib/model-rigging";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const model = await getModelById(id);
  const view = normalizeRiggingPreviewView(new URL(request.url).searchParams.get("view"));

  if (!model) return fail("Model not found", 404);
  if (!isHumanoidRigCandidate(model)) {
    return fail("Only humanoid character assets can render rigging previews", 422);
  }

  try {
    const preview = await renderRiggingPreview(model, view);
    return new NextResponse(preview.buffer, {
      headers: {
        "cache-control": "no-store",
        "content-type": "image/png",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to render rigging preview", 500);
  }
}
