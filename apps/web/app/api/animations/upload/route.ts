export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createAnimationAssetFromUpload } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail("Invalid form data", 422);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("Animation file is required", 422);
  }

  try {
    const animation = await createAnimationAssetFromUpload({
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      name:
        typeof formData.get("name") === "string"
          ? String(formData.get("name"))
          : undefined,
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : undefined,
      tags:
        typeof formData.get("tags") === "string"
          ? String(formData.get("tags"))
          : undefined,
    });

    return ok(animation, { status: 201 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Animation upload failed", 422);
  }
}
