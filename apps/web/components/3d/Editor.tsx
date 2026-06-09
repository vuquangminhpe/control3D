"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Bvh,
  ContactShadows,
  Environment,
  Grid,
  Html,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { fitCameraToModel } from "@/lib/3d/camera";
import { applyMaterialDraft, readMaterialDraft } from "@/lib/3d/materials";
import {
  type MaterialDraft,
  type MeshSelection,
  type TransformMode,
  type TransformState,
  type Vector3Tuple,
} from "@/lib/3d/types";
import {
  createRenderer,
  getInitialRendererLabel,
} from "@/lib/3d/three-setup";

type OrbitControlsLike = {
  target: THREE.Vector3;
  update: () => void;
};

type CanvasGlProp = ComponentProps<typeof Canvas>["gl"];

type EditorViewerProps = {
  mode: TransformMode;
  onMeshSelectionChange: (selection: MeshSelection | null) => void;
  onTransformChange: (state: TransformState, commit?: boolean) => void;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  selectedMaterial: MaterialDraft | null;
  selectedMeshId: string | null;
  src: string;
};

function degToRad(value: number) {
  return value * (Math.PI / 180);
}

function radToDeg(value: number) {
  return value * (180 / Math.PI);
}

function toTuple(values: number[]) {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] as Vector3Tuple;
}

function ViewerCanvas({
  children,
  onPointerMissed,
}: {
  children: ReactNode;
  onPointerMissed?: () => void;
}) {
  const [rendererLabel, setRendererLabel] = useState(getInitialRendererLabel());

  const gl = useMemo<CanvasGlProp>(
    () => async (props: { canvas?: unknown }) => {
      if (!(props.canvas instanceof HTMLCanvasElement)) {
        throw new Error("Canvas element is required");
      }

      const { label, renderer } = await createRenderer(props.canvas);
      setRendererLabel(label);
      return renderer;
    },
    [],
  );

  return (
    <div className="viewer-canvas">
      <span className="viewer-badge">{rendererLabel}</span>
      <Canvas
        camera={{ fov: 45, near: 0.01, far: 1000, position: [2, 2, 5] }}
        dpr={[1, 2]}
        gl={gl}
        onPointerMissed={onPointerMissed}
        shadows
        style={{ height: "100%", width: "100%" }}
      >
        <color attach="background" args={["#f3f0ea"]} />
        <Suspense fallback={<Html center>Loading 3D model...</Html>}>
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
}

function AutoFitCamera({
  controlsRef,
  model,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsLike | null>;
  model: THREE.Object3D | null;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (
      !(camera instanceof THREE.PerspectiveCamera)
      || !controlsRef.current
      || !model
    ) {
      return;
    }

    fitCameraToModel(camera, controlsRef.current, model);
  }, [camera, controlsRef, model]);

  return null;
}

function readTargetTransform(target: THREE.Group) {
  return {
    position: toTuple(target.position.toArray()),
    rotation: toTuple([
      radToDeg(target.rotation.x),
      radToDeg(target.rotation.y),
      radToDeg(target.rotation.z),
    ]),
    scale: toTuple(target.scale.toArray()),
  } satisfies TransformState;
}

function EditorScene({
  mode,
  onMeshSelectionChange,
  onTransformChange,
  position,
  rotation,
  scale,
  selectedMaterial,
  selectedMeshId,
  src,
}: EditorViewerProps) {
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const [modelRoot, setModelRoot] = useState<THREE.Object3D | null>(null);
  const [transformTarget, setTransformTarget] =
    useState<THREE.Group | null>(null);

  const parsedRotation = useMemo(
    () => rotation.map((value) => degToRad(value)) as Vector3Tuple,
    [rotation],
  );

  const meshLookup = useMemo(() => {
    const entries = new Map<string, THREE.Mesh>();

    if (!modelRoot) {
      return entries;
    }

    modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        entries.set(child.uuid, child);
      }
    });

    return entries;
  }, [modelRoot]);

  useEffect(() => {
    if (!transformTarget) {
      return;
    }

    transformTarget.position.set(position[0], position[1], position[2]);
    transformTarget.rotation.set(
      parsedRotation[0],
      parsedRotation[1],
      parsedRotation[2],
    );
    transformTarget.scale.set(scale[0], scale[1], scale[2]);
    transformTarget.updateMatrixWorld();
  }, [parsedRotation, position, scale, transformTarget]);

  useEffect(() => {
    if (!selectedMeshId || !selectedMaterial) {
      return;
    }

    const selectedMesh = meshLookup.get(selectedMeshId);
    if (!selectedMesh) {
      return;
    }

    applyMaterialDraft(selectedMesh, selectedMaterial);
  }, [meshLookup, selectedMaterial, selectedMeshId]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!(event.object instanceof THREE.Mesh)) {
      return;
    }

    event.stopPropagation();

    onMeshSelectionChange({
      id: event.object.uuid,
      material: readMaterialDraft(event.object),
      name:
        event.object.name
        || event.object.parent?.name
        || `Mesh ${event.object.uuid.slice(0, 8)}`,
    });
  };

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight castShadow intensity={1.65} position={[4, 6, 5]} />
      <Environment background={false} preset="studio" />
      <ContactShadows
        blur={2}
        far={10}
        opacity={0.25}
        position={[0, -1.15, 0]}
        scale={12}
      />
      <Grid
        args={[12, 12]}
        cellColor="#e4ddd2"
        fadeDistance={18}
        fadeStrength={1.4}
        position={[0, -1.2, 0]}
        sectionColor="#bbb4aa"
      />
      <axesHelper args={[1.8]} />
      <group ref={setTransformTarget}>
        <Bvh firstHitOnly>
          <ModelLoader
            onMeshPointerDown={handlePointerDown}
            onSceneReady={setModelRoot}
            src={src}
          />
        </Bvh>
      </group>
      <AutoFitCamera controlsRef={controlsRef} model={transformTarget} />
      <OrbitControls
        ref={controlsRef as never}
        dampingFactor={0.08}
        enableDamping
        makeDefault
      />
      {transformTarget ? (
        <TransformControls
          mode={mode}
          object={transformTarget}
          onMouseUp={() => {
            onTransformChange(readTargetTransform(transformTarget), true);
          }}
          onObjectChange={() => {
            onTransformChange(readTargetTransform(transformTarget), false);
          }}
        />
      ) : null}
    </>
  );
}

export function EditorViewer(props: EditorViewerProps) {
  return (
    <ViewerCanvas onPointerMissed={() => props.onMeshSelectionChange(null)}>
      <EditorScene {...props} />
    </ViewerCanvas>
  );
}