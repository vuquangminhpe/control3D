import { MixamoAssetWorkspace } from "@/components/MixamoAssetWorkspace";
import {
  getStats,
  listAnimationAssets,
  listModels,
} from "@/lib/model-store";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const [allModels, animations, stats] = await Promise.all([
    listModels({ sort: "name" }),
    listAnimationAssets({ sort: "name" }),
    getStats(),
  ]);

  const characters = allModels.filter((model) => model.category === "character");

  return (
    <MixamoAssetWorkspace
      animations={animations}
      characters={characters}
      stats={stats}
    />
  );
}
