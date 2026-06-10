"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { OrbitControls, Html, Environment, Sky } from "@react-three/drei";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/store/gameStore";
import { Player } from "./Player";
import { EnemyZombie } from "./EnemyZombie";
import { PatrolRobot } from "./PatrolRobot";
import { Terrain } from "./Terrain";
import { FloatingDamage, prewarmDamageTextures } from "./FloatingDamage";
import { ModelLoader } from "@/components/3d/ModelLoader";

// Camera controller that tracks the player smoothly
function CameraController({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  useFrame(() => {
    if (!controlsRef.current) return;
    const playerPosition = useGameStore.getState().playerPosition;
    
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
      enablePan={false}
      enableRotate
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={24}
      minPolarAngle={Math.PI / 3}
      maxPolarAngle={Math.PI / 2.15} // prevents camera from dipping below horizontal ground level
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      makeDefault
    />
  );
}

function EnemyLayer() {
  const enemyIds = useGameStore(useShallow((state) => state.enemies.map((enemy) => enemy.id)));
  const enemySpawnVersion = useGameStore((state) => state.enemySpawnVersion);

  return (
    <>
      {enemyIds.map((id) => (
        <EnemyZombie key={`enemy-${enemySpawnVersion}-${id}`} id={id} />
      ))}
    </>
  );
}

const runtimeRaycaster = new THREE.Raycaster();
const runtimeDownVector = new THREE.Vector3(0, -1, 0);

function getRuntimeTerrainY(terrain: THREE.Object3D, x: number, z: number, fallbackY: number) {
  terrain.updateMatrixWorld(true);
  runtimeRaycaster.set(new THREE.Vector3(x, 1000, z), runtimeDownVector);
  const hit = runtimeRaycaster.intersectObject(terrain, true)
    .find((entry) => entry.object.userData.isTerrainSurface);
  return hit?.point.y ?? fallbackY;
}

function snapRuntimeToTerrain(terrain: THREE.Object3D) {
  useGameStore.setState((state) => {
    const snapEntity = (
      position: [number, number, number],
      heightOffset: number,
    ): [number, number, number] => {
      const groundY = getRuntimeTerrainY(
        terrain,
        position[0],
        position[2],
        position[1] - heightOffset,
      );
      return [
        Number(position[0].toFixed(2)),
        Number((groundY + heightOffset).toFixed(2)),
        Number(position[2].toFixed(2)),
      ];
    };

    const snapObject = (position: [number, number, number]): [number, number, number] => {
      const groundY = getRuntimeTerrainY(terrain, position[0], position[2], position[1]);
      return [
        Number(position[0].toFixed(2)),
        Number(groundY.toFixed(2)),
        Number(position[2].toFixed(2)),
      ];
    };

    const activeLevel = {
      ...state.activeLevel,
      playerSpawn: snapEntity(state.activeLevel.playerSpawn, 1.5),
      robotSpawn: snapEntity(state.activeLevel.robotSpawn, 1.2),
      zombieSpawns: state.activeLevel.zombieSpawns.map((spawn) => ({
        ...spawn,
        position: snapEntity(spawn.position, 1.2),
      })),
      placedObjects: state.activeLevel.placedObjects.map((object) => ({
        ...object,
        position: snapObject(object.position),
      })),
    };

    return {
      activeLevel,
      playerPosition: [...activeLevel.playerSpawn],
      robotPosition: [...activeLevel.robotSpawn],
      enemies: state.enemies.map((enemy) => {
        const spawn = activeLevel.zombieSpawns.find((entry) => entry.id === enemy.id);
        return spawn ? { ...enemy, position: [...spawn.position] as [number, number, number] } : enemy;
      }),
    };
  });
}

function FloatingDamageLayer() {
  const floatingDamages = useGameStore((state) => state.floatingDamages);

  useEffect(() => {
    prewarmDamageTextures();
  }, []);

  return (
    <>
      {floatingDamages.map((fd) => (
        <FloatingDamage
          key={fd.id}
          id={fd.id}
          amount={fd.amount}
          position={fd.position}
          isCritical={fd.isCritical}
        />
      ))}
    </>
  );
}

function PlacedObjectLayer() {
  const placedObjects = useGameStore((state) => state.activeLevel.placedObjects);

  return (
    <>
      {placedObjects.map((object) => (
        <group
          key={object.id}
          position={object.position}
          rotation={[
            object.rotation[0] * Math.PI / 180,
            object.rotation[1] * Math.PI / 180,
            object.rotation[2] * Math.PI / 180,
          ]}
          scale={object.scale}
        >
          <ModelLoader groundToY={0} src={object.fileUrl} />
        </group>
      ))}
    </>
  );
}

export function GameCanvas() {
  const controlsRef = useRef<any>(null);
  const [terrainScene, setTerrainScene] = useState<THREE.Object3D | null>(null);
  const [groundReady, setGroundReady] = useState(false);
  
  // Zustand state and actions
  const spawnEnemies = useGameStore((state) => state.spawnEnemies);
  const worldVersion = useGameStore((state) => state.worldVersion);
  const activeLevelId = useGameStore((state) => state.activeLevel.id);

  const handleTerrainReady = useCallback((scene: THREE.Object3D) => {
    setTerrainScene(scene);
  }, []);

  // Initialize and spawn enemies
  useEffect(() => {
    spawnEnemies();
  }, [spawnEnemies]);

  useEffect(() => {
    setGroundReady(false);
  }, [activeLevelId, worldVersion]);

  useEffect(() => {
    if (!terrainScene) return;
    snapRuntimeToTerrain(terrainScene);
    setGroundReady(true);
  }, [activeLevelId, terrainScene, worldVersion]);

  return (
    <div className="game-canvas-container">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.25]}
        camera={{ position: [0, 12, 14], fov: 50, near: 0.1, far: 500 }}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Lights */}
        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          intensity={1.5}
          position={[15, 25, 15]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.5}
          shadow-camera-far={100}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-bias={-0.0005}
        />
        <pointLight position={[-10, 8, -10]} intensity={0.25} color="#00ffaa" />

        {/* Sky and Environment preset */}
        <Sky sunPosition={[15, 25, 15]} inclination={0} azimuth={0.25} distance={1000} />
        <Environment preset="sunset" background={false} />

        <Suspense fallback={<Html center><div className="loading-spinner">Loading cyber assets...</div></Html>}>
          <Physics gravity={[0, -19.8, 0]}>
            {/* Terrain Level */}
            <Terrain onReady={handleTerrainReady} />
            {groundReady ? <PlacedObjectLayer /> : null}

            {/* Playable Character */}
            {groundReady ? <Player key={`player-${worldVersion}`} /> : null}

            {/* Patrol Robot NPC */}
            {groundReady ? <PatrolRobot key={`robot-${worldVersion}`} /> : null}

            {/* Spawn Zombie Enemies */}
            {groundReady ? <EnemyLayer /> : null}

          </Physics>

          {/* Floating Damage Popup Numbers */}
          <FloatingDamageLayer />

          {/* Camera controller tracking the player */}
          <CameraController controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
