"use client";

import { useEffect } from "react";
import type { TransformState } from "@/lib/3d/types";
import { useEditorStore } from "@/store/editorStore";

export function useEditor(initialTransform: TransformState) {
  const history = useEditorStore((state) => state.history);
  const historyIndex = useEditorStore((state) => state.historyIndex);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const material = useEditorStore((state) => state.material);
  const mode = useEditorStore((state) => state.mode);
  const selectedMeshId = useEditorStore((state) => state.selectedMeshId);
  const selectedMeshName = useEditorStore((state) => state.selectedMeshName);
  const transform = useEditorStore((state) => state.transform);
  const initialize = useEditorStore((state) => state.initialize);
  const redo = useEditorStore((state) => state.redo);
  const resetTransform = useEditorStore((state) => state.resetTransform);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const setMaterial = useEditorStore((state) => state.setMaterial);
  const setMode = useEditorStore((state) => state.setMode);
  const setSelectedMesh = useEditorStore((state) => state.setSelectedMesh);
  const setTransform = useEditorStore((state) => state.setTransform);
  const undo = useEditorStore((state) => state.undo);
  const signature = JSON.stringify(initialTransform);

  useEffect(() => {
    initialize(initialTransform);
  }, [initialize, signature]);

  return {
    history,
    historyIndex,
    interactionMode,
    material,
    mode,
    redo,
    resetTransform,
    selectedMeshId,
    selectedMeshName,
    setInteractionMode,
    setMaterial,
    setMode,
    setSelectedMesh,
    setTransform,
    transform,
    undo,
  };
}
