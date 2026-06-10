"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { isGltfSource, use3DModel } from "@/hooks/use3DModel";

type MeshPointerHandler = (event: ThreeEvent<PointerEvent>) => void;
type MeshClickHandler = (event: ThreeEvent<MouseEvent>) => void;
type ModelLoaderProps = {
  groundToY?: number;
  onMeshClick?: MeshClickHandler;
  onMeshPointerDown?: MeshPointerHandler;
  onMeshPointerUp?: MeshPointerHandler;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  src: string;
  wireframe?: boolean;
};

function FallbackAsset({
  groundToY,
  onSceneReady,
  wireframe = false,
}: {
  groundToY?: number;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  wireframe?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    onSceneReady?.(meshRef.current);
  }, [onSceneReady]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow position={[0, groundToY === undefined ? 0 : groundToY + 0.5, 0]}>
      <boxGeometry args={[1.6, 1, 1]} />
      <meshStandardMaterial color="#888888" wireframe={wireframe} />
    </mesh>
  );
}

function LoadedModel({
  groundToY,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const scene = use3DModel(src, { wireframe });
  const groundOffset = useMemo(() => {
    if (groundToY === undefined) return 0;
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    if (bounds.isEmpty()) return 0;
    return groundToY - bounds.min.y;
  }, [groundToY, scene]);

  useEffect(() => {
    onSceneReady?.(groupRef.current);
  }, [groundOffset, onSceneReady, scene]);

  return (
    <group ref={groupRef} position={[0, groundOffset, 0]}>
      <primitive
        object={scene}
        onClick={onMeshClick}
        onPointerDown={onMeshPointerDown}
        onPointerUp={onMeshPointerUp}
      />
    </group>
  );
}

export function ModelLoader(props: ModelLoaderProps) {
  if (!isGltfSource(props.src)) {
    return (
      <FallbackAsset
        groundToY={props.groundToY}
        onSceneReady={props.onSceneReady}
        wireframe={props.wireframe}
      />
    );
  }

  return <LoadedModel {...props} />;
}
