"use client";

import { InspectViewer } from "@/components/3d/Viewer";

type MiniPreviewProps = {
  src: string;
};

export function MiniPreview({ src }: MiniPreviewProps) {
  return <InspectViewer src={src} variant="preview" />;
}