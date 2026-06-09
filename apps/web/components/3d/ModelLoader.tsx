"use client";

import { useEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { isGltfSource, use3DModel } from "@/hooks/use3DModel";

type MeshPointerHandler = (event: ThreeEvent<PointerEvent>) => void;
type ModelLoaderProps = {
  onMeshPointerDown?: MeshPointerHandler;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  src: string;
  wireframe?: boolean;
};

function FallbackAsset({
  onSceneReady,
  wireframe = false,
}: {
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  wireframe?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    onSceneReady?.(meshRef.current);
  }, [onSceneReady]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[1.6, 1, 1]} />
      <meshStandardMaterial color="#888888" wireframe={wireframe} />
    </mesh>
  );
}

function LoadedModel({
  onMeshPointerDown,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const scene = use3DModel(src, { wireframe });

  useEffect(() => {
    onSceneReady?.(scene);
  }, [onSceneReady, scene]);

  return <primitive object={scene} onPointerDown={onMeshPointerDown} />;
}

export function ModelLoader(props: ModelLoaderProps) {
  if (!isGltfSource(props.src)) {
    return (
      <FallbackAsset
        onSceneReady={props.onSceneReady}
        wireframe={props.wireframe}
      />
    );
  }

  return <LoadedModel {...props} />;
}