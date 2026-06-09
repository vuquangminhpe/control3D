"use client";

import { useEffect } from "react";
import type { TransformState } from "@/lib/3d/types";
import { useEditorStore } from "@/store/editorStore";

export function useEditor(initialTransform: TransformState) {
  const editor = useEditorStore();
  const signature = JSON.stringify(initialTransform);

  useEffect(() => {
    editor.initialize(initialTransform);
  }, [editor, initialTransform, signature]);

  return editor;
}