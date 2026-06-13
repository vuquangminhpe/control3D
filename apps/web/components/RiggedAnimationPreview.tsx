"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ComponentProps, type ElementRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";
import { createRenderer } from "@/lib/3d/three-setup";

type CanvasGlProp = ComponentProps<typeof Canvas>["gl"];

function normalizePreviewSource(src: string) {
  return src.split("?")[0].split("#")[0]?.toLowerCase() ?? src.toLowerCase();
}

function AnimatedPreviewContent({
  activeClipIndex,
  actionName,
  animations,
  onClipChange,
  scene,
}: {
  activeClipIndex: number;
  actionName?: string | null;
  animations: THREE.AnimationClip[];
  onClipChange: (index: number) => void;
  scene: THREE.Object3D;
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clonedScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    cloned.updateMatrixWorld(true);
    const initialBox = new THREE.Box3().setFromObject(cloned);
    const initialSize = initialBox.getSize(new THREE.Vector3());
    if (initialSize.z > initialSize.y * 1.2) {
      cloned.rotation.x = -Math.PI / 2;
      cloned.updateMatrixWorld(true);
    }
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.001);
    const scale = Math.min(2.6 / maxSize, 2.4);
    cloned.scale.setScalar(scale);
    cloned.position.set(
      -center.x * scale,
      (-center.y + size.y * 0.5) * scale,
      -center.z * scale,
    );
    cloned.updateMatrixWorld(true);
    return cloned;
  }, [scene]);
  const activeClip = animations[activeClipIndex] ?? animations[0];
  const skinnedMeshCount = useMemo(() => {
    let count = 0;
    clonedScene.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) count += 1;
    });
    return count;
  }, [clonedScene]);

  useEffect(() => {
    if (!activeClip) return;
    const mixer = new THREE.AnimationMixer(clonedScene);
    mixerRef.current = mixer;
    const action = mixer.clipAction(activeClip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.play();
    return () => {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
      mixerRef.current = null;
    };
  }, [activeClip, clonedScene]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight castShadow intensity={1.7} position={[4, 7, 5]} />
      <directionalLight intensity={0.45} position={[-4, 2, -3]} />
      <gridHelper args={[6, 24, "#2e3b4d", "#1b2432"]} position={[0, 0, 0]} />
      <primitive object={clonedScene} />
      <Html position={[0, 2.15, 0]} center>
        <div className="rigged-action-chip">
          {activeClip
            ? `Action preview: ${actionName || activeClip.name || "Action"} / Skins: ${skinnedMeshCount}`
            : "Model loaded. No embedded clips found."}
        </div>
      </Html>
      <Html fullscreen>
        <div className="rigged-preview-controls">
          <div className="rigged-clip-list">
            {animations.map((clip, index) => (
              <button
                className={activeClip === clip ? "active" : ""}
                key={`${clip.name}-${index}`}
                onClick={() => onClipChange(index)}
                type="button"
              >
                {clip.name || `Clip ${index + 1}`}
              </button>
            ))}
          </div>
          <button onClick={() => controlsRef.current?.reset()} type="button">
            Reset view
          </button>
        </div>
      </Html>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        enablePan
        enableZoom
        maxDistance={14}
        minDistance={0.55}
        screenSpacePanning
      />
    </>
  );
}

function GltfPreviewScene({
  activeClipIndex,
  actionName,
  onClipChange,
  src,
}: {
  activeClipIndex: number;
  actionName?: string | null;
  onClipChange: (index: number) => void;
  src: string;
}) {
  const { scene, animations } = useGLTF(src, "https://www.gstatic.com/draco/v1/decoders/");
  return (
    <AnimatedPreviewContent
      actionName={actionName}
      activeClipIndex={activeClipIndex}
      animations={animations}
      onClipChange={onClipChange}
      scene={scene}
    />
  );
}

function FbxPreviewScene({
  activeClipIndex,
  actionName,
  onClipChange,
  src,
}: {
  activeClipIndex: number;
  actionName?: string | null;
  onClipChange: (index: number) => void;
  src: string;
}) {
  const scene = useLoader(FBXLoader, src);
  return (
    <AnimatedPreviewContent
      actionName={actionName}
      activeClipIndex={activeClipIndex}
      animations={scene.animations}
      onClipChange={onClipChange}
      scene={scene}
    />
  );
}

