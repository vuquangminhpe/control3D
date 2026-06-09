export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resolveModelAssetUrl, type ModelAssetKind } from "@/lib/model-assets";
import { fail } from "@/lib/response";
import { incrementModelDownload } from "@/lib/model-store";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const model = await incrementModelDownload(id);

  if (!model) {
    return fail("Model not found", 404);
  }

  const asset = (new URL(request.url).searchParams.get("asset")
    === "original"
    ? "original"
    : "delivery") as ModelAssetKind;

  return NextResponse.redirect(
    new URL(resolveModelAssetUrl(model, asset), request.url),
  );
}
