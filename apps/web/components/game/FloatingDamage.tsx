"use client";

import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Group, LinearFilter, Sprite, SpriteMaterial, SRGBColorSpace } from "three";
import { useFrame } from "@react-three/fiber";
import { useGameStore } from "@/store/gameStore";

type FloatingDamageProps = {
  id: string;
  amount: number;
  position: [number, number, number];
  isCritical: boolean;
};

function createDamageTexture(amount: number, isCritical: boolean) {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = isCritical ? 160 : 128;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 14;
  context.strokeStyle = "#000000";
  context.fillStyle = isCritical ? "#ff2a00" : "#ff9900";
  context.font = `900 ${isCritical ? 64 : 56}px monospace`;
  context.strokeText(String(amount), canvas.width / 2, isCritical ? 98 : 72);
  context.fillText(String(amount), canvas.width / 2, isCritical ? 98 : 72);

  if (isCritical) {
    context.font = "800 26px monospace";
    context.strokeText("CRIT!", canvas.width / 2, 36);
    context.fillText("CRIT!", canvas.width / 2, 36);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function FloatingDamage({ id, amount, position, isCritical }: FloatingDamageProps) {
  const removeDamageNumber = useGameStore((state) => state.removeDamageNumber);
  const groupRef = useRef<Group>(null);
  const spriteRef = useRef<Sprite>(null);
  const elapsedRef = useRef(0);
  const texture = useMemo(() => createDamageTexture(amount, isCritical), [amount, isCritical]);

  useEffect(() => {
    elapsedRef.current = 0;
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const progress = Math.min(elapsedRef.current / 0.8, 1);

    if (groupRef.current) {
      groupRef.current.position.set(
        position[0],
        position[1] + progress * 1.6,
        position[2]
      );
    }

    if (spriteRef.current) {
      const material = spriteRef.current.material as SpriteMaterial;
      material.opacity = 1 - progress;
      const scale = isCritical ? 1.5 : 1.15;
      spriteRef.current.scale.set(scale, scale * 0.58, 1);
    }

    if (progress >= 1) {
      removeDamageNumber(id);
    }
  });

  if (!texture) {
    return null;
  }

  return (
    <group ref={groupRef} position={position}>
      <sprite ref={spriteRef}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}
