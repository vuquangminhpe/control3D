import Link from "next/link";
import { getElementTypes, getStats, listModels } from "@/lib/model-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function GalleryPage({ searchParams }: PageProps) {
  const params = (searchParams ? await searchParams : {}) ?? {};
  const q = asString(params.q);
  const category = asString(params.category);
  const format = asString(params.format);
  const sort = asString(params.sort);

  const [models, stats, elementTypes] = await Promise.all([
    listModels({
      q: q || undefined,
      category: category || undefined,
      format: format || undefined,
      sort: sort || undefined,
    }),
    getStats(),
    getElementTypes(),
  ]);

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>3D Object Gallery</h1>
          <p>
            Local MVP running on SQLite file storage and local model uploads.
          </p>
        </div>
        <div className="inline-actions">
          <Link className="button" href="/upload">
            Upload model
          </Link>
        </div>
      </div>

      <div className="grid grid-3 stat-grid">
        <div className="card subtle">
          <strong>Total models</strong>
          <div className="stat-value">{stats.totalModels}</div>
        </div>
        <div className="card subtle">
          <strong>Total downloads</strong>
          <div className="stat-value">{stats.totalDownloads}</div>
        </div>
        <div className="card subtle">
          <strong>Element types</strong>
          <div className="stat-value">{elementTypes.length}</div>
        </div>
      </div>

      <form className="card filters" method="GET">
        <div className="grid form-grid">
          <label className="field">
            <span>Search</span>
            <input
              defaultValue={q}
              name="q"
              placeholder="Name, description, tags"
              type="text"
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select defaultValue={category} name="category">
              <option value="">All</option>
              <option value="architecture">Architecture</option>
              <option value="character">Character</option>
              <option value="vehicle">Vehicle</option>
              <option value="environment">Environment</option>
              <option value="prop">Prop</option>
              <option value="furniture">Furniture</option>
              <option value="electronics">Electronics</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Format</span>
            <select defaultValue={format} name="format">
              <option value="">All</option>
              <option value="glb">GLB</option>
              <option value="gltf">GLTF</option>
              <option value="obj">OBJ</option>
              <option value="fbx">FBX</option>
              <option value="stl">STL</option>
              <option value="ply">PLY</option>
              <option value="usdz">USDZ</option>
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select defaultValue={sort} name="sort">
              <option value="">Newest</option>
              <option value="downloads">Most downloaded</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
          <div className="inline-actions full-width">
            <button className="button" type="submit">
              Apply filters
            </button>
            <Link className="button secondary" href="/">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="grid grid-2 listing-grid">
        {models.length === 0 ? (
          <div className="card empty-state">
            <h2>No models yet</h2>
            <p>
              Upload the first GLB/GLTF/OBJ asset to start the local library.
            </p>
          </div>
        ) : (
          models.map((model) => {
            const elementType = elementTypes.find(
              (type) => type.id === model.elementTypeId,
            );

            return (
              <article className="card listing-card" key={model.id}>
                <div className="listing-head">
                  <div>
                    <h2>{model.name}</h2>
                    <p>{model.description || "No description yet"}</p>
                  </div>
                  <span className="pill">{model.format.toUpperCase()}</span>
                </div>
                <div className="meta-row">
                  <span>{model.category}</span>
                  <span>{formatBytes(model.fileSize)}</span>
                  <span>{model.downloadCount} downloads</span>
                  <span>{model.viewCount} views</span>
                  {elementType ? <span>{elementType.name}</span> : null}
                </div>
                <div className="meta-row tags-row">
                  {model.tags.length ? (
                    model.tags.map((tag) => (
                      <span className="pill" key={tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span>No tags</span>
                  )}
                </div>
                <div className="inline-actions">
                  <Link className="button" href={`/models/${model.id}`}>
                    Open
                  </Link>
                  <Link
                    className="button secondary"
                    href={`/models/${model.id}/edit`}
                  >
                    Edit
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
