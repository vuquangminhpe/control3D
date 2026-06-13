"use client";

import { useEffect, useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";

import { getRenderableBounds } from "@/components/3d/ModelLoader";

type TerrainProps = {
  onReady?: (scene: THREE.Object3D) => void;
};

const GAME_MAP_MAX_SIZE = 92;

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
    console.log("[antigravity-debug] Terrain source bounds:", {
      min: [sourceBounds.min.x, sourceBounds.min.y, sourceBounds.min.z],
      max: [sourceBounds.max.x, sourceBounds.max.y, sourceBounds.max.z]
    });
    if (!sourceBounds.isEmpty()) {
      const size = sourceBounds.getSize(new THREE.Vector3());
      const mapSpan = Math.max(size.x, size.z);
      console.log("[antigravity-debug] Terrain size:", [size.x, size.y, size.z], "mapSpan:", mapSpan);
      if (mapSpan > 0.0001) {
        const scaleVal = GAME_MAP_MAX_SIZE / mapSpan;
        cloned.scale.setScalar(scaleVal);
        console.log("[antigravity-debug] Set terrain scale factor:", scaleVal);
      }
      cloned.updateMatrixWorld(true);
    }
    const bounds = getRenderableBounds(cloned);
    if (!bounds.isEmpty()) {
      cloned.position.y -= bounds.min.y;
      cloned.updateMatrixWorld(true);
      console.log("[antigravity-debug] Shifted terrain Y offset by:", -bounds.min.y);
    }
    return cloned;
  }, [scene]);

  const setMapScaleRatio = useGameStore((state) => state.setMapScaleRatio);

  useEffect(() => {
    onReady?.(optimizedScene);
    console.log("[antigravity-debug] Terrain Ready: setting mapScaleRatio in store to:", optimizedScene.scale.x);
    setMapScaleRatio(optimizedScene.scale.x);
  }, [onReady, optimizedScene, setMapScaleRatio]);

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
