"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OBJLoader, PLYLoader, STLLoader } from "three-stdlib";
import { isFbxSource, isGltfSource, use3DModel, useFbxModel } from "@/hooks/use3DModel";
import { cloneMeshMaterial } from "@/lib/3d/materials";

type MeshPointerHandler = (event: ThreeEvent<PointerEvent>) => void;
type MeshClickHandler = (event: ThreeEvent<MouseEvent>) => void;
type ModelLoaderProps = {
  fitHeight?: number;
  fitMaxSize?: number;
  groundToY?: number;
  markAsTerrain?: boolean;
  onMeshClick?: MeshClickHandler;
  onMeshPointerDown?: MeshPointerHandler;
  onMeshPointerUp?: MeshPointerHandler;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  src: string;
  wireframe?: boolean;
};

function getSourceExtension(src: string) {
  const normalized = src.split("?")[0].split("#")[0]?.toLowerCase() ?? src.toLowerCase();
  return normalized.slice(normalized.lastIndexOf(".") + 1);
}

function cloneObjectScene(scene: THREE.Object3D, wireframe: boolean, markAsTerrain = false) {
  const cloned = scene.clone(true);
  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (markAsTerrain) child.userData.isTerrainSurface = true;
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

export function getRenderableBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();
  
  const inverseRootMatrix = new THREE.Matrix4();
  try {
    inverseRootMatrix.copy(object.matrixWorld).invert();
  } catch (e) {
    inverseRootMatrix.identity();
  }

  const relativeMatrix = new THREE.Matrix4();

  console.log("[antigravity-debug] getRenderableBounds root object:", {
    name: object.name,
    type: object.type,
    scale: [object.scale.x, object.scale.y, object.scale.z]
  });
  
  let meshCount = 0;
  object.traverse((child) => {
    const isMesh = child instanceof THREE.Mesh;
    const isSkinnedMesh = child instanceof THREE.SkinnedMesh;
    if (!isMesh && !isSkinnedMesh) return;
    
    meshCount++;
    const geometry = child.geometry;
    if (!geometry) {
      console.log(`[antigravity-debug]   child #${meshCount}: ${child.name} (${child.type}) has no geometry`);
      return;
    }
    
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const isEmpty = !bbox || bbox.isEmpty();
    
    console.log(`[antigravity-debug]   child #${meshCount}: ${child.name} (${child.type})`, {
      geometryBBoxEmpty: isEmpty,
      geometryBBoxMin: bbox ? [bbox.min.x, bbox.min.y, bbox.min.z] : null,
      geometryBBoxMax: bbox ? [bbox.max.x, bbox.max.y, bbox.max.z] : null,
      childScale: [child.scale.x, child.scale.y, child.scale.z],
      childMatrixWorldScale: new THREE.Vector3().setFromMatrixScale(child.matrixWorld).toArray()
    });

    if (isEmpty) return;

    // Ignore skyboxes / oceans / water planes / fogs / helper grids & colliders
    const name = (child.name || "").toLowerCase();
    if (
      name.includes("sky") ||
      name.includes("dome") ||
      name.includes("water") ||
      name.includes("sea") ||
      name.includes("ocean") ||
      name.includes("fog") ||
      name.includes("cloud") ||
      name.includes("grid") ||
      name.includes("helper") ||
      name.includes("collision") ||
      name.includes("collider") ||
      name.includes("trigger")
    ) {
      console.log(`[antigravity-debug]   child #${meshCount}: IGNORED due to name filters`);
      return;
    }

    relativeMatrix.multiplyMatrices(inverseRootMatrix, child.matrixWorld);
    localBounds.copy(bbox).applyMatrix4(relativeMatrix);
    bounds.union(localBounds);
    console.log(`[antigravity-debug]   child #${meshCount}: unioned relative bounds. Current bounds:`, {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z]
    });
  });

  if (bounds.isEmpty()) {
    const fallbackWorld = new THREE.Box3().setFromObject(object);
    const fallbackLocal = fallbackWorld.clone().applyMatrix4(inverseRootMatrix);
    console.log("[antigravity-debug] getRenderableBounds: bounds is empty! Fallback setFromObject (local):", {
      min: [fallbackLocal.min.x, fallbackLocal.min.y, fallbackLocal.min.z],
      max: [fallbackLocal.max.x, fallbackLocal.max.y, fallbackLocal.max.z]
    });
    return fallbackLocal;
  }

  console.log("[antigravity-debug] getRenderableBounds returning final bounds:", {
    min: [bounds.min.x, bounds.min.y, bounds.min.z],
    max: [bounds.max.x, bounds.max.y, bounds.max.z]
  });
  return bounds;
}

