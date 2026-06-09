"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cloneMeshMaterial } from "@/lib/3d/materials";

export function isGltfSource(src: string) {
  return src.endsWith(".glb") || src.endsWith(".gltf");
}

function cloneScene(scene: THREE.Object3D, wireframe: boolean) {
  const cloned = scene.clone(true);
  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneMeshMaterial(material, wireframe),
      );
      return;
    }

    child.material = cloneMeshMaterial(child.material, wireframe);
  });

  return cloned;
}

export function use3DModel(
  src: string,
  options?: { wireframe?: boolean },
) {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const gltf = useGLTF(src, dracoPath);

  useEffect(() => {
    useGLTF.preload(src, dracoPath);
  }, [src]);

  return useMemo(
    () => cloneScene(gltf.scene, options?.wireframe ?? false),
    [gltf.scene, options?.wireframe],
  );
}