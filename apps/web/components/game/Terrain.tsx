"use client";

import { useEffect, useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";

type TerrainProps = {
  onReady?: (scene: THREE.Object3D) => void;
};

export function Terrain({ onReady }: TerrainProps) {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const mapModelUrl = useGameStore((state) => state.activeLevel.mapModelUrl);
  const { scene } = useGLTF(mapModelUrl, dracoPath);

  // Optimize material parameters, shadows and ensure static caching
  const optimizedScene = useMemo(() => {
    const cloned = scene.clone();
    cloned.name = "terrain-root";
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.isTerrainSurface = true;
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Improve visual appearance for the terrain materials
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.85;
              mat.metalness = 0.1;
              // Ensure textures are rendered correctly
              if (mat.map) {
                mat.map.anisotropy = 4;
              }
            }
          });
        }
      }
    });
    cloned.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(cloned);
    if (!bounds.isEmpty()) {
      cloned.position.y -= bounds.min.y;
      cloned.updateMatrixWorld(true);
    }
    return cloned;
  }, [scene]);

  useEffect(() => {
    onReady?.(optimizedScene);
  }, [onReady, optimizedScene]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={[0, 0, 0]} rotation={[0, 0, 0]}>
      <primitive object={optimizedScene} />
    </RigidBody>
  );
}

// Preload the default terrain GLB
useGLTF.preload("/uploads/models/d9d70e25-4e3b-4d34-97be-c56ec50e8a26/delivery.glb", "https://www.gstatic.com/draco/v1/decoders/");
