import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteModelButton } from "@/components/DeleteModelButton";
import { InspectViewer } from "@/components/ModelViewer";
import {
  getOptimizationMetadata,
  resolveModelAssetUrl,
} from "@/lib/model-assets";
import {
  getElementTypes,
  getVersionsForModel,
  incrementModelView,
} from "@/lib/model-store";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function ModelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const model = await incrementModelView(id);

  if (!model) {
    notFound();
  }

  const [versions, elementTypes] = await Promise.all([
    getVersionsForModel(id),
    getElementTypes(),
  ]);
  const elementType = elementTypes.find(
    (type) => type.id === model.elementTypeId,
  );
  const optimization = getOptimizationMetadata(model);
  const originalAssetUrl = resolveModelAssetUrl(model, "original");
  const deliveryAssetUrl = resolveModelAssetUrl(model, "delivery");
  const hasSeparateDelivery = originalAssetUrl !== deliveryAssetUrl;

  return (
    <main className="mixamo-page">
      <div className="mixamo-object-header">
        <div>
          <span>{model.category} · {model.format.toUpperCase()}</span>
          <h1>{model.name}</h1>
          <p>{model.description || "No description available"}</p>
        </div>
        <div className="stage-actions">
          <Link href="/models">Library</Link>
          <a
            href={`/api/models/${model.id}/download?asset=delivery`}
          >
            Download delivery
          </a>
          <a
            href={`/api/models/${model.id}/download?asset=original`}
          >
            Download original
          </a>
          <Link href={`/models/${model.id}/edit`}>
            Edit
          </Link>
        </div>
      </div>

      <div className="mixamo-detail-grid">
        <section className="asset-stage-panel">
          <InspectViewer src={model.fileUrl} />
        </section>

        <aside className="mixamo-inspector-panel">
          <h2>Metadata</h2>
          <div className="details-list">
            <div>
              <strong>Format:</strong> {model.format.toUpperCase()}
            </div>
            <div>
              <strong>File size:</strong> {formatBytes(model.fileSize)}
            </div>
            <div>
              <strong>Category:</strong> {model.category}
            </div>
            <div>
              <strong>License:</strong> {model.license}
            </div>
            <div>
              <strong>Element type:</strong> {elementType?.name ?? "None"}
            </div>
            <div>
              <strong>Views:</strong> {model.viewCount}
            </div>
            <div>
              <strong>Downloads:</strong> {model.downloadCount}
            </div>
            <div>
              <strong>Original file:</strong> {model.originalFilename}
            </div>
          </div>

          <h3>Delivery optimization</h3>
          <div className="details-list">
            <div>
              <strong>Status:</strong> {optimization?.status ?? "Unavailable"}
            </div>
            <div>
              <strong>Compression:</strong> {optimization?.compression ?? "none"}
            </div>
            <div>
              <strong>Original asset:</strong> {formatBytes(optimization?.originalFileSize ?? model.fileSize)}
            </div>
            <div>
              <strong>Delivery asset:</strong> {formatBytes(optimization?.deliveryFileSize ?? model.fileSize)}
            </div>
            <div>
              <strong>Saved bytes:</strong> {formatBytes(optimization?.savingsBytes ?? 0)}
            </div>
            <div>
              <strong>Savings ratio:</strong> {optimization ? `${(optimization.savingsRatio * 100).toFixed(1)}%` : "0.0%"}
            </div>
            {optimization?.statusReason ? (
              <div>
                <strong>Reason:</strong> {optimization.statusReason}
              </div>
            ) : null}
          </div>
          <div className="inline-actions wrap-actions">
            <a className="mixamo-primary-action" href={`/api/models/${model.id}/download?asset=delivery`}>
              {hasSeparateDelivery ? "Download optimized GLB" : "Download current asset"}
            </a>
            <a className="mixamo-secondary-action" href={`/api/models/${model.id}/download?asset=original`}>
              Download original asset
            </a>
          </div>

          <h3>Transform defaults</h3>
          <div className="details-list">
            <div>
              <strong>Position:</strong> {model.position.join(", ")}
            </div>
            <div>
              <strong>Rotation:</strong> {model.rotation.join(", ")}
            </div>
            <div>
              <strong>Scale:</strong> {model.scale.join(", ")}
            </div>
          </div>

          <h3>Tags</h3>
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

          <h3>Versions</h3>
          <div className="version-list">
            {versions.length ? (
              versions.map((version) => (
                <div className="version-item" key={version.id}>
                  <span>v{version.versionNumber}</span>
                  <a href={version.fileUrl}>Open file</a>
                </div>
              ))
            ) : (
              <p>No snapshots yet.</p>
            )}
          </div>

          <DeleteModelButton modelId={model.id} />
        </aside>
      </div>
    </main>
  );
}