function getSceneFitScale(scene: THREE.Object3D, fitHeight?: number, fitMaxSize?: number) {
  if (fitHeight === undefined && fitMaxSize === undefined) return 1;
  const bounds = getRenderableBounds(scene);
  if (bounds.isEmpty()) {
    console.log("[antigravity-debug] getSceneFitScale: bounds is empty!", { sceneName: scene.name, fitHeight, fitMaxSize });
    return 1;
  }
  const size = bounds.getSize(new THREE.Vector3());
  let resScale = 1;
  if (fitHeight !== undefined && size.y > 0.0001) {
    resScale = fitHeight / size.y;
  } else {
    const maxSize = Math.max(size.x, size.y, size.z);
    resScale = fitMaxSize !== undefined && maxSize > 0.0001 ? fitMaxSize / maxSize : 1;
  }
  console.log("[antigravity-debug] getSceneFitScale:", {
    sceneName: scene.name,
    fitHeight,
    fitMaxSize,
    size: [size.x, size.y, size.z],
    resScale
  });
  return resScale;
}

function getScaledSceneGroundOffset(scene: THREE.Object3D, scale: number, groundToY?: number) {
  if (groundToY === undefined) return 0;
  const bounds = getRenderableBounds(scene);
  if (bounds.isEmpty()) return 0;
  const offset = groundToY - bounds.min.y * scale;
  console.log("[antigravity-debug] getScaledSceneGroundOffset:", {
    sceneName: scene.name,
    scale,
    groundToY,
    minY: bounds.min.y,
    offset
  });
  return offset;
}

function getGeometryFitScale(geometry: THREE.BufferGeometry, fitHeight?: number, fitMaxSize?: number) {
  if (fitHeight === undefined && fitMaxSize === undefined) return 1;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return 1;
  const size = bounds.getSize(new THREE.Vector3());
  if (fitHeight !== undefined && size.y > 0.0001) {
    return fitHeight / size.y;
  }
  const maxSize = Math.max(size.x, size.y, size.z);
  return fitMaxSize !== undefined && maxSize > 0.0001 ? fitMaxSize / maxSize : 1;
}

function getScaledGeometryGroundOffset(geometry: THREE.BufferGeometry, scale: number, groundToY?: number) {
  if (groundToY === undefined) return 0;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return 0;
  return groundToY - bounds.min.y * scale;
}

function FallbackAsset({
  groundToY,
  markAsTerrain,
  onSceneReady,
  wireframe = false,
}: {
  groundToY?: number;
  markAsTerrain?: boolean;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  wireframe?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    onSceneReady?.(meshRef.current);
  }, [onSceneReady]);

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
      position={[0, groundToY === undefined ? 0 : groundToY + 0.5, 0]}
      userData={markAsTerrain ? { isTerrainSurface: true } : undefined}
    >
      <boxGeometry args={[1.6, 1, 1]} />
      <meshStandardMaterial color="#888888" wireframe={wireframe} />
    </mesh>
  );
}

function LoadedObjModel({
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const source = useLoader(OBJLoader, src);
  const scene = useMemo(
    () => cloneObjectScene(source, wireframe, markAsTerrain),
    [markAsTerrain, source, wireframe],
  );
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize),
    [fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY),
    [fitScale, groundToY, scene],
  );

  useEffect(() => {
    onSceneReady?.(groupRef.current);
  }, [groundOffset, onSceneReady, scene]);

  return (
    <group ref={groupRef} position={[0, groundOffset, 0]} scale={fitScale}>
      <primitive
        object={scene}
        onClick={onMeshClick}
        onPointerDown={onMeshPointerDown}
        onPointerUp={onMeshPointerUp}
      />
    </group>
  );
}

