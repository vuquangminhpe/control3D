import Link from "next/link";
import { InspectViewer } from "@/components/ModelViewer";
import { getOptimizationMetadata } from "@/lib/model-assets";
import { getStats, listModels, type ModelRecord } from "@/lib/model-store";

type AssetTab = "all" | "characters" | "maps" | "props" | "animations";

type ModelsPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    format?: string;
    sort?: string;
    tab?: string;
  }>;
};

const tabs = [
  ["all", "All"],
  ["characters", "Characters"],
  ["maps", "Maps"],
  ["props", "Props"],
  ["animations", "Animations"],
] satisfies Array<[AssetTab, string]>;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getAssetBadge(model: ModelRecord) {
  const optimization = getOptimizationMetadata(model);
  if (model.format === "glb") {
    return optimization?.status === "optimized"
      ? "Optimized GLB delivery"
      : "GLB delivery";
  }
  if (model.hasAnimations || model.format === "fbx") return "Animation-ready asset";
  return `${model.format.toUpperCase()} asset`;
}

function filterByTab(models: ModelRecord[], tab: AssetTab) {
  switch (tab) {
    case "characters":
      return models.filter((model) => model.category === "character");
    case "maps":
      return models.filter((model) => model.category === "environment" || model.category === "architecture");
    case "props":
      return models.filter((model) => model.category === "prop");
    case "animations":
      return models.filter((model) => model.hasAnimations || model.format === "fbx");
    default:
      return models;
  }
}

function buildTabHref(tab: AssetTab, filters: Awaited<ModelsPageProps["searchParams"]>) {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  if (filters.q) params.set("q", filters.q);
  if (filters.format) params.set("format", filters.format);
  if (filters.sort) params.set("sort", filters.sort);
  return `/models${params.size ? `?${params.toString()}` : ""}`;
}

export default async function ModelsPage({ searchParams }: ModelsPageProps) {
  const filters = await searchParams;
  const activeTab = (["characters", "maps", "props", "animations"].includes(filters.tab ?? "")
    ? filters.tab
    : "all") as AssetTab;

  const [allModels, stats] = await Promise.all([
    listModels({
      q: filters.q,
      format: filters.format,
      sort: filters.sort,
    }),
    getStats(),
  ]);
  const categoryFilteredModels = filters.category
    ? allModels.filter((model) => model.category === filters.category)
    : allModels;
  const models = filterByTab(categoryFilteredModels, activeTab);
  const selectedModel = models[0] ?? null;
  const tabCounts = {
    all: allModels.length,
    characters: filterByTab(allModels, "characters").length,
    maps: filterByTab(allModels, "maps").length,
    props: filterByTab(allModels, "props").length,
    animations: filterByTab(allModels, "animations").length,
  } satisfies Record<AssetTab, number>;

  return (
    <main className="mixamo-page">
      <section className="mixamo-browser-shell">
        <aside className="asset-filter-panel">
          <div className="asset-panel-head">
            <span>CONTROL3D LIBRARY</span>
            <h1>Models</h1>
            <p>{stats.totalModels} uploaded assets, {stats.totalDownloads} downloads tracked.</p>
          </div>

          <form className="asset-search-form">
            <input name="q" placeholder="Search models" defaultValue={filters.q ?? ""} />
            {activeTab !== "all" ? <input name="tab" type="hidden" value={activeTab} /> : null}
            <select name="category" defaultValue={filters.category ?? ""}>
              <option value="">All categories</option>
              <option value="character">Characters</option>
              <option value="environment">Environments</option>
              <option value="prop">Props</option>
              <option value="architecture">Architecture</option>
              <option value="vehicle">Vehicles</option>
              <option value="other">Other</option>
            </select>
            <select name="format" defaultValue={filters.format ?? ""}>
              <option value="">All formats</option>
              <option value="glb">GLB</option>
              <option value="gltf">GLTF</option>
              <option value="fbx">FBX</option>
              <option value="obj">OBJ</option>
              <option value="stl">STL</option>
              <option value="ply">PLY</option>
              <option value="usdz">USDZ</option>
            </select>
            <select name="sort" defaultValue={filters.sort ?? ""}>
              <option value="">Newest</option>
              <option value="name">Name</option>
              <option value="downloads">Downloads</option>
            </select>
            <button type="submit">Filter</button>
          </form>

          <Link className="mixamo-primary-action" href="/upload">Register object</Link>
        </aside>

        <section className="asset-stage-panel">
          {selectedModel ? (
            <>
              <div className="stage-titlebar">
                <div>
                  <span>{selectedModel.category}</span>
                  <h2>{selectedModel.name}</h2>
                  <div className="asset-badge-row">
                    <span className="asset-badge">{getAssetBadge(selectedModel)}</span>
                    <span className="asset-badge muted">{selectedModel.format.toUpperCase()}</span>
                  </div>
                </div>
                <div className="stage-actions">
                  <Link href={`/models/${selectedModel.id}`}>Details</Link>
                  <Link href={`/models/${selectedModel.id}/edit`}>Edit</Link>
                </div>
              </div>
              <div className="mixamo-stage-viewer">
                <InspectViewer src={selectedModel.fileUrl} />
              </div>
            </>
          ) : (
            <div className="asset-empty-state">
              <h2>No models found</h2>
              <p>Upload a GLB, FBX, OBJ, STL, PLY, or USDZ file to start building your reusable game asset library.</p>
              <Link className="mixamo-primary-action" href="/upload">Upload first model</Link>
            </div>
          )}
        </section>

        <aside className="asset-list-panel">
          <div className="asset-list-head">
            <span>Asset browser</span>
            <strong>{models.length}</strong>
          </div>
          <nav className="asset-type-tabs" aria-label="Asset type">
            {tabs.map(([tab, label]) => (
              <Link
                className={activeTab === tab ? "active" : ""}
                href={buildTabHref(tab, filters) as never}
                key={tab}
              >
                <span>{label}</span>
                <small>{tabCounts[tab]}</small>
              </Link>
            ))}
          </nav>
          <div className="mixamo-asset-list">
            {models.map((model, index) => (
              <Link className="mixamo-asset-row" href={`/models/${model.id}`} key={model.id}>
                <div className="asset-row-preview">
                  {index < 4 ? (
                    <InspectViewer src={model.fileUrl} variant="preview" />
                  ) : (
                    <span>{model.format.toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <strong>{model.name}</strong>
                  <span>{model.format.toUpperCase()} - {formatBytes(model.fileSize)}</span>
                  <em>{getAssetBadge(model)}</em>
                </div>
                <small>{model.category}</small>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
