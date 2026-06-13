import * as THREE from "three";

type OrbitControlsLike = {
  target: THREE.Vector3;
  update: () => void;
};

export function fitCameraToModel(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
  model: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const fov = camera.fov * (Math.PI / 180);
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 100, 100);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(distance, distance * 0.5, distance));
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export function fitThumbnailCamera(
  camera: THREE.PerspectiveCamera,
  model: THREE.Object3D,
  controls?: OrbitControlsLike | null,
  paddingFactor = 1.3
) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const fov = camera.fov * (Math.PI / 180);
  const aspect = camera.aspect || 1;
  const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);

  const distanceY = (size.y / 2) / Math.tan(fov / 2);
  const distanceX = (size.x / 2) / Math.tan(fovH / 2);
  let distance = Math.max(distanceY, distanceX, size.z / 2) * paddingFactor;

  if (distance < 0.1) distance = 0.5;

  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 100, 100);

  // Position at front-right-elevated angle
  const dir = new THREE.Vector3(0.35, 0.25, 1.0).normalize().multiplyScalar(distance);
  camera.position.copy(center).add(dir);

  if (controls) {
    controls.target.copy(center);
    controls.update();
  } else {
    camera.lookAt(center);
  }
  camera.updateProjectionMatrix();
}

export function getIntelligentScaleMultiplier(name: string): number {
  const lowercaseName = name.toLowerCase();

  // Very large structures
  if (
    lowercaseName.includes("house") ||
    lowercaseName.includes("building") ||
    lowercaseName.includes("castle") ||
    lowercaseName.includes("tower") ||
    lowercaseName.includes("ruin") ||
    lowercaseName.includes("fort") ||
    lowercaseName.includes("temple") ||
    lowercaseName.includes("dungeon") ||
    lowercaseName.includes("cathedral") ||
    lowercaseName.includes("palace") ||
    lowercaseName.includes("ship") ||
    lowercaseName.includes("barn") ||
    lowercaseName.includes("wall_large") ||
    lowercaseName.includes("gatehouse")
  ) {
    return 6.5; // Scale up for massive buildings
  }

  // Medium-large environment / buildings
  if (
    lowercaseName.includes("cottage") ||
    lowercaseName.includes("cabin") ||
    lowercaseName.includes("shack") ||
    lowercaseName.includes("gate") ||
    lowercaseName.includes("bridge") ||
    lowercaseName.includes("windmill") ||
    lowercaseName.includes("statue") ||
    lowercaseName.includes("well") ||
    lowercaseName.includes("fountain") ||
    lowercaseName.includes("tent") ||
    lowercaseName.includes("cart") ||
    lowercaseName.includes("wagon") ||
    lowercaseName.includes("carriage") ||
    lowercaseName.includes("boat") ||
    lowercaseName.includes("tree_large") ||
    lowercaseName.includes("rock_large") ||
    lowercaseName.includes("cliff") ||
    lowercaseName.includes("mountain") ||
    lowercaseName.includes("crypt")
  ) {
    return 3.0; // Scale up for medium structures / large trees
  }

  // Normal environment / medium props
  if (
    lowercaseName.includes("tree") ||
    lowercaseName.includes("bush") ||
    lowercaseName.includes("shrub") ||
    lowercaseName.includes("rock") ||
    lowercaseName.includes("stone") ||
    lowercaseName.includes("pillar") ||
    lowercaseName.includes("column") ||
    lowercaseName.includes("portal") ||
    lowercaseName.includes("campfire") ||
    lowercaseName.includes("furnace") ||
    lowercaseName.includes("anvil") ||
    lowercaseName.includes("bed") ||
    lowercaseName.includes("wardrobe") ||
    lowercaseName.includes("door") ||
    lowercaseName.includes("cabinet")
  ) {
    return 1.8; // Scale up for trees, rocks, portals, and large furniture
  }

  // Small-medium props
  if (
    lowercaseName.includes("chest") ||
    lowercaseName.includes("barrel") ||
    lowercaseName.includes("box") ||
    lowercaseName.includes("crate") ||
    lowercaseName.includes("chair") ||
    lowercaseName.includes("table") ||
    lowercaseName.includes("bench") ||
    lowercaseName.includes("stool") ||
    lowercaseName.includes("shelf") ||
    lowercaseName.includes("rack") ||
    lowercaseName.includes("bucket") ||
    lowercaseName.includes("pot") ||
    lowercaseName.includes("urn") ||
    lowercaseName.includes("vase") ||
    lowercaseName.includes("sack") ||
    lowercaseName.includes("bag") ||
    lowercaseName.includes("coffin") ||
    lowercaseName.includes("tombstone") ||
    lowercaseName.includes("grave") ||
    lowercaseName.includes("torch") ||
    lowercaseName.includes("lamp") ||
    lowercaseName.includes("lantern") ||
    lowercaseName.includes("candle") ||
    lowercaseName.includes("candelabra") ||
    lowercaseName.includes("signpost") ||
    lowercaseName.includes("sign") ||
    lowercaseName.includes("fence") ||
    lowercaseName.includes("barrier") ||
    lowercaseName.includes("ladder")
  ) {
    return 0.85; // Scale down slightly for props
  }

  // Small items / collectibles / weapons
  if (
    lowercaseName.includes("coin") ||
    lowercaseName.includes("gold") ||
    lowercaseName.includes("money") ||
    lowercaseName.includes("gem") ||
    lowercaseName.includes("crystal") ||
    lowercaseName.includes("potion") ||
    lowercaseName.includes("bottle") ||
    lowercaseName.includes("flask") ||
    lowercaseName.includes("cup") ||
    lowercaseName.includes("goblet") ||
    lowercaseName.includes("plate") ||
    lowercaseName.includes("bowl") ||
    lowercaseName.includes("key") ||
    lowercaseName.includes("book") ||
    lowercaseName.includes("scroll") ||
    lowercaseName.includes("map") ||
    lowercaseName.includes("sword") ||
    lowercaseName.includes("blade") ||
    lowercaseName.includes("shield") ||
    lowercaseName.includes("dagger") ||
    lowercaseName.includes("knife") ||
    lowercaseName.includes("axe") ||
    lowercaseName.includes("spear") ||
    lowercaseName.includes("hammer") ||
    lowercaseName.includes("club") ||
    lowercaseName.includes("staff") ||
    lowercaseName.includes("wand") ||
    lowercaseName.includes("bow") ||
    lowercaseName.includes("arrow") ||
    lowercaseName.includes("quiver") ||
    lowercaseName.includes("helmet") ||
    lowercaseName.includes("crown") ||
    lowercaseName.includes("ring") ||
    lowercaseName.includes("necklace") ||
    lowercaseName.includes("amulet") ||
    lowercaseName.includes("apple") ||
    lowercaseName.includes("bread") ||
    lowercaseName.includes("meat") ||
    lowercaseName.includes("fish") ||
    lowercaseName.includes("carrot") ||
    lowercaseName.includes("cheese")
  ) {
    return 0.35; // Scale down significantly for small items
  }

  return 1.0; // Default scale multiplier
}
