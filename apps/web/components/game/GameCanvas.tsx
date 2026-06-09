"use client";

import { Suspense, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { OrbitControls, Html, Environment, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";
import { Player } from "./Player";
import { EnemyZombie } from "./EnemyZombie";
import { PatrolRobot } from "./PatrolRobot";
import { Terrain } from "./Terrain";
import { FloatingDamage } from "./FloatingDamage";

// Camera controller that tracks the player smoothly
function CameraController({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const playerPosition = useGameStore((state) => state.playerPosition);

  useFrame(() => {
    if (!controlsRef.current) return;
    
    // Smoothly lerp camera focus target to the player position
    const target = new THREE.Vector3(...playerPosition);
    // Offset target slightly upward to focus on player's chest/head
    target.y += 1.2;
    controlsRef.current.target.lerp(target, 0.1);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={24}
      maxPolarAngle={Math.PI / 2.15} // prevents camera from dipping below horizontal ground level
      makeDefault
    />
  );
}

// Separate component to safely use useFrame inside the canvas
import { useFrame } from "@react-three/fiber";

export function GameCanvas() {
  const controlsRef = useRef<any>(null);
  
  // Zustand state and actions
  const enemies = useGameStore((state) => state.enemies);
  const floatingDamages = useGameStore((state) => state.floatingDamages);
  const spawnEnemies = useGameStore((state) => state.spawnEnemies);
  const setTargetMove = useGameStore((state) => state.setPlayerTargetMove);
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);

  // Initialize and spawn enemies
  useEffect(() => {
    spawnEnemies();
  }, [spawnEnemies]);

  return (
    <div className="game-canvas-container">
      <Canvas
        shadows
        camera={{ position: [0, 12, 14], fov: 50, near: 0.1, far: 500 }}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Lights */}
        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          intensity={1.5}
          position={[15, 25, 15]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={100}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-bias={-0.0005}
        />
        <pointLight position={[-10, 8, -10]} intensity={0.5} color="#00ffaa" />

        {/* Sky and Environment preset */}
        <Sky sunPosition={[15, 25, 15]} inclination={0} azimuth={0.25} distance={1000} />
        <Environment preset="sunset" background={false} />

        <Suspense fallback={<Html center><div className="loading-spinner">Loading cyber assets...</div></Html>}>
          <Physics gravity={[0, -19.8, 0]}>
            {/* Terrain Level */}
            <Terrain />

            {/* Playable Character */}
            <Player />

            {/* Patrol Robot NPC */}
            <PatrolRobot />

            {/* Spawn Zombie Enemies */}
            {enemies.map((e) => (
              <EnemyZombie key={e.id} id={e.id} />
            ))}

            {/* Invisible Ground Plane to intercept target clicks */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.5, 0]}
              receiveShadow
              onPointerDown={(e) => {
                if (e.button === 0 && !activeDialogueNpcId) {
                  e.stopPropagation();
                  setTargetMove([e.point.x, e.point.y, e.point.z]);
                }
              }}
            >
              <planeGeometry args={[500, 500]} />
              <meshStandardMaterial visible={false} />
            </mesh>
          </Physics>

          {/* Floating Damage Popup Numbers */}
          {floatingDamages.map((fd) => (
            <FloatingDamage
              key={fd.id}
              id={fd.id}
              amount={fd.amount}
              position={fd.position}
              isCritical={fd.isCritical}
            />
          ))}

          {/* Camera controller tracking the player */}
          <CameraController controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
