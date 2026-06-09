"use client";

import { create } from "zustand";
import type {
  MaterialDraft,
  MeshSelection,
  TransformMode,
  TransformState,
} from "@/lib/3d/types";

type EditorSnapshot = {
  material: MaterialDraft | null;
  selectedMeshId: string | null;
  selectedMeshName: string | null;
  transform: TransformState;
};

type EditorState = {
  history: EditorSnapshot[];
  historyIndex: number;
  initialTransform: TransformState;
  material: MaterialDraft | null;
  mode: TransformMode;
  selectedMeshId: string | null;
  selectedMeshName: string | null;
  transform: TransformState;
  initialize: (initialTransform: TransformState) => void;
  redo: () => void;
  resetTransform: () => void;
  setMaterial: (material: MaterialDraft, commit?: boolean) => void;
  setMode: (mode: TransformMode) => void;
  setSelectedMesh: (selection: MeshSelection | null) => void;
  setTransform: (transform: TransformState, commit?: boolean) => void;
  undo: () => void;
};

const defaultTransform: TransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function cloneTransform(transform: TransformState): TransformState {
  return {
    position: [...transform.position] as TransformState["position"],
    rotation: [...transform.rotation] as TransformState["rotation"],
    scale: [...transform.scale] as TransformState["scale"],
  };
}

function cloneMaterial(material: MaterialDraft | null) {
  return material ? { ...material } : null;
}

function buildSnapshot(state: {
  material: MaterialDraft | null;
  selectedMeshId: string | null;
  selectedMeshName: string | null;
  transform: TransformState;
}): EditorSnapshot {
  return {
    material: cloneMaterial(state.material),
    selectedMeshId: state.selectedMeshId,
    selectedMeshName: state.selectedMeshName,
    transform: cloneTransform(state.transform),
  };
}

function sameSnapshot(a: EditorSnapshot, b: EditorSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withSnapshot(state: EditorState, snapshot: EditorSnapshot) {
  const nextHistory = state.history.slice(0, state.historyIndex + 1);
  const previous = nextHistory[nextHistory.length - 1];

  if (!previous || !sameSnapshot(previous, snapshot)) {
    nextHistory.push(snapshot);
  }

  const trimmedHistory = nextHistory.slice(-50);

  return {
    history: trimmedHistory,
    historyIndex: trimmedHistory.length - 1,
  };
}

function applySnapshot(snapshot: EditorSnapshot) {
  return {
    material: cloneMaterial(snapshot.material),
    selectedMeshId: snapshot.selectedMeshId,
    selectedMeshName: snapshot.selectedMeshName,
    transform: cloneTransform(snapshot.transform),
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  history: [
    {
      material: null,
      selectedMeshId: null,
      selectedMeshName: null,
      transform: cloneTransform(defaultTransform),
    },
  ],
  historyIndex: 0,
  initialTransform: cloneTransform(defaultTransform),
  material: null,
  mode: "translate",
  selectedMeshId: null,
  selectedMeshName: null,
  transform: cloneTransform(defaultTransform),

  initialize: (initialTransform) => {
    const clonedTransform = cloneTransform(initialTransform);
    const snapshot = {
      material: null,
      selectedMeshId: null,
      selectedMeshName: null,
      transform: clonedTransform,
    } satisfies EditorSnapshot;

    set({
      history: [snapshot],
      historyIndex: 0,
      initialTransform: clonedTransform,
      material: null,
      mode: "translate",
      selectedMeshId: null,
      selectedMeshName: null,
      transform: clonedTransform,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) {
      return;
    }

    const nextIndex = state.historyIndex + 1;
    const snapshot = state.history[nextIndex];

    set({ historyIndex: nextIndex, ...applySnapshot(snapshot) });
  },

  resetTransform: () => {
    get().setTransform(get().initialTransform);
  },

  setMaterial: (material, commit = true) => {
    set((state) => {
      const nextMaterial = cloneMaterial(material);
      if (!commit) {
        return { material: nextMaterial };
      }

      const nextState = {
        ...state,
        material: nextMaterial,
      };

      return {
        material: nextMaterial,
        ...withSnapshot(state, buildSnapshot(nextState)),
      };
    });
  },

  setMode: (mode) => {
    set({ mode });
  },

  setSelectedMesh: (selection) => {
    set({
      material: cloneMaterial(selection?.material ?? null),
      selectedMeshId: selection?.id ?? null,
      selectedMeshName: selection?.name ?? null,
    });
  },

  setTransform: (transform, commit = true) => {
    set((state) => {
      const nextTransform = cloneTransform(transform);
      if (!commit) {
        return { transform: nextTransform };
      }

      const nextState = {
        ...state,
        transform: nextTransform,
      };

      return {
        transform: nextTransform,
        ...withSnapshot(state, buildSnapshot(nextState)),
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) {
      return;
    }

    const nextIndex = state.historyIndex - 1;
    const snapshot = state.history[nextIndex];

    set({ historyIndex: nextIndex, ...applySnapshot(snapshot) });
  },
}));