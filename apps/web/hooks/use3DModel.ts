"use client";

import { useEffect, useMemo } from "react";
import { useFBX, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { cloneMeshMaterial } from "@/lib/3d/materials";

export function isGltfSource(src: string) {
  const normalized = src.split("?")[0].split("#").pop() ?? src;
  return normalized.endsWith(".glb") || normalized.endsWith(".gltf");
}

export function isFbxSource(src: string) {
  const normalized = src.split("?")[0].split("#").pop() ?? src;
  return normalized.endsWith(".fbx");
}

export function preload3DModel(src: string) {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  if (isGltfSource(src)) {
    useGLTF.preload(src, dracoPath);
    return;
  }
  if (isFbxSource(src)) {
    useFBX.preload(src);
  }
}

function cloneScene(scene: THREE.Object3D, wireframe: boolean, cloneMaterials = true) {
  const cloned = SkeletonUtils.clone(scene);
  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (cloneMaterials) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) =>
          cloneMeshMaterial(material, wireframe),
        );
        return;
      }

      child.material = cloneMeshMaterial(child.material, wireframe);
    }
  });

  return cloned;
}

export function use3DModel(
  src: string,
  options?: { wireframe?: boolean; cloneMaterials?: boolean },
) {
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const gltf = useGLTF(src, dracoPath);

  useEffect(() => {
    useGLTF.preload(src, dracoPath);
  }, [src]);

  return useMemo(
    () => cloneScene(gltf.scene, options?.wireframe ?? false, options?.cloneMaterials ?? true),
    [gltf.scene, options?.wireframe, options?.cloneMaterials],
  );
}

export function useFbxModel(
  src: string,
  options?: { wireframe?: boolean; cloneMaterials?: boolean },
) {
  const scene = useFBX(src);

  useEffect(() => {
    useFBX.preload(src);
  }, [src]);

  return useMemo(
    () => cloneScene(scene, options?.wireframe ?? false, options?.cloneMaterials ?? true),
    [scene, options?.wireframe, options?.cloneMaterials],
  );
}
