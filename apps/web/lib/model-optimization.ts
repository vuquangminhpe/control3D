import { writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeOversizedSourceWithBlender } from "@/lib/source-scale-normalization";

type SupportedUploadFormat =
  | "glb"
  | "gltf"
  | "obj"
  | "fbx"
  | "stl"
  | "ply"
  | "usdz";
type OptimizableFormat = "glb" | "gltf";
type GltfDocument = Record<string, unknown>;
type OptimizationStatus = "optimized" | "skipped";
type SourceScaleNormalizationStatus = "normalized" | "skipped";
type DeliveryResult = {
  customProps: Record<string, unknown>;
  fileSize: number;
  fileUrl: string;
  format: SupportedUploadFormat;
};
type GltfPipelineModule = {
  glbToGltf: (glb: Buffer) => Promise<{ gltf: GltfDocument }>;
  gltfToGlb: (gltf: GltfDocument) => Promise<{ glb: Uint8Array | Buffer }>;
  processGltf: (
    gltf: GltfDocument,
    options: { dracoOptions: { compressionLevel: number } },
  ) => Promise<{ gltf: GltfDocument }>;
};

let pipelinePromise: Promise<GltfPipelineModule> | null = null;

function isOptimizableFormat(
  format: SupportedUploadFormat,
): format is OptimizableFormat {
  return format === "glb" || format === "gltf";
}

function hasExternalResourceReferences(gltf: GltfDocument) {
  const resources = [
    ...(Array.isArray(gltf.buffers) ? gltf.buffers : []),
    ...(Array.isArray(gltf.images) ? gltf.images : []),
  ];

  return resources.some((entry) => {
    if (!entry || typeof entry !== "object" || !("uri" in entry)) {
      return false;
    }

    const uri = entry.uri;
    return (
      typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:")
    );
  });
}

async function loadPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = import("gltf-pipeline").then((module) => {
      const candidate = (
        "default" in module && module.default ? module.default : module
      ) as Partial<GltfPipelineModule>;

      if (
        typeof candidate.glbToGltf !== "function" ||
        typeof candidate.gltfToGlb !== "function" ||
        typeof candidate.processGltf !== "function"
      ) {
        throw new Error("gltf-pipeline exports are unavailable");
      }

      return candidate as GltfPipelineModule;
    });
  }

  return pipelinePromise;
}

async function buildDracoDelivery(
  fileBuffer: Buffer,
  format: OptimizableFormat,
) {
  const pipeline = await loadPipeline();

  if (format === "glb") {
    const unpacked = await pipeline.glbToGltf(fileBuffer);
    const processed = await pipeline.processGltf(unpacked.gltf, {
      dracoOptions: { compressionLevel: 10 },
    });
    const packed = await pipeline.gltfToGlb(processed.gltf);

    return {
      buffer: Buffer.from(packed.glb),
      format: "glb" as const,
      skippedReason: null,
    };
  }

  const parsed = JSON.parse(fileBuffer.toString("utf8")) as GltfDocument;
  if (hasExternalResourceReferences(parsed)) {
    return {
      buffer: fileBuffer,
      format,
      skippedReason: "external_gltf_resources",
    };
  }

  const processed = await pipeline.processGltf(parsed, {
    dracoOptions: { compressionLevel: 10 },
  });
  const packed = await pipeline.gltfToGlb(processed.gltf);

  return {
    buffer: Buffer.from(packed.glb),
    format: "glb" as const,
    skippedReason: null,
  };
}

