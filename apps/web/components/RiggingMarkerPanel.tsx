"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ModelRecord } from "@/lib/model-store";
import {
  defaultHumanoidMarkers,
  getRiggingMetadata,
  isHumanoidRigCandidate,
  normalizeRigMarkers,
  rigMarkerLabels,
  rigMarkerOrder,
  type RigMarker,
  type RigMarkerName,
} from "@/lib/model-rigging";

const markerColorByGroup: Record<string, string> = {
  head: "#f7d774",
  torso: "#00ffc4",
  shoulder: "#7dd3fc",
  elbow: "#a78bfa",
  wrist: "#fb7185",
  hand: "#f43f5e",
  knee: "#f97316",
  ankle: "#22c55e",
  foot: "#84cc16",
};

const markerGroupByName: Record<RigMarkerName, keyof typeof markerColorByGroup> = {
  chin: "head",
  chest: "torso",
  groin: "torso",
  leftShoulder: "shoulder",
  rightShoulder: "shoulder",
  leftElbow: "elbow",
  rightElbow: "elbow",
  leftWrist: "wrist",
  rightWrist: "wrist",
  leftHand: "hand",
  rightHand: "hand",
  leftKnee: "knee",
  rightKnee: "knee",
  leftAnkle: "ankle",
  rightAnkle: "ankle",
  leftFoot: "foot",
  rightFoot: "foot",
};

const markerLegend = [
  ["head", "Head"],
  ["torso", "Chest / Hips"],
  ["shoulder", "Shoulder"],
  ["elbow", "Elbow"],
  ["wrist", "Wrist"],
  ["hand", "Hand"],
  ["knee", "Knee"],
  ["ankle", "Ankle"],
  ["foot", "Foot"],
] as const;

const riggingPreviewViews = [
  { value: "front", label: "Front" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "back", label: "Back" },
] as const;

type RiggingPreviewView = (typeof riggingPreviewViews)[number]["value"];
type MarkerPlacementTool = "pick" | "pan";

function toMarkerInput(marker: RigMarker) {
  return marker.position.map((value) => Number(value.toFixed(3))).join(", ");
}

function parseMarkerInput(value: string): [number, number, number] | null {
  const values = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  return values.length === 3
    ? ([values[0], values[1], values[2]] as [number, number, number])
    : null;
}

type RiggingMarkerPanelProps = {
  model: ModelRecord;
  onRigComplete?: (riggedModelUrl: string | null) => void;
};

