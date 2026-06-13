"use client";

import { useEffect, useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";

type TerrainProps = {
  onReady?: (scene: THREE.Object3D) => void;
};

const GAME_MAP_MAX_SIZE = 92;

function getRenderableBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh)) return;
    const geometry = child.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
    child.updateMatrixWorld(true);
    localBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    bounds.union(localBounds);
  });
  return bounds.isEmpty() ? new THREE.Box3().setFromObject(object) : bounds;
}

function TerrainModel({ mapModelUrl, onReady }: TerrainProps & { mapModelUrl: string }) {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
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
    const sourceBounds = getRenderableBounds(cloned);
    if (!sourceBounds.isEmpty()) {
      const size = sourceBounds.getSize(new THREE.Vector3());
      const mapSpan = Math.max(size.x, size.z);
      if (mapSpan > 0.0001) {
        cloned.scale.setScalar(GAME_MAP_MAX_SIZE / mapSpan);
      }
      cloned.updateMatrixWorld(true);
    }
    const bounds = getRenderableBounds(cloned);
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

export function Terrain({ onReady }: TerrainProps) {
  const mapModelUrl = useGameStore((state) => state.activeLevel.mapModelUrl);
  if (!mapModelUrl) return null;
  return <TerrainModel mapModelUrl={mapModelUrl} onReady={onReady} />;
}