function buildOptimizationMetadata(input: {
  compression: "draco" | "none" | "source-scale-normalized";
  deliveryFileSize: number;
  deliveryFileUrl: string;
  originalFileSize: number;
  originalFileUrl: string;
  sourceFormat: SupportedUploadFormat;
  status: OptimizationStatus;
  statusReason: string | null;
}) {
  const savingsBytes = Math.max(
    0,
    input.originalFileSize - input.deliveryFileSize,
  );

  return {
    optimization: {
      compression: input.compression,
      deliveryFileSize: input.deliveryFileSize,
      deliveryFileUrl: input.deliveryFileUrl,
      originalFileSize: input.originalFileSize,
      originalFileUrl: input.originalFileUrl,
      savingsBytes,
      savingsRatio:
        input.originalFileSize > 0
          ? Number((savingsBytes / input.originalFileSize).toFixed(4))
          : 0,
      sourceFormat: input.sourceFormat,
      status: input.status,
      statusReason: input.statusReason,
    },
  } satisfies Record<string, unknown>;
}

function buildSourceScaleNormalizationMetadata(input: {
  deliveryFileSize?: number;
  deliveryFileUrl?: string;
  recommendedSourceScale?: number;
  report?: unknown;
  status: SourceScaleNormalizationStatus;
  statusReason: string | null;
}) {
  return {
    sourceScaleNormalization: {
      deliveryFileSize: input.deliveryFileSize ?? null,
      deliveryFileUrl: input.deliveryFileUrl ?? null,
      recommendedSourceScale: input.recommendedSourceScale ?? null,
      report: input.report ?? null,
      status: input.status,
      statusReason: input.statusReason,
    },
  } satisfies Record<string, unknown>;
}

async function tryBuildSourceScaleDelivery(input: {
  format: SupportedUploadFormat;
  modelDir: string;
  originalFilePath: string;
}) {
  const sourceFormat =
    input.format === "fbx" || input.format === "obj"
      ? input.format
      : input.format === "glb" || input.format === "gltf"
        ? "gltf"
        : null;
  if (!sourceFormat) {
    return {
      status: "skipped" as const,
      statusReason: "source_format_not_supported",
    };
  }

  const deliveryFileName = "delivery.glb";
  const deliveryFileUrl = deliveryFileName;
  const outputPath = path.join(input.modelDir, deliveryFileName);
  const reportPath = path.join(input.modelDir, "source-scale-normalization.json");
  const scriptPath = path.join(input.modelDir, "control3d-source-scale-normalize.py");

  try {
    const normalized = await normalizeOversizedSourceWithBlender({
      outputPath,
      reportPath,
      scriptPath,
      sourceFormat,
      sourcePath: input.originalFilePath,
    });
    if (!normalized) {
      return {
        status: "skipped" as const,
        statusReason: "source_scale_within_target_range",
      };
    }
    return {
      deliveryFileSize: normalized.deliveryFileSize,
      deliveryFileUrl,
      recommendedSourceScale: Number(normalized.recommendedSourceScale.toFixed(6)),
      report: normalized.report,
      status: "normalized" as const,
      statusReason: null,
    };
  } catch (error) {
    return {
      status: "skipped" as const,
      statusReason:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "blender_not_found"
          : error instanceof Error
            ? error.message
            : "source_scale_normalization_failed",
    };
  }
}

