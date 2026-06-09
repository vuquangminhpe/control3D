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