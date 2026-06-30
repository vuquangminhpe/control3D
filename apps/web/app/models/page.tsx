"use client";

import { useEffect, useMemo, useState } from "react";
import { MixamoAssetWorkspace } from "@/components/MixamoAssetWorkspace";
import type {
  AnimationAssetRecord,
  ModelRecord,
} from "@/lib/model-store";

async function getJson<T>(url: string, fallback: T) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) return fallback;
  return payload.data as T;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [animations, setAnimations] = useState<AnimationAssetRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [modelRows, animationRows] = await Promise.all([
        getJson<ModelRecord[]>("/api/models?sort=name", []),
        getJson<AnimationAssetRecord[]>("/api/animations", []),
      ]);
      if (!cancelled) {
        setModels(modelRows);
        setAnimations(animationRows);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const characters = useMemo(
    () => models.filter((model) => model.category === "character"),
    [models],
  );
  const stats = useMemo(
    () => ({
      totalModels: models.length,
      totalDownloads: models.reduce(
        (total, model) => total + Number(model.downloadCount ?? 0),
        0,
      ),
    }),
    [models],
  );

  return (
    <MixamoAssetWorkspace
      animations={animations}
      characters={characters}
      stats={stats}
    />
  );
}
