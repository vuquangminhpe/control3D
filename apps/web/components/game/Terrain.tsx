"use client";

import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export function Terrain() {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const { scene } = useGLTF(
    "/uploads/models/d9d70e25-4e3b-4d34-97be-c56ec50e8a26/delivery.glb",
    dracoPath
  );

  // Optimize material parameters, shadows and ensure static caching
  const optimizedScene = useMemo(() => {
    const cloned = scene.clone();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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
    return cloned;
  }, [scene]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={[0, 0, 0]} rotation={[0, 0, 0]}>
      <primitive object={optimizedScene} />
    </RigidBody>
  );
}

// Preload the terrain GLB
useGLTF.preload(
  "/uploads/models/d9d70e25-4e3b-4d34-97be-c56ec50e8a26/delivery.glb",
  "https://www.gstatic.com/draco/v1/decoders/"
);
