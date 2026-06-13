import type { ModelCategory, ModelFormat, ModelRecord } from "@/lib/model-store";

export type RiggingStatus =
  | "static"
  | "needs_rig"
  | "marker_ready"
  | "rigging_queued"
  | "rigged"
  | "failed";

export type RigMarkerName =
  | "chin"
  | "chest"
  | "groin"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHand"
  | "rightHand"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle"
  | "leftFoot"
  | "rightFoot";

export type RigMarker = {
  name: RigMarkerName;
  position: [number, number, number];
};

export type RiggingMetadata = {
  status: RiggingStatus;
  rigType: "humanoid" | "static" | "custom";
  source: "inferred" | "manual_markers" | "existing_skeleton" | "backend_job";
  markers: RigMarker[];
  boneMapPreset?: "control3d_humanoid" | "mixamo" | "vrm" | "custom";
  riggedModelUrl?: string;
  statusReason?: string;
  updatedAt: string;
};

export const rigMarkerLabels: Record<RigMarkerName, string> = {
  chin: "Chin / Head",
  chest: "Chest",
  groin: "Groin / Hips",
  leftShoulder: "Left shoulder",
  rightShoulder: "Right shoulder",
  leftElbow: "Left elbow",
  rightElbow: "Right elbow",
  leftWrist: "Left wrist",
  rightWrist: "Right wrist",
  leftHand: "Left hand",
  rightHand: "Right hand",
  leftKnee: "Left knee",
  rightKnee: "Right knee",
  leftAnkle: "Left ankle",
  rightAnkle: "Right ankle",
  leftFoot: "Left foot",
  rightFoot: "Right foot",
};

export const rigMarkerOrder: RigMarkerName[] = [
  "chin",
  "chest",
  "groin",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftHand",
  "rightHand",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "leftFoot",
  "rightFoot",
];

export const defaultHumanoidMarkers: RigMarker[] = [
  { name: "chin", position: [0, 1.75, 0] },
  { name: "chest", position: [0, 1.28, 0] },
  { name: "groin", position: [0, 0.9, 0] },
  { name: "leftShoulder", position: [-0.32, 1.42, 0] },
  { name: "rightShoulder", position: [0.32, 1.42, 0] },
  { name: "leftElbow", position: [-0.72, 1.08, 0] },
  { name: "rightElbow", position: [0.72, 1.08, 0] },
  { name: "leftWrist", position: [-0.88, 0.74, 0] },
  { name: "rightWrist", position: [0.88, 0.74, 0] },
  { name: "leftHand", position: [-1.02, 0.66, 0] },
  { name: "rightHand", position: [1.02, 0.66, 0] },
  { name: "leftKnee", position: [-0.18, 0.45, 0] },
  { name: "rightKnee", position: [0.18, 0.45, 0] },
  { name: "leftAnkle", position: [-0.18, 0.12, 0.02] },
  { name: "rightAnkle", position: [0.18, 0.12, 0.02] },
  { name: "leftFoot", position: [-0.18, 0.04, 0.08] },
  { name: "rightFoot", position: [0.18, 0.04, 0.08] },
];

const supportedHumanoidFormats: ModelFormat[] = ["glb", "gltf", "fbx", "obj"];

function isRiggingMetadata(value: unknown): value is RiggingMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RiggingMetadata>;
  return typeof candidate.status === "string" && typeof candidate.rigType === "string";
}

export function isHumanoidRigCandidate(input: {
  category: ModelCategory;
  format: ModelFormat;
}) {
  return input.category === "character" && supportedHumanoidFormats.includes(input.format);
}

export function inferInitialRiggingMetadata(input: {
  category: ModelCategory;
  format: ModelFormat;
  hasAnimations: boolean;
}): RiggingMetadata {
  const updatedAt = new Date().toISOString();

  if (input.hasAnimations) {
    return {
      status: "rigged",
      rigType: "humanoid",
      source: "existing_skeleton",
      markers: [],
      boneMapPreset: "custom",
      statusReason: "Uploaded asset already reports animation clips.",
      updatedAt,
    };
  }

  if (isHumanoidRigCandidate(input)) {
    return {
      status: "needs_rig",
      rigType: "humanoid",
      source: "inferred",
      markers: [],
      boneMapPreset: "control3d_humanoid",
      statusReason: "Character assets need a humanoid skeleton before Control3D actions can be applied.",
      updatedAt,
    };
  }

  return {
    status: "static",
    rigType: "static",
    source: "inferred",
    markers: [],
    statusReason: "Static assets can be used as props, maps, or placed objects.",
    updatedAt,
  };
}

export function getRiggingMetadata(model: Pick<ModelRecord, "customProps" | "category" | "format" | "hasAnimations">) {
  const rigging = model.customProps?.rigging;
  if (isRiggingMetadata(rigging)) return rigging;

  return inferInitialRiggingMetadata({
    category: model.category,
    format: model.format,
    hasAnimations: model.hasAnimations,
  });
}

export function parseMarkerVector(input: unknown): [number, number, number] | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const values = input.map((value) => Number(value));
  return values.every((value) => Number.isFinite(value))
    ? ([values[0], values[1], values[2]] as [number, number, number])
    : null;
}

export function normalizeRigMarkers(input: unknown): RigMarker[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<RigMarkerName>();
  const markers: RigMarker[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const marker = entry as Partial<RigMarker>;
    if (!marker.name || !rigMarkerOrder.includes(marker.name)) continue;
    if (seen.has(marker.name)) continue;
    const position = parseMarkerVector(marker.position);
    if (!position) continue;
    seen.add(marker.name);
    markers.push({ name: marker.name, position });
  }

  const withInferredMarkers = [...markers];
  const inferMarker = (name: RigMarkerName, from: RigMarkerName, toward: RigMarkerName, factor: number) => {
    if (withInferredMarkers.some((marker) => marker.name === name)) return;
    const start = withInferredMarkers.find((marker) => marker.name === from)?.position;
    const end = withInferredMarkers.find((marker) => marker.name === toward)?.position;
    if (!start || !end) return;
    const vector = [
      start[0] - end[0],
      start[1] - end[1],
      start[2] - end[2],
    ] as [number, number, number];
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    withInferredMarkers.push({
      name,
      position: [
        start[0] + (vector[0] / length) * Math.max(length * factor, 0.08),
        start[1] + (vector[1] / length) * Math.max(length * factor, 0.08),
        start[2] + (vector[2] / length) * Math.max(length * factor, 0.08),
      ],
    });
  };
  const inferBetween = (name: RigMarkerName, from: RigMarkerName, toward: RigMarkerName, factor: number) => {
    if (withInferredMarkers.some((marker) => marker.name === name)) return;
    const start = withInferredMarkers.find((marker) => marker.name === from)?.position;
    const end = withInferredMarkers.find((marker) => marker.name === toward)?.position;
    if (!start || !end) return;
    withInferredMarkers.push({
      name,
      position: [
        start[0] + (end[0] - start[0]) * factor,
        start[1] + (end[1] - start[1]) * factor,
        start[2] + (end[2] - start[2]) * factor,
      ],
    });
  };

  inferMarker("leftHand", "leftWrist", "leftElbow", 0.28);
  inferMarker("rightHand", "rightWrist", "rightElbow", 0.28);
  inferBetween("leftAnkle", "leftFoot", "leftKnee", 0.18);
  inferBetween("rightAnkle", "rightFoot", "rightKnee", 0.18);

  return rigMarkerOrder
    .map((name) => withInferredMarkers.find((marker) => marker.name === name))
    .filter((marker): marker is RigMarker => Boolean(marker));
}