function GltfWithFbxActionPreviewScene({
  activeClipIndex,
  actionName,
  animationSrc,
  onClipChange,
  src,
}: {
  activeClipIndex: number;
  actionName?: string | null;
  animationSrc: string;
  onClipChange: (index: number) => void;
  src: string;
}) {
  const { scene } = useGLTF(src, "https://www.gstatic.com/draco/v1/decoders/");
  const actionScene = useLoader(FBXLoader, animationSrc);
  return (
    <AnimatedPreviewContent
      actionName={actionName}
      activeClipIndex={activeClipIndex}
      animations={actionScene.animations}
      onClipChange={onClipChange}
      scene={scene}
    />
  );
}

function FbxWithFbxActionPreviewScene({
  activeClipIndex,
  actionName,
  animationSrc,
  onClipChange,
  src,
}: {
  activeClipIndex: number;
  actionName?: string | null;
  animationSrc: string;
  onClipChange: (index: number) => void;
  src: string;
}) {
  const scene = useLoader(FBXLoader, src);
  const actionScene = useLoader(FBXLoader, animationSrc);
  return (
    <AnimatedPreviewContent
      actionName={actionName}
      activeClipIndex={activeClipIndex}
      animations={actionScene.animations}
      onClipChange={onClipChange}
      scene={scene}
    />
  );
}

export function RiggedAnimationPreview({
  animationSrc,
  actionName,
  src,
  cacheKey,
}: {
  animationSrc?: string | null;
  actionName?: string | null;
  src: string;
  cacheKey?: string;
}) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const previewSrc = useMemo(() => {
    if (!cacheKey) return src;
    return `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`;
  }, [cacheKey, src]);
  const previewExtension = normalizePreviewSource(src).slice(normalizePreviewSource(src).lastIndexOf(".") + 1);
  const normalizedAnimationSrc = animationSrc ? normalizePreviewSource(animationSrc) : "";
  const animationPreviewSrc = useMemo(() => {
    if (!animationSrc || !cacheKey) return animationSrc;
    return `${animationSrc}${animationSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`;
  }, [animationSrc, cacheKey]);
  const canUseFbxAction = Boolean(animationPreviewSrc && normalizedAnimationSrc.endsWith(".fbx"));
  const gl = useMemo<CanvasGlProp>(
    () => async (props: { canvas?: unknown }) => {
      if (!(props.canvas instanceof HTMLCanvasElement)) {
        throw new Error("Canvas element is required");
      }
      return (await createRenderer(props.canvas, { backend: "webgl" })).renderer;
    },
    [],
  );

  return (
    <div className="rigged-animation-preview">
      <Canvas camera={{ position: [0, 1.45, 4.5], fov: 42, near: 0.01, far: 1000 }} dpr={[1, 1.1]} gl={gl}>
        <color attach="background" args={["#070b16"]} />
        <Suspense fallback={<Html center><div className="loading-spinner">Loading rigged animation...</div></Html>}>
          {canUseFbxAction && previewExtension === "fbx" ? (
            <FbxWithFbxActionPreviewScene
              actionName={actionName}
              activeClipIndex={activeClipIndex}
              animationSrc={animationPreviewSrc as string}
              onClipChange={setActiveClipIndex}
              src={previewSrc}
            />
          ) : canUseFbxAction ? (
            <GltfWithFbxActionPreviewScene
              actionName={actionName}
              activeClipIndex={activeClipIndex}
              animationSrc={animationPreviewSrc as string}
              onClipChange={setActiveClipIndex}
              src={previewSrc}
            />
          ) : previewExtension === "fbx" ? (
            <FbxPreviewScene
              actionName={actionName}
              activeClipIndex={activeClipIndex}
              onClipChange={setActiveClipIndex}
              src={previewSrc}
            />
          ) : (
            <GltfPreviewScene
              actionName={actionName}
              activeClipIndex={activeClipIndex}
              onClipChange={setActiveClipIndex}
              src={previewSrc}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
