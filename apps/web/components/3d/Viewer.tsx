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
  ContactShadows,
  Environment,
  Grid,
  Html,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EnvironmentPicker } from "@/components/3d/EnvironmentPicker";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { ViewerPostProcessing } from "@/components/3d/PostProcessing";
import { fitCameraToModel } from "@/lib/3d/camera";
import {
  type EnvironmentPreset,
  type TransformState,
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

type InspectViewerProps = {
  src: string;
  variant?: "detail" | "preview";
};

type ModelViewerProps = {
  mode?: "inspect" | "edit";
  src: string;
};

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
        shadows="percentage"
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

function InspectScene({
  environmentPreset,
  qualityMode,
  showAxes,
  showGrid,
  src,
  variant,
  wireframe,
}: {
  environmentPreset: EnvironmentPreset;
  qualityMode: boolean;
  showAxes: boolean;
  showGrid: boolean;
  src: string;
  variant: "detail" | "preview";
  wireframe: boolean;
}) {
  const [modelRoot, setModelRoot] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const isPreview = variant === "preview";

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight castShadow intensity={1.8} position={[4, 6, 5]} />
      <directionalLight intensity={0.65} position={[-3, 2, -4]} />
      <Environment background={false} preset={environmentPreset} />
      <ContactShadows
        blur={2.4}
        far={10}
        opacity={0.32}
        position={[0, -1.15, 0]}
        scale={12}
      />
      {showGrid ? (
        <Grid
          args={[12, 12]}
          cellColor="#e4ddd2"
          fadeDistance={18}
          fadeStrength={1.4}
          position={[0, -1.2, 0]}
          sectionColor="#bbb4aa"
        />
      ) : null}
      {showAxes ? <axesHelper args={[1.8]} /> : null}
      <ModelLoader
        onSceneReady={setModelRoot}
        src={src}
        wireframe={wireframe}
      />
      <AutoFitCamera controlsRef={controlsRef} model={modelRoot} />
      <OrbitControls
        ref={controlsRef as never}
        autoRotate={isPreview}
        autoRotateSpeed={1.5}
        dampingFactor={0.08}
        enableDamping
        makeDefault
      />
      <ViewerPostProcessing enabled={qualityMode} />
    </>
  );
}

export function InspectViewer({
  src,
  variant = "detail",
}: InspectViewerProps) {
  const [environmentPreset, setEnvironmentPreset] = useState<EnvironmentPreset>(
    variant === "preview" ? "studio" : "warehouse",
  );
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(variant === "detail");
  const [wireframe, setWireframe] = useState(false);
  const [qualityMode, setQualityMode] = useState(false);

  return (
    <div className="viewer-panel">
      <ViewerCanvas>
        <InspectScene
          environmentPreset={environmentPreset}
          qualityMode={qualityMode}
          showAxes={showAxes}
          showGrid={showGrid}
          src={src}
          variant={variant}
          wireframe={wireframe}
        />
      </ViewerCanvas>
      {variant === "detail" ? (
        <div className="viewer-toolbar">
          <EnvironmentPicker
            onChange={setEnvironmentPreset}
            value={environmentPreset}
          />
          <div className="viewer-toolbar-group">
            <button
              className={`viewer-chip${showGrid ? " active" : ""}`}
              onClick={() => setShowGrid((value) => !value)}
              type="button"
            >
              Grid
            </button>
            <button
              className={`viewer-chip${showAxes ? " active" : ""}`}
              onClick={() => setShowAxes((value) => !value)}
              type="button"
            >
              Axes
            </button>
            <button
              className={`viewer-chip${wireframe ? " active" : ""}`}
              onClick={() => setWireframe((value) => !value)}
              type="button"
            >
              Wireframe
            </button>
            <button
              className={`viewer-chip${qualityMode ? " active" : ""}`}
              onClick={() => setQualityMode((value) => !value)}
              type="button"
            >
              Quality FX
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ModelViewer({ mode = "inspect", src }: ModelViewerProps) {
  if (mode === "edit") {
    return null;
  }

  return <InspectViewer src={src} />;
}