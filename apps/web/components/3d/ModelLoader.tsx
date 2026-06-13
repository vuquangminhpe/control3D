"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OBJLoader, PLYLoader, STLLoader } from "three-stdlib";
import { isFbxSource, isGltfSource, use3DModel, useFbxModel } from "@/hooks/use3DModel";
import { log3DDebug } from "@/lib/3d/debug";
import { cloneMeshMaterial } from "@/lib/3d/materials";

type MeshPointerHandler = (event: ThreeEvent<PointerEvent>) => void;
type MeshClickHandler = (event: ThreeEvent<MouseEvent>) => void;
type ModelLoaderProps = {
  debugLabel?: string;
  fitHeight?: number;
  fitMaxSize?: number;
  groundToY?: number;
  markAsTerrain?: boolean;
  onMetrics?: (metrics: ModelLoaderMetrics) => void;
  onMeshClick?: MeshClickHandler;
  onMeshPointerDown?: MeshPointerHandler;
  onMeshPointerUp?: MeshPointerHandler;
  onSceneReady?: (scene: THREE.Object3D | null) => void;
  src: string;
  wireframe?: boolean;
};

export type ModelLoaderMetrics = {
  bounds: {
    max: [number, number, number];
    min: [number, number, number];
    size: [number, number, number];
  };
  fitScale: number;
  rawMaxSize: number;
  rawHeight: number;
  src: string;
};

type ModelDebugContext = {
  debugLabel?: string;
  extension?: string;
  fitHeight?: number;
  fitMaxSize?: number;
  groundToY?: number;
  loader: string;
  markAsTerrain?: boolean;
  phase?: string;
  src?: string;
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

const IGNORED_BOUNDS_NAME_PARTS = [
  "sky",
  "dome",
  "water",
  "sea",
  "ocean",
  "fog",
  "cloud",
  "grid",
  "helper",
  "collision",
  "collider",
  "trigger",
  "spawn",
];

function objectOrAncestorNameMatches(object: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    const name = (current.name || "").toLowerCase();
    if (IGNORED_BOUNDS_NAME_PARTS.some((part) => name.includes(part))) {
      return true;
    }
    if (current === root) break;
    current = current.parent;
  }
  return false;
}

function finiteBoundsTuple(vector: THREE.Vector3) {
  return [vector.x, vector.y, vector.z].map((value) =>
    Number(value.toFixed(4)),
  ) as [number, number, number];
}

function objectTransformSnapshot(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  return {
    localPosition: finiteBoundsTuple(object.position),
    localRotation: finiteBoundsTuple(new THREE.Vector3(
      THREE.MathUtils.radToDeg(object.rotation.x),
      THREE.MathUtils.radToDeg(object.rotation.y),
      THREE.MathUtils.radToDeg(object.rotation.z),
    )),
    localScale: finiteBoundsTuple(object.scale),
    worldPosition: finiteBoundsTuple(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld)),
    worldScale: finiteBoundsTuple(new THREE.Vector3().setFromMatrixScale(object.matrixWorld)),
  };
}

function getBoundsDebugKey(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const scale = new THREE.Vector3().setFromMatrixScale(object.matrixWorld);
  const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  return [
    object.uuid,
    ...finiteBoundsTuple(scale),
    ...finiteBoundsTuple(position),
  ].join(":");
}

