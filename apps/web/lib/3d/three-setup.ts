import * as THREE from "three";

type RendererLabel = "WebGPU" | "WebGL";
type AnyThreeRenderer = THREE.WebGLRenderer & {
  init?: () => Promise<void>;
  isWebGPURenderer?: boolean;
};
type RendererBackend = "auto" | "webgl" | "webgpu";

export async function createRenderer(canvas: HTMLCanvasElement, options?: {
  backend?: RendererBackend;
}): Promise<{
  label: RendererLabel;
  renderer: AnyThreeRenderer;
}> {
  const backend = options?.backend ?? "auto";

  if (backend !== "webgl" && typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const webgpu = await import("three/webgpu");
      const renderer = new webgpu.WebGPURenderer({
        alpha: true,
        antialias: false,
        canvas,
      }) as unknown as AnyThreeRenderer;
      renderer.setPixelRatio(
        typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.25),
      );
      await renderer.init?.();
      return { label: "WebGPU", renderer };
    } catch (error) {
      console.warn("Control3D: WebGPU renderer unavailable, falling back to WebGL.", error);
    }
  }

  if (backend === "webgpu") {
    throw new Error("WebGPU renderer unavailable and WebGL fallback was disabled for this canvas.");
  }

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.25),
  );

  return { label: "WebGL", renderer };
}

export function getInitialRendererLabel(): RendererLabel {
  return "WebGL";
}
