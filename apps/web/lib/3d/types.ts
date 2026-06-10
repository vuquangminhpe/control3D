export const ENVIRONMENT_PRESETS = [
  "apartment",
  "city",
  "dawn",
  "forest",
  "lobby",
  "night",
  "park",
  "studio",
  "sunset",
  "warehouse",
] as const;

export type EnvironmentPreset = (typeof ENVIRONMENT_PRESETS)[number];
export type TransformMode = "translate" | "rotate" | "scale";
export type EditorInteractionMode = "orbit" | "select" | "transform";
export type Vector3Tuple = [number, number, number];
export type TransformState = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

export type MaterialDraft = {
  color: string;
  doubleSided: boolean;
  metalness: number;
  roughness: number;
  wireframe: boolean;
};

export type MeshSelection = {
  id: string;
  material: MaterialDraft | null;
  name: string;
};

export type OptimizationMetadata = {
  compression: "draco" | "none";
  deliveryFileSize: number;
  deliveryFileUrl: string;
  originalFileSize: number;
  originalFileUrl: string;
  savingsBytes: number;
  savingsRatio: number;
  sourceFormat: string;
  status: "optimized" | "skipped";
  statusReason: string | null;
};