export function RiggingMarkerPanel({ model, onRigComplete }: RiggingMarkerPanelProps) {
  const router = useRouter();
  const rigging = getRiggingMetadata(model);
  const isCandidate = isHumanoidRigCandidate(model);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedMarkers, setHasSavedMarkers] = useState(rigging.markers.length > 0);
  const [isPending, startTransition] = useTransition();
  const [isRiggingPending, startRiggingTransition] = useTransition();
  const [isPicking, startPickingTransition] = useTransition();
  const [activeMarker, setActiveMarker] = useState<RigMarkerName>(rigMarkerOrder[0]);
  const [previewView, setPreviewView] = useState<RiggingPreviewView>("front");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [placementTool, setPlacementTool] = useState<MarkerPlacementTool>("pick");
  const [screenMarkers, setScreenMarkers] = useState<Partial<Record<RigMarkerName, [number, number]>>>({});
  const [pickedMarkers, setPickedMarkers] = useState<Set<RigMarkerName>>(
    () => new Set(rigging.markers.map((marker) => marker.name)),
  );
  const dragRef = useRef({
    moved: false,
    pointerId: -1,
    startPan: { x: 0, y: 0 },
    startPointer: { x: 0, y: 0 },
  });

  const initialInputs = useMemo(() => {
    const source = normalizeRigMarkers(rigging.markers.length ? rigging.markers : defaultHumanoidMarkers);
    return rigMarkerOrder.reduce((acc, name) => {
      const marker = source.find((entry) => entry.name === name);
      acc[name] = marker ? toMarkerInput(marker) : "0, 0, 0";
      return acc;
    }, {} as Record<string, string>);
  }, [rigging.markers]);

  const [markerInputs, setMarkerInputs] = useState(initialInputs);

  if (!isCandidate) {
    return (
      <div className="rigging-panel">
        <div className="rigging-status-card static">
          <span>Rigging status</span>
          <strong>Static asset</strong>
          <p>This model is better used as a prop, map, vehicle, or placed object. Auto-rig is only enabled for humanoid character assets.</p>
        </div>
      </div>
    );
  }

  const saveMarkers = () => {
    setError(null);
    setMessage(null);

    const markers: RigMarker[] = [];
    for (const name of rigMarkerOrder) {
      if (!pickedMarkers.has(name)) {
        setError(`Pick ${rigMarkerLabels[name]} on the model before saving.`);
        return;
      }
      const position = parseMarkerInput(markerInputs[name] ?? "");
      if (!position) {
        setError(`Pick ${rigMarkerLabels[name]} on the model before saving.`);
        return;
      }
      markers.push({ name, position });
    }

    startTransition(async () => {
      const response = await fetch(`/api/models/${model.id}/rigging/markers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markers }),
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !result?.success) {
        setError(result?.error ?? "Failed to save rigging markers");
        return;
      }

      setHasSavedMarkers(true);
      setMessage("Rigging markers saved. This character is ready for the Blender auto-rig job.");
      router.refresh();
    });
  };

  const runAutoRig = () => {
    setError(null);
    setMessage(null);

    startRiggingTransition(async () => {
      const response = await fetch(`/api/models/${model.id}/rigging/run`, {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: { rigging?: { riggedModelUrl?: string } };
        error?: string;
      } | null;

      if (!response.ok || !result?.success) {
        setError(result?.error ?? "Auto-rig failed");
        router.refresh();
        return;
      }

      onRigComplete?.(result.data?.rigging?.riggedModelUrl ?? null);
      setMessage("Auto-rig complete. A rigged GLB was exported for this character.");
      router.refresh();
    });
  };

  const pickMarker = (x: number, y: number) => {
    setError(null);
    setMessage(null);
    startPickingTransition(async () => {
      const response = await fetch(`/api/models/${model.id}/rigging/pick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x, y, view: previewView }),
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: {
          position?: [number, number, number];
          sample?: [number, number];
          screen?: [number, number];
        };
        error?: string;
      } | null;

      if (!response.ok || !result?.success || !result.data?.position) {
        setError(result?.error ?? "Failed to pick marker on model");
        return;
      }

      const [px, py, pz] = result.data.position;
      setMarkerInputs((current) => ({
        ...current,
        [activeMarker]: `${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)}`,
      }));
      setScreenMarkers((current) => ({
        ...current,
        [activeMarker]: result.data?.screen ?? result.data?.sample ?? [x, y],
      }));
      setPickedMarkers((current) => new Set(current).add(activeMarker));
      setMessage(`${rigMarkerLabels[activeMarker]} marker updated.`);
    });
  };

  const resetPreviewPan = () => setPreviewPan({ x: 0, y: 0 });

  const setZoom = (nextZoom: number) => {
    const clamped = Math.min(3, Math.max(1, Number(nextZoom.toFixed(2))));
    setPreviewZoom(clamped);
    if (clamped === 1) resetPreviewPan();
  };

  const focusPreview = (area: "head" | "torso" | "feet") => {
    const zoom = Math.max(previewZoom, 1.75);
    setPreviewZoom(zoom);
    const y = area === "head" ? 160 : area === "feet" ? -180 : 0;
    setPreviewPan({ x: 0, y });
  };
  const pickedCount = pickedMarkers.size;
  const saveDisabled = isPending || pickedCount < rigMarkerOrder.length;

  return (
    <div className="rigging-panel">
      <div className={`rigging-status-card ${rigging.status}`}>
        <span>Rigging status</span>
        <strong>{rigging.status.replaceAll("_", " ")}</strong>
        <p>{rigging.statusReason}</p>
      </div>

      <div className="rigging-marker-toolbar">
        <div className="rigging-progress-pill">
          <strong>{pickedCount}/{rigMarkerOrder.length}</strong>
          <span>markers picked</span>
        </div>
        <button className="button" disabled={saveDisabled} onClick={saveMarkers} type="button">
          {isPending ? "Saving..." : "Save picked markers"}
        </button>
        <button
          className="button secondary"
          disabled={isRiggingPending || !hasSavedMarkers}
          onClick={runAutoRig}
          type="button"
        >
          {isRiggingPending ? "Running auto-rig..." : "Run Blender auto-rig"}
        </button>
      </div>

      <div className="rigging-marker-picker">
        <div className="rigging-marker-picker-head">
          <div>
            <span>Marker placement</span>
            <strong>{rigMarkerLabels[activeMarker]}</strong>
          </div>
          <small>Pick each joint directly on the character preview.</small>
        </div>
        <div className="rigging-marker-legend" aria-label="Marker color guide">
          {markerLegend.map(([group, label]) => (
            <span key={group}>
              <i style={{ background: markerColorByGroup[group] }} />
              {label}
            </span>
          ))}
        </div>
        <div className="rigging-view-switcher" aria-label="Preview view">
          {riggingPreviewViews.map((view) => (
            <button
              className={previewView === view.value ? "active" : ""}
              key={view.value}
              onClick={() => {
                setPreviewView(view.value);
                setPreviewZoom(1);
                resetPreviewPan();
                setScreenMarkers({});
                setError(null);
                setMessage(null);
              }}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
        <div className="rigging-zoom-controls" aria-label="Preview zoom">
          <button
            disabled={previewZoom <= 1}
            onClick={() => setZoom(previewZoom - 0.25)}
            type="button"
          >
            -
          </button>
          <span>{Math.round(previewZoom * 100)}%</span>
          <button
            disabled={previewZoom >= 3}
            onClick={() => setZoom(previewZoom + 0.25)}
            type="button"
          >
            +
          </button>
          <button
            disabled={previewZoom === 1}
            onClick={() => setZoom(1)}
            type="button"
          >
            Reset
          </button>
        </div>
        <div className="rigging-pan-controls" aria-label="Preview pan presets">
          <button onClick={() => focusPreview("head")} type="button">Head</button>
          <button onClick={() => focusPreview("torso")} type="button">Torso</button>
          <button onClick={() => focusPreview("feet")} type="button">Feet</button>
          <button disabled={previewPan.x === 0 && previewPan.y === 0} onClick={resetPreviewPan} type="button">Center</button>
        </div>
        <div className="rigging-tool-switcher" aria-label="Marker placement tool">
          <button
            className={placementTool === "pick" ? "active" : ""}
            onClick={() => setPlacementTool("pick")}
            type="button"
          >
            Pick
          </button>
          <button
            className={placementTool === "pan" ? "active" : ""}
            onClick={() => setPlacementTool("pan")}
            type="button"
          >
            Pan
          </button>
        </div>
        <div className="rigging-marker-buttons" aria-label="Rig markers">
          {rigMarkerOrder.map((name) => (
            <button
              className={`${activeMarker === name ? "active" : ""}${pickedMarkers.has(name) ? " picked" : ""}`}
              key={name}
              onClick={() => setActiveMarker(name)}
              type="button"
            >
              {rigMarkerLabels[name]}
            </button>
          ))}
        </div>
        <div className={`rigging-marker-viewport image-mode${isPicking ? " picking" : ""}`}>
          <div
            className={`rigging-marker-image-layer${previewZoom > 1 && placementTool === "pan" ? " pannable" : ""}`}
            onPointerCancel={() => {
              dragRef.current.pointerId = -1;
            }}
            onPointerDown={(event) => {
              if (previewZoom <= 1 || event.button !== 0 || (placementTool !== "pan" && !event.shiftKey)) return;
              dragRef.current = {
                moved: false,
                pointerId: event.pointerId,
                startPan: previewPan,
                startPointer: { x: event.clientX, y: event.clientY },
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragRef.current.pointerId !== event.pointerId || previewZoom <= 1) return;
              const dx = event.clientX - dragRef.current.startPointer.x;
              const dy = event.clientY - dragRef.current.startPointer.y;
              if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true;
              setPreviewPan({
                x: dragRef.current.startPan.x + dx,
                y: dragRef.current.startPan.y + dy,
              });
            }}
            onPointerUp={(event) => {
              if (dragRef.current.pointerId !== event.pointerId) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              dragRef.current.pointerId = -1;
            }}
            style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
          >
            <div
              className="rigging-marker-image-frame"
              onClick={(event) => {
                if (placementTool === "pan") return;
                if (dragRef.current.moved) {
                  dragRef.current.moved = false;
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                const y = (event.clientY - rect.top) / rect.height;
                if (x < 0 || x > 1 || y < 0 || y > 1) {
                  setError("Click inside the rendered model image area.");
                  return;
                }
                pickMarker(x, y);
              }}
            >
              <img
                alt="Rig marker placement preview"
                draggable={false}
                src={`/api/models/${model.id}/rigging/preview?view=${previewView}`}
              />
              {rigMarkerOrder.map((name) => {
                const point = screenMarkers[name];
                if (!point) return null;
                return (
                  <button
                    aria-label={rigMarkerLabels[name]}
                    className={`rig-marker-image-dot${activeMarker === name ? " active" : ""}`}
                    key={name}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMarker(name);
                    }}
                    style={{
                      background: markerColorByGroup[markerGroupByName[name]],
                      left: `${point[0] * 100}%`,
                      top: `${point[1] * 100}%`,
                    }}
                    title={rigMarkerLabels[name]}
                    type="button"
                  />
                );
              })}
            </div>
          </div>
          {isPicking ? <span className="rigging-pick-busy">Picking surface point...</span> : null}
        </div>
      </div>
      {rigging.riggedModelUrl ? (
        <div className="inline-actions">
          <a className="mixamo-primary-action" href={rigging.riggedModelUrl}>
            Open rigged GLB
          </a>
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </div>
  );
}
