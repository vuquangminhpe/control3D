"use client";

import { useEffect, useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";

import { getRenderableBounds } from "@/components/3d/ModelLoader";
import { log3DDebug } from "@/lib/3d/debug";

type TerrainProps = {
  onReady?: (scene: THREE.Object3D) => void;
};

const GAME_MAP_MAX_SIZE = 92;

function getHorizontalSpan(bounds: THREE.Box3) {
  const size = bounds.getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

function getGameplayMapScaleRatio(scene: THREE.Object3D) {
  const bounds = getRenderableBounds(scene, { loader: "runtime-terrain", phase: "gameplay-map-scale" });
  if (bounds.isEmpty()) return 1;
  const span = getHorizontalSpan(bounds);
  return span > 0.0001 ? span / GAME_MAP_MAX_SIZE : 1;
}

function TerrainModel({ mapModelUrl, onReady, isPrimary = true }: TerrainProps & { mapModelUrl: string; isPrimary?: boolean }) {
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
    const sourceBounds = getRenderableBounds(cloned, {
      loader: "runtime-terrain",
      phase: "source-before-fit",
      src: mapModelUrl,
    });
    if (!sourceBounds.isEmpty()) {
      const size = sourceBounds.getSize(new THREE.Vector3());
      const mapSpan = getHorizontalSpan(sourceBounds);
      if (mapSpan > 0.0001) {
        const scaleVal = GAME_MAP_MAX_SIZE / mapSpan;
        cloned.scale.multiplyScalar(scaleVal);
        log3DDebug(
          `terrain-fit:${mapModelUrl}`,
          "Terrain fit scale",
          {
            sourceSize: [size.x, size.y, size.z].map((value) => Number(value.toFixed(4))),
            sourceHorizontalSpan: Number(mapSpan.toFixed(4)),
            scaleMultiplier: Number(scaleVal.toFixed(4)),
            finalRootScale: [cloned.scale.x, cloned.scale.y, cloned.scale.z].map((value) => Number(value.toFixed(4))),
          },
          { once: true },
        );
      }
      cloned.updateMatrixWorld(true);
    }
    const bounds = getRenderableBounds(cloned, {
      loader: "runtime-terrain",
      phase: "after-fit-before-ground",
      src: mapModelUrl,
    });
    if (!bounds.isEmpty()) {
      cloned.position.y -= bounds.min.y;
      cloned.updateMatrixWorld(true);
      log3DDebug(
        `terrain-ground:${mapModelUrl}`,
        "Terrain grounded",
        { yOffset: Number((-bounds.min.y).toFixed(4)) },
        { once: true },
      );
    }
    return cloned;
  }, [mapModelUrl, scene]);

  const setMapScaleRatio = useGameStore((state) => state.setMapScaleRatio);

  useEffect(() => {
    if (isPrimary) {
      onReady?.(optimizedScene);
      const gameplayScaleRatio = getGameplayMapScaleRatio(optimizedScene);
      log3DDebug(
        `terrain-ready:${mapModelUrl}`,
        "Terrain ready",
        {
          gameplayScaleRatio: Number(gameplayScaleRatio.toFixed(4)),
          rootScale: [optimizedScene.scale.x, optimizedScene.scale.y, optimizedScene.scale.z].map((value) => Number(value.toFixed(4))),
        },
        { once: true },
      );
      setMapScaleRatio(gameplayScaleRatio);
    }
  }, [mapModelUrl, onReady, optimizedScene, setMapScaleRatio, isPrimary]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={[0, 0, 0]} rotation={[0, 0, 0]}>
      <primitive object={optimizedScene} />
    </RigidBody>
  );
}

export function Terrain({ onReady }: TerrainProps) {
  const mapModelUrl = useGameStore((state) => state.activeLevel.mapModelUrl);
  if (!mapModelUrl) return null;
  return <TerrainModel mapModelUrl={mapModelUrl} onReady={onReady} isPrimary={true} />;
}