export function getRenderableBounds(object: THREE.Object3D, context?: Partial<ModelDebugContext>) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();

  const inverseParentMatrix = new THREE.Matrix4();
  try {
    if (object.parent) {
      object.parent.updateMatrixWorld(true);
      inverseParentMatrix.copy(object.parent.matrixWorld).invert();
    } else {
      inverseParentMatrix.identity();
    }
  } catch {
    inverseParentMatrix.identity();
  }

  const relativeMatrix = new THREE.Matrix4();
  let totalMeshCount = 0;
  let includedMeshCount = 0;
  let ignoredMeshCount = 0;
  let emptyMeshCount = 0;
  const children: unknown[] = [];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
    totalMeshCount += 1;
    const childTransform = objectTransformSnapshot(child);
    const childName = child.name || "";
    const childBase = {
      index: totalMeshCount,
      name: childName,
      type: child.type,
      uuid: child.uuid,
      visible: child.visible,
      ...childTransform,
    };

    if (!child.visible || objectOrAncestorNameMatches(child, object)) {
      ignoredMeshCount += 1;
      children.push({
        ...childBase,
        boundsStatus: "ignored",
        ignoreReason: !child.visible ? "hidden" : "name-filter",
      });
      return;
    }

    const geometry = child.geometry;
    if (!geometry) {
      emptyMeshCount += 1;
      children.push({
        ...childBase,
        boundsStatus: "empty",
        ignoreReason: "missing-geometry",
      });
      return;
    }

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (!bbox || bbox.isEmpty()) {
      emptyMeshCount += 1;
      children.push({
        ...childBase,
        boundsStatus: "empty",
        ignoreReason: "empty-bounding-box",
      });
      return;
    }

    relativeMatrix.multiplyMatrices(inverseParentMatrix, child.matrixWorld);
    localBounds.copy(bbox).applyMatrix4(relativeMatrix);
    bounds.union(localBounds);
    includedMeshCount += 1;
    children.push({
      ...childBase,
      boundsStatus: "included",
      geometryBounds: {
        min: finiteBoundsTuple(bbox.min),
        max: finiteBoundsTuple(bbox.max),
        size: finiteBoundsTuple(bbox.getSize(new THREE.Vector3())),
      },
      renderableBounds: {
        min: finiteBoundsTuple(localBounds.min),
        max: finiteBoundsTuple(localBounds.max),
        size: finiteBoundsTuple(localBounds.getSize(new THREE.Vector3())),
      },
    });
  });

  if (bounds.isEmpty()) {
    const fallbackWorld = new THREE.Box3().setFromObject(object);
    const fallbackLocal = fallbackWorld.clone().applyMatrix4(inverseParentMatrix);
    log3DDebug(
      `bounds-empty:${getBoundsDebugKey(object)}`,
      "Renderable bounds fell back to setFromObject",
      {
        context,
        name: object.name,
        type: object.type,
        uuid: object.uuid,
        rootTransform: objectTransformSnapshot(object),
        totalMeshCount,
        ignoredMeshCount,
        emptyMeshCount,
        min: finiteBoundsTuple(fallbackLocal.min),
        max: finiteBoundsTuple(fallbackLocal.max),
        size: finiteBoundsTuple(fallbackLocal.getSize(new THREE.Vector3())),
        children,
      },
      { once: true },
    );
    return fallbackLocal;
  }

  log3DDebug(
    `bounds:${getBoundsDebugKey(object)}`,
    "Renderable bounds",
    {
      context,
      name: object.name,
      type: object.type,
      uuid: object.uuid,
      rootTransform: objectTransformSnapshot(object),
      totalMeshCount,
      includedMeshCount,
      ignoredMeshCount,
      emptyMeshCount,
      min: finiteBoundsTuple(bounds.min),
      max: finiteBoundsTuple(bounds.max),
      size: finiteBoundsTuple(bounds.getSize(new THREE.Vector3())),
      children,
    },
    { once: true },
  );
  return bounds;
}

