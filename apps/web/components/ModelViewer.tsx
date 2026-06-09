"use client";

import { EditorViewer } from "@/components/3d/Editor";
import { InspectViewer } from "@/components/3d/Viewer";
import type {
  MaterialDraft,
  MeshSelection,
  TransformMode,
  TransformState,
  Vector3Tuple,
} from "@/lib/3d/types";

type ModelViewerProps = {
  mode?: "inspect" | "edit";
  src: string;
};

export type {
  MaterialDraft,
  MeshSelection,
  TransformMode,
  TransformState,
  Vector3Tuple,
};
export { EditorViewer, InspectViewer };

export function ModelViewer({ mode = "inspect", src }: ModelViewerProps) {
  if (mode === "edit") {
    return (
      <EditorViewer
        mode="translate"
        onMeshSelectionChange={() => undefined}
        onTransformChange={() => undefined}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[1, 1, 1]}
        selectedMaterial={null}
        selectedMeshId={null}
        src={src}
      />
    );
  }

  return <InspectViewer src={src} />;
}
