import * as THREE from "three";

type RendererLabel = "WebGPU" | "WebGL";

export async function createRenderer(canvas: HTMLCanvasElement): Promise<{
  label: RendererLabel;
  renderer: THREE.WebGLRenderer;
}> {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const { WebGPURenderer } = await import("three/webgpu");
      const renderer = new WebGPURenderer({
        alpha: true,
        antialias: true,
        canvas,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(
        typeof window === "undefined"
          ? 1
          : Math.min(window.devicePixelRatio, 2),
      );
      await renderer.init();

      return {
        label: "WebGPU",
        renderer: renderer as unknown as THREE.WebGLRenderer,
      };
    } catch {
      // Fall back to WebGL below.
    }
  }

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
  return typeof navigator !== "undefined" && "gpu" in navigator
    ? "WebGPU"
    : "WebGL";
}