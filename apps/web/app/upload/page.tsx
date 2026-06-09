import { UploadForm } from "@/components/UploadForm";
import { getElementTypes } from "@/lib/model-store";

export default async function UploadPage() {
  const elementTypes = await getElementTypes();

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Upload Model</h1>
          <p>
            Files are stored locally under the app public folder and indexed in
            the local SQLite database.
          </p>
        </div>
      </div>

      <div className="grid model-grid">
        <div className="card">
          <UploadForm elementTypes={elementTypes} />
        </div>
        <div className="card subtle">
          <h2>Local mode</h2>
          <ul>
            <li>Database file: `apps/web/data/control3d.sqlite`</li>
            <li>Uploaded models: `apps/web/public/uploads/models`</li>
            <li>
              Supported upload extensions: GLB, GLTF, OBJ, FBX, STL, PLY, USDZ
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
