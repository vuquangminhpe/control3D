import * as THREE from "three";

type RendererLabel = "WebGPU" | "WebGL";

export async function createRenderer(canvas: HTMLCanvasElement): Promise<{
  label: RendererLabel;
  renderer: THREE.WebGLRenderer;
}> {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 2),
  );

  return { label: "WebGL", renderer };
}

export function getInitialRendererLabel(): RendererLabel {
  return "WebGL";
}