function GeometryModel({
  fitHeight,
  fitMaxSize,
  geometry,
  groundToY,
  markAsTerrain,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  wireframe = false,
}: Omit<ModelLoaderProps, "src"> & { geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const clonedGeometry = useMemo(() => {
    const cloned = geometry.clone();
    if (!cloned.attributes.normal) cloned.computeVertexNormals();
    return cloned;
  }, [geometry]);
  const fitScale = useMemo(
    () => getGeometryFitScale(clonedGeometry, fitHeight, fitMaxSize),
    [clonedGeometry, fitHeight, fitMaxSize],
  );
  const groundOffset = useMemo(
    () => getScaledGeometryGroundOffset(clonedGeometry, fitScale, groundToY),
    [clonedGeometry, fitScale, groundToY],
  );

  useEffect(() => {
    onSceneReady?.(meshRef.current);
  }, [groundOffset, onSceneReady]);

  return (
    <mesh
      castShadow
      geometry={clonedGeometry}
      onClick={onMeshClick}
      onPointerDown={onMeshPointerDown}
      onPointerUp={onMeshPointerUp}
      position={[0, groundOffset, 0]}
      receiveShadow
      ref={meshRef}
      scale={fitScale}
      userData={markAsTerrain ? { isTerrainSurface: true } : undefined}
    >
      <meshStandardMaterial color="#b9b9b9" metalness={0.08} roughness={0.64} wireframe={wireframe} />
    </mesh>
  );
}

function LoadedStlModel(props: ModelLoaderProps) {
  const geometry = useLoader(STLLoader, props.src);
  return <GeometryModel {...props} geometry={geometry} />;
}

function LoadedPlyModel(props: ModelLoaderProps) {
  const geometry = useLoader(PLYLoader, props.src);
  return <GeometryModel {...props} geometry={geometry} />;
}

function LoadedModel({
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const scene = use3DModel(src, { wireframe });
  useEffect(() => {
    if (!markAsTerrain) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.userData.isTerrainSurface = true;
    });
  }, [markAsTerrain, scene]);
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize),
    [fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY),
    [fitScale, groundToY, scene],
  );

  useEffect(() => {
    onSceneReady?.(groupRef.current);
  }, [groundOffset, onSceneReady, scene]);

  return (
    <group ref={groupRef} position={[0, groundOffset, 0]} scale={fitScale}>
      <primitive
        object={scene}
        onClick={onMeshClick}
        onPointerDown={onMeshPointerDown}
        onPointerUp={onMeshPointerUp}
      />
    </group>
  );
}

function LoadedFbxModel({
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const scene = useFbxModel(src, { wireframe });
  useEffect(() => {
    if (!markAsTerrain) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.userData.isTerrainSurface = true;
    });
  }, [markAsTerrain, scene]);
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize),
    [fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY),
    [fitScale, groundToY, scene],
  );

  useEffect(() => {
    onSceneReady?.(groupRef.current);
  }, [groundOffset, onSceneReady, scene]);

  return (
    <group ref={groupRef} position={[0, groundOffset, 0]} scale={fitScale}>
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
  const extension = getSourceExtension(props.src);

  if (isFbxSource(props.src)) {
    return <LoadedFbxModel {...props} />;
  }

  if (extension === "obj") {
    return <LoadedObjModel {...props} />;
  }

  if (extension === "stl") {
    return <LoadedStlModel {...props} />;
  }

  if (extension === "ply") {
    return <LoadedPlyModel {...props} />;
  }

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

export function ThumbnailAutoFit({
  controlsRef,
  model,
}: {
  controlsRef?: React.MutableRefObject<any> | null;
  model: THREE.Object3D | null;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !model) return;
    const controls = controlsRef ? controlsRef.current : null;
    // We import fitThumbnailCamera dynamically or from the lib to avoid circular dependency
    const { fitThumbnailCamera } = require("@/lib/3d/camera");
    fitThumbnailCamera(camera, model, controls);
  }, [camera, controlsRef, model]);

  return null;
}
