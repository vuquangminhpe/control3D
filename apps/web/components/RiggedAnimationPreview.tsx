"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ComponentProps, type ElementRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { createRenderer } from "@/lib/3d/three-setup";

type CanvasGlProp = ComponentProps<typeof Canvas>["gl"];

function RiggedPreviewScene({
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
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const { scene, animations } = useGLTF(src, "https://www.gstatic.com/draco/v1/decoders/");
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
    cloned.position.sub(center);
    cloned.position.y += size.y * 0.5;
    cloned.scale.setScalar(Math.min(2.6 / maxSize, 2.4));
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
            ? `Rig preview: ${actionName || activeClip.name || "Rig test"} / Skins: ${skinnedMeshCount}`
            : "Rigged model loaded. No embedded clips found."}
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

export function RiggedAnimationPreview({
  actionName,
  src,
  cacheKey,
}: {
  actionName?: string | null;
  src: string;
  cacheKey?: string;
}) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const previewSrc = useMemo(() => {
    if (!cacheKey) return src;
    return `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`;
  }, [cacheKey, src]);
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
          <RiggedPreviewScene
            actionName={actionName}
            activeClipIndex={activeClipIndex}
            onClipChange={setActiveClipIndex}
            src={previewSrc}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
