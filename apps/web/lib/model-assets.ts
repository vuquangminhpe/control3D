import type { OptimizationMetadata } from "@/lib/3d/types";
import type { ModelRecord } from "@/lib/model-store";

export type ModelAssetKind = "delivery" | "original";

function isOptimizationMetadata(value: unknown): value is OptimizationMetadata {
  return !!value && typeof value === "object" && "deliveryFileUrl" in value;
}

export function getOptimizationMetadata(
  model: Pick<ModelRecord, "customProps">,
) {
  if (!model.customProps || typeof model.customProps !== "object") {
    return null;
  }

  const optimization = (model.customProps as Record<string, unknown>)
    .optimization;

  return isOptimizationMetadata(optimization) ? optimization : null;
}

export function resolveModelAssetUrl(
  model: Pick<ModelRecord, "customProps" | "fileUrl">,
  asset: ModelAssetKind,
) {
  const optimization = getOptimizationMetadata(model);

  if (asset === "original") {
    return optimization?.originalFileUrl ?? model.fileUrl;
  }

  return optimization?.deliveryFileUrl ?? model.fileUrl;
}