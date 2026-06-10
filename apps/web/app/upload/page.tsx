import { UploadForm } from "@/components/UploadForm";
import { getElementTypes } from "@/lib/model-store";

export default async function UploadPage() {
  const elementTypes = await getElementTypes();

  return (
    <main className="mixamo-page">
      <div className="mixamo-object-header">
        <div>
          <span>OBJECT REGISTRATION</span>
          <h1>Register a 3D object</h1>
          <p>
            Upload assets into the local SQLite library. Delivery files keep the existing optimization pipeline, including GLB delivery processing where available.
          </p>
        </div>
        <a className="mixamo-primary-action" href="/models">Back to models</a>
      </div>

      <div className="mixamo-registration-grid">
        <section className="mixamo-form-panel">
          <UploadForm elementTypes={elementTypes} />
        </section>
        <aside className="mixamo-info-panel">
          <h2>Character upload reality</h2>
          <p>
            Mixamo-style auto-rigging is a separate humanoid rigging service. For now this app can store characters, maps and FBX/GLB assets; action retargeting needs a rigged humanoid skeleton and a mapped animation package.
          </p>
          <ul>
            <li>Best character files: clean humanoid mesh, neutral pose, centered at origin.</li>
            <li>Avoid helper objects, cameras, props, wings, tails, or disjoint body parts.</li>
            <li>Supported object uploads: GLB, GLTF, OBJ, FBX, STL, PLY, USDZ.</li>
            <li>Next backend step: zip FBX package upload with action mapping.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