export async function persistUploadWithDelivery(input: {
  fileBuffer: Buffer;
  format: SupportedUploadFormat;
  modelDir: string;
  modelId: string;
}): Promise<DeliveryResult> {
  const originalFileName = `original.${input.format}`;
  const originalFileUrl = `/uploads/models/${input.modelId}/${originalFileName}`;
  const originalFilePath = path.join(input.modelDir, originalFileName);
  await writeFile(
    originalFilePath,
    input.fileBuffer,
  );

  const sourceScaleDelivery = await tryBuildSourceScaleDelivery({
    format: input.format,
    modelDir: input.modelDir,
    originalFilePath,
  });
  if (sourceScaleDelivery.status === "normalized") {
    const deliveryFileUrl = `/uploads/models/${input.modelId}/${sourceScaleDelivery.deliveryFileUrl}`;
    return {
      customProps: {
        ...buildOptimizationMetadata({
          compression: "source-scale-normalized",
          deliveryFileSize: sourceScaleDelivery.deliveryFileSize,
          deliveryFileUrl,
          originalFileSize: input.fileBuffer.byteLength,
          originalFileUrl,
          sourceFormat: input.format,
          status: "optimized",
          statusReason: null,
        }),
        ...buildSourceScaleNormalizationMetadata({
          deliveryFileSize: sourceScaleDelivery.deliveryFileSize,
          deliveryFileUrl,
          recommendedSourceScale: sourceScaleDelivery.recommendedSourceScale,
          report: sourceScaleDelivery.report,
          status: "normalized",
          statusReason: null,
        }),
      },
      fileSize: sourceScaleDelivery.deliveryFileSize,
      fileUrl: deliveryFileUrl,
      format: "glb",
    };
  }

  if (!isOptimizableFormat(input.format)) {
    return {
      customProps: {
        ...buildOptimizationMetadata({
          compression: "none",
          deliveryFileSize: input.fileBuffer.byteLength,
          deliveryFileUrl: originalFileUrl,
          originalFileSize: input.fileBuffer.byteLength,
          originalFileUrl,
          sourceFormat: input.format,
          status: "skipped",
          statusReason: "format_not_optimizable",
        }),
        ...buildSourceScaleNormalizationMetadata({
          status: "skipped",
          statusReason: sourceScaleDelivery.statusReason,
        }),
      },
      fileSize: input.fileBuffer.byteLength,
      fileUrl: originalFileUrl,
      format: input.format,
    };
  }

  try {
    const optimized = await buildDracoDelivery(input.fileBuffer, input.format);

    if (optimized.skippedReason) {
      return {
        customProps: buildOptimizationMetadata({
          compression: "none",
          deliveryFileSize: input.fileBuffer.byteLength,
          deliveryFileUrl: originalFileUrl,
          originalFileSize: input.fileBuffer.byteLength,
          originalFileUrl,
          sourceFormat: input.format,
          status: "skipped",
          statusReason: optimized.skippedReason,
        }),
        fileSize: input.fileBuffer.byteLength,
        fileUrl: originalFileUrl,
        format: input.format,
      };
    }

    if (optimized.buffer.byteLength >= input.fileBuffer.byteLength) {
      return {
        customProps: buildOptimizationMetadata({
          compression: "none",
          deliveryFileSize: input.fileBuffer.byteLength,
          deliveryFileUrl: originalFileUrl,
          originalFileSize: input.fileBuffer.byteLength,
          originalFileUrl,
          sourceFormat: input.format,
          status: "skipped",
          statusReason: "no_delivery_gain",
        }),
        fileSize: input.fileBuffer.byteLength,
        fileUrl: originalFileUrl,
        format: input.format,
      };
    }

    const deliveryFileName = `delivery.${optimized.format}`;
    const deliveryFileUrl = `/uploads/models/${input.modelId}/${deliveryFileName}`;
    await writeFile(
      path.join(input.modelDir, deliveryFileName),
      optimized.buffer,
    );

    return {
      customProps: buildOptimizationMetadata({
        compression: "draco",
        deliveryFileSize: optimized.buffer.byteLength,
        deliveryFileUrl,
        originalFileSize: input.fileBuffer.byteLength,
        originalFileUrl,
        sourceFormat: input.format,
        status: "optimized",
        statusReason: null,
      }),
      fileSize: optimized.buffer.byteLength,
      fileUrl: deliveryFileUrl,
      format: optimized.format,
    };
  } catch (error) {
    return {
      customProps: buildOptimizationMetadata({
        compression: "none",
        deliveryFileSize: input.fileBuffer.byteLength,
        deliveryFileUrl: originalFileUrl,
        originalFileSize: input.fileBuffer.byteLength,
        originalFileUrl,
        sourceFormat: input.format,
        status: "skipped",
        statusReason:
          error instanceof Error
            ? error.message
            : "delivery_optimization_failed",
      }),
      fileSize: input.fileBuffer.byteLength,
      fileUrl: originalFileUrl,
      format: input.format,
    };
  }
}
