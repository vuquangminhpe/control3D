"use client";

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { useGameStore } from "@/store/gameStore";

type FloatingDamageProps = {
  id: string;
  amount: number;
  position: [number, number, number];
  isCritical: boolean;
};

export function FloatingDamage({ id, amount, position, isCritical }: FloatingDamageProps) {
  const removeDamageNumber = useGameStore((state) => state.removeDamageNumber);
  const [yOffset, setYOffset] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(1);

  useEffect(() => {
    // Animate the damage number sliding up and fading out
    let startTime = Date.now();
    const duration = 800; // ms

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        clearInterval(interval);
        removeDamageNumber(id);
      } else {
        setYOffset(progress * 1.5); // slide up to 1.5 units
        setOpacity(1 - progress); // fade out
      }
    }, 16);

    return () => clearInterval(interval);
  }, [id, removeDamageNumber]);

  const animatedPosition: [number, number, number] = [
    position[0],
    position[1] + yOffset,
    position[2],
  ];

  return (
    <Html position={animatedPosition} center sprite distanceFactor={10}>
      <div
        className={`damage-num-popup ${isCritical ? "critical" : ""}`}
        style={{
          opacity,
          transform: `scale(${isCritical ? 1.4 : 1})`,
        }}
      >
        {isCritical && <span className="crit-text">CRIT!</span>}
        {amount}
      </div>
    </Html>
  );
}