function getSceneFitScale(scene: THREE.Object3D, fitHeight?: number, fitMaxSize?: number, context?: Partial<ModelDebugContext>) {
  if (fitHeight === undefined && fitMaxSize === undefined) return 1;
  const bounds = getRenderableBounds(scene, { ...context, phase: "fit-scale" });
  if (bounds.isEmpty()) {
    log3DDebug(
      `fit-empty:${scene.uuid}`,
      "Scene fit skipped because bounds are empty",
      { context, sceneName: scene.name, fitHeight, fitMaxSize },
      { once: true },
    );
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
  log3DDebug(
    `fit:${scene.uuid}:${fitHeight ?? "auto"}:${fitMaxSize ?? "auto"}`,
    "Scene fit scale",
    {
      context,
      sceneName: scene.name,
      sceneUuid: scene.uuid,
      fitHeight,
      fitMaxSize,
      boundsMin: finiteBoundsTuple(bounds.min),
      boundsMax: finiteBoundsTuple(bounds.max),
      size: finiteBoundsTuple(size),
      resScale,
      fittedHeight: Number((size.y * resScale).toFixed(4)),
      fittedMaxSize: Number((Math.max(size.x, size.y, size.z) * resScale).toFixed(4)),
    },
    { once: true },
  );
  return resScale;
}

function getScaledSceneGroundOffset(scene: THREE.Object3D, scale: number, groundToY?: number, context?: Partial<ModelDebugContext>) {
  if (groundToY === undefined) return 0;
  const bounds = getRenderableBounds(scene, { ...context, phase: "ground-offset" });
  if (bounds.isEmpty()) return 0;
  const offset = groundToY - bounds.min.y * scale;
  log3DDebug(
    `ground:${scene.uuid}:${scale}:${groundToY}`,
    "Scene ground offset",
    {
      context,
      sceneName: scene.name,
      sceneUuid: scene.uuid,
      scale,
      groundToY,
      minY: Number(bounds.min.y.toFixed(4)),
      offset: Number(offset.toFixed(4)),
      scaledMinY: Number((bounds.min.y * scale).toFixed(4)),
      scaledMaxY: Number((bounds.max.y * scale).toFixed(4)),
    },
    { once: true },
  );
  return offset;
}

function logLoadedModelPlacement(
  group: THREE.Object3D | null,
  scene: THREE.Object3D,
  fitScale: number,
  groundOffset: number,
  context: ModelDebugContext,
) {
  if (!group) return;
  group.updateMatrixWorld(true);
  const localRenderableBounds = getRenderableBounds(scene, {
    ...context,
    phase: "final-placement-local-bounds",
  });
  const finalBounds = localRenderableBounds.isEmpty()
    ? new THREE.Box3()
    : localRenderableBounds.clone().applyMatrix4(group.matrixWorld);
  log3DDebug(
    `placement:${scene.uuid}:${fitScale}:${groundOffset}:${context.debugLabel ?? context.loader}`,
    "ModelLoader final placement",
    {
      context,
      sceneName: scene.name,
      sceneUuid: scene.uuid,
      fitScale,
      groundOffset,
      groupTransform: objectTransformSnapshot(group),
      sceneTransform: objectTransformSnapshot(scene),
      localRenderableBounds: localRenderableBounds.isEmpty() ? null : {
        min: finiteBoundsTuple(localRenderableBounds.min),
        max: finiteBoundsTuple(localRenderableBounds.max),
        size: finiteBoundsTuple(localRenderableBounds.getSize(new THREE.Vector3())),
      },
      worldBounds: finalBounds.isEmpty() ? null : {
        min: finiteBoundsTuple(finalBounds.min),
        max: finiteBoundsTuple(finalBounds.max),
        size: finiteBoundsTuple(finalBounds.getSize(new THREE.Vector3())),
      },
    },
    { once: true },
  );
}

function getModelLoaderMetrics(
  scene: THREE.Object3D,
  fitScale: number,
  src: string,
): ModelLoaderMetrics | null {
  const bounds = getRenderableBounds(scene, {
    loader: "metrics",
    phase: "model-loader-metrics",
    src,
  });
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  return {
    bounds: {
      min: finiteBoundsTuple(bounds.min),
      max: finiteBoundsTuple(bounds.max),
      size: finiteBoundsTuple(size),
    },
    fitScale,
    rawMaxSize: Math.max(size.x, size.y, size.z),
    rawHeight: size.y,
    src,
  };
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
  debugLabel,
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMetrics,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const source = useLoader(OBJLoader, src);
  const debugContext = useMemo<ModelDebugContext>(() => ({
    debugLabel,
    extension: "obj",
    fitHeight,
    fitMaxSize,
    groundToY,
    loader: "obj",
    markAsTerrain,
    src,
    wireframe,
  }), [debugLabel, fitHeight, fitMaxSize, groundToY, markAsTerrain, src, wireframe]);
  const scene = useMemo(
    () => cloneObjectScene(source, wireframe, markAsTerrain),
    [markAsTerrain, source, wireframe],
  );
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize, debugContext),
    [debugContext, fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY, debugContext),
    [debugContext, fitScale, groundToY, scene],
  );

  useEffect(() => {
    logLoadedModelPlacement(groupRef.current, scene, fitScale, groundOffset, debugContext);
    const metrics = getModelLoaderMetrics(scene, fitScale, src);
    if (metrics) onMetrics?.(metrics);
    onSceneReady?.(groupRef.current);
  }, [debugContext, fitScale, groundOffset, onMetrics, onSceneReady, scene, src]);

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
  debugLabel,
  fitHeight,
  fitMaxSize,
  geometry,
  groundToY,
  markAsTerrain,
  onMetrics,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps & { geometry: THREE.BufferGeometry }) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const debugContext = useMemo<ModelDebugContext>(() => ({
    debugLabel,
    fitHeight,
    fitMaxSize,
    groundToY,
    loader: "geometry",
    markAsTerrain,
    src,
    wireframe,
  }), [debugLabel, fitHeight, fitMaxSize, groundToY, markAsTerrain, src, wireframe]);
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
    if (meshRef.current) {
      const worldBounds = new THREE.Box3().setFromObject(meshRef.current);
      log3DDebug(
        `geometry-placement:${meshRef.current.uuid}:${fitScale}:${groundOffset}`,
        "GeometryModel final placement",
        {
          context: debugContext,
          fitScale,
          groundOffset,
          meshTransform: objectTransformSnapshot(meshRef.current),
          worldBounds: worldBounds.isEmpty() ? null : {
            min: finiteBoundsTuple(worldBounds.min),
            max: finiteBoundsTuple(worldBounds.max),
            size: finiteBoundsTuple(worldBounds.getSize(new THREE.Vector3())),
          },
        },
        { once: true },
      );
    }
    clonedGeometry.computeBoundingBox();
    const bounds = clonedGeometry.boundingBox;
    if (bounds) {
      const size = bounds.getSize(new THREE.Vector3());
      onMetrics?.({
        bounds: {
          min: finiteBoundsTuple(bounds.min),
          max: finiteBoundsTuple(bounds.max),
          size: finiteBoundsTuple(size),
        },
        fitScale,
        rawMaxSize: Math.max(size.x, size.y, size.z),
        rawHeight: size.y,
        src,
      });
    }
    onSceneReady?.(meshRef.current);
  }, [clonedGeometry, debugContext, fitScale, groundOffset, onMetrics, onSceneReady, src]);

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
  debugLabel,
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMetrics,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const scene = use3DModel(src, { wireframe });
  const debugContext = useMemo<ModelDebugContext>(() => ({
    debugLabel,
    extension: "glb/gltf",
    fitHeight,
    fitMaxSize,
    groundToY,
    loader: "gltf",
    markAsTerrain,
    src,
    wireframe,
  }), [debugLabel, fitHeight, fitMaxSize, groundToY, markAsTerrain, src, wireframe]);
  useEffect(() => {
    if (!markAsTerrain) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.userData.isTerrainSurface = true;
    });
  }, [markAsTerrain, scene]);
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize, debugContext),
    [debugContext, fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY, debugContext),
    [debugContext, fitScale, groundToY, scene],
  );

  useEffect(() => {
    logLoadedModelPlacement(groupRef.current, scene, fitScale, groundOffset, debugContext);
    const metrics = getModelLoaderMetrics(scene, fitScale, src);
    if (metrics) onMetrics?.(metrics);
    onSceneReady?.(groupRef.current);
  }, [debugContext, fitScale, groundOffset, onMetrics, onSceneReady, scene, src]);

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
  debugLabel,
  fitHeight,
  fitMaxSize,
  groundToY,
  markAsTerrain,
  onMetrics,
  onMeshClick,
  onMeshPointerDown,
  onMeshPointerUp,
  onSceneReady,
  src,
  wireframe = false,
}: ModelLoaderProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const scene = useFbxModel(src, { wireframe });
  const debugContext = useMemo<ModelDebugContext>(() => ({
    debugLabel,
    extension: "fbx",
    fitHeight,
    fitMaxSize,
    groundToY,
    loader: "fbx",
    markAsTerrain,
    src,
    wireframe,
  }), [debugLabel, fitHeight, fitMaxSize, groundToY, markAsTerrain, src, wireframe]);
  useEffect(() => {
    if (!markAsTerrain) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) child.userData.isTerrainSurface = true;
    });
  }, [markAsTerrain, scene]);
  const fitScale = useMemo(
    () => getSceneFitScale(scene, fitHeight, fitMaxSize, debugContext),
    [debugContext, fitHeight, fitMaxSize, scene],
  );
  const groundOffset = useMemo(
    () => getScaledSceneGroundOffset(scene, fitScale, groundToY, debugContext),
    [debugContext, fitScale, groundToY, scene],
  );

  useEffect(() => {
    logLoadedModelPlacement(groupRef.current, scene, fitScale, groundOffset, debugContext);
    const metrics = getModelLoaderMetrics(scene, fitScale, src);
    if (metrics) onMetrics?.(metrics);
    onSceneReady?.(groupRef.current);
  }, [debugContext, fitScale, groundOffset, onMetrics, onSceneReady, scene, src]);

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
