import * as THREE from "three";
import type { MaterialDraft } from "@/lib/3d/types";

function createStandardMaterial(material: THREE.Material) {
  const nextMaterial = new THREE.MeshStandardMaterial({
    color:
      "color" in material && material.color instanceof THREE.Color
        ? material.color.clone()
        : new THREE.Color("#c9c3b8"),
    opacity: material.opacity,
    side: material.side,
    transparent: material.transparent,
  });

  if ("map" in material && material.map instanceof THREE.Texture) {
    nextMaterial.map = material.map;
  }

  return nextMaterial;
}

export function cloneMeshMaterial(
  material: THREE.Material,
  wireframe = false,
) {
  const nextMaterial =
    material instanceof THREE.MeshStandardMaterial
      ? material.clone()
      : createStandardMaterial(material);
  nextMaterial.wireframe = wireframe;
  nextMaterial.needsUpdate = true;

  return nextMaterial;
}

function getEditableMaterial(material: THREE.Material) {
  return material instanceof THREE.MeshStandardMaterial
    ? material
    : createStandardMaterial(material);
}

function getPrimaryMaterial(mesh: THREE.Mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

export function readMaterialDraft(mesh: THREE.Mesh): MaterialDraft | null {
  const primaryMaterial = getPrimaryMaterial(mesh);
  if (!primaryMaterial) {
    return null;
  }

  const editableMaterial = getEditableMaterial(primaryMaterial);

  return {
    color: `#${editableMaterial.color.getHexString()}`,
    doubleSided: editableMaterial.side === THREE.DoubleSide,
    metalness: editableMaterial.metalness,
    roughness: editableMaterial.roughness,
    wireframe: editableMaterial.wireframe,
  };
}

export function applyMaterialDraft(mesh: THREE.Mesh, draft: MaterialDraft) {
  const apply = (material: THREE.Material) => {
    const editableMaterial = getEditableMaterial(material);
    editableMaterial.color.set(draft.color);
    editableMaterial.metalness = draft.metalness;
    editableMaterial.roughness = draft.roughness;
    editableMaterial.side = draft.doubleSided
      ? THREE.DoubleSide
      : THREE.FrontSide;
    editableMaterial.wireframe = draft.wireframe;
    editableMaterial.needsUpdate = true;

    return editableMaterial;
  };

  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map(apply);
    return;
  }

  mesh.material = apply(mesh.material);
}