"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { OrbitControls, Html, Environment, Sky, Line } from "@react-three/drei";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { getEnemyRuntimePosition, useGameStore, type ArrowProjectileState } from "@/store/gameStore";
import { Player } from "./Player";
import { Terrain } from "./Terrain";
import { FloatingDamage, prewarmDamageTextures } from "./FloatingDamage";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { preload3DModel } from "@/hooks/use3DModel";
import { getIntelligentScaleMultiplier } from "@/lib/3d/camera";

// Camera controller that tracks the player smoothly
function CameraController({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);

  useFrame(() => {
    if (!controlsRef.current) return;
    const playerPosition = useGameStore.getState().playerPosition;
    
    // Smoothly lerp camera focus target to the player position
    const target = new THREE.Vector3(...playerPosition);
    // Offset target slightly upward to focus on player's chest/head
    target.y += 1.2 * mapScaleRatio;
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
      minDistance={6 * mapScaleRatio}
      maxDistance={24 * mapScaleRatio}
      minPolarAngle={Math.PI / 3}
      maxPolarAngle={Math.PI / 2.15} // prevents camera from dipping below horizontal ground level
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      makeDefault
    />
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
    const scaleRatio = state.mapScaleRatio;
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
      playerSpawn: snapEntity(state.activeLevel.playerSpawn, 1.5 * scaleRatio),
      placedObjects: state.activeLevel.placedObjects.map((object) => ({
        ...object,
        position: snapObject(object.position),
      })),
    };

    return {
      activeLevel,
      playerPosition: [...activeLevel.playerSpawn],
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
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);
  const placedObjectMaxSize = 1.8 * mapScaleRatio;

  return (
    <>
      {placedObjects.map((object, index) => (
        <group
          key={`${object.id}-${index}`}
          position={object.position}
          rotation={[
            object.rotation[0] * Math.PI / 180,
            object.rotation[1] * Math.PI / 180,
            object.rotation[2] * Math.PI / 180,
          ]}
          scale={object.scale}
        >
          <ModelLoader
            debugLabel={`runtime-placed-object:${object.name}`}
            fitMaxSize={placedObjectMaxSize * getIntelligentScaleMultiplier(object.name)}
            groundToY={0}
            src={object.fileUrl}
          />
        </group>
      ))}
    </>
  );
}

function BowTrajectoryLayer() {
  const bowAim = useGameStore((state) => state.bowAim);

  if (!bowAim.isAiming || bowAim.trajectory.length < 2) return null;

  return (
    <Line
      points={bowAim.trajectory}
      color="#dfffd0"
      lineWidth={2}
      transparent
      opacity={0.78}
    />
  );
}

function BowReticleOverlay() {
  const bowAim = useGameStore((state) => state.bowAim);

  if (!bowAim.isAiming) return null;

  const chargePercent = Math.round(bowAim.charge * 100);

  return (
    <div className="bow-reticle-overlay" aria-hidden="true">
      <div className="bow-reticle">
        <span />
        <span />
      </div>
      <div className="bow-charge-panel">
        <div className="bow-charge-bar">
          <i style={{ width: `${chargePercent}%` }} />
        </div>
        <strong>{chargePercent}%</strong>
      </div>
    </div>
  );
}

function BowFirePad() {
  const selectedWeapon = useGameStore((state) => state.selectedWeapon);
  const bowFireHeld = useGameStore((state) => state.bowFireHeld);
  const setBowFireHeld = useGameStore((state) => state.setBowFireHeld);

  useEffect(() => {
    const release = () => setBowFireHeld(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      release();
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [setBowFireHeld]);

  if (selectedWeapon !== "bow") return null;

  return (
    <button
      type="button"
      className={`bow-fire-pad${bowFireHeld ? " charging" : ""}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setBowFireHeld(true);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setBowFireHeld(false);
      }}
      onPointerLeave={(event) => {
        event.preventDefault();
        setBowFireHeld(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span>{bowFireHeld ? "Release" : "Hold"}</span>
      <strong>Bow Shot</strong>
    </button>
  );
}

function ArrowProjectile({
  arrow,
  terrainScene,
}: {
  arrow: ArrowProjectileState;
  terrainScene: THREE.Object3D | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const positionRef = useRef(new THREE.Vector3(...arrow.position));
  const velocityRef = useRef(new THREE.Vector3(...arrow.velocity));
  const enemyPositionRef = useRef(new THREE.Vector3());
  const arrowYAxisRef = useRef(new THREE.Vector3(0, 1, 0));
  const removedRef = useRef(false);
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);
  const removeArrow = useGameStore((state) => state.removeArrow);
  const hitEnemy = useGameStore((state) => state.hitEnemy);

  const remove = useCallback(() => {
    if (removedRef.current) return;
    removedRef.current = true;
    removeArrow(arrow.id);
  }, [arrow.id, removeArrow]);

  useFrame((_, delta) => {
    if (removedRef.current || !groupRef.current) return;

    const dt = Math.min(delta, 0.045);
    const position = positionRef.current;
    const velocity = velocityRef.current;
    velocity.y += -19.8 * mapScaleRatio * dt;
    position.addScaledVector(velocity, dt);

    groupRef.current.position.copy(position);
    if (velocity.lengthSq() > 0.001) {
      groupRef.current.quaternion.setFromUnitVectors(arrowYAxisRef.current, velocity.clone().normalize());
    }

    const gameState = useGameStore.getState();
    const arrowAge = window.performance.now() - arrow.createdAt;
    if (arrowAge > 4200 || position.y < -30 || gameState.status !== "playing") {
      remove();
      return;
    }

    for (const enemy of gameState.enemies) {
      if (enemy.isDead) continue;
      const runtimePosition = getEnemyRuntimePosition(enemy.id) ?? enemy.position;
      const targetCenter = enemyPositionRef.current.fromArray(runtimePosition);
      targetCenter.y += enemy.type === "zombie_fantasy" ? 1.25 : 0.95;
      const hitRadius = enemy.type === "zombie_fantasy" ? 1.15 : 0.72;
      if (position.distanceTo(targetCenter) <= hitRadius) {
        const isCritical = arrow.power >= 0.82 && Math.random() < 0.35;
        const damage = isCritical ? Math.round(arrow.damage * 1.45) : arrow.damage;
        hitEnemy(enemy.id, damage, isCritical, [
          position.x,
          targetCenter.y + 0.25,
          position.z,
        ]);
        remove();
        return;
      }
    }

    if (terrainScene) {
      const groundY = getRuntimeTerrainY(terrainScene, position.x, position.z, -1000);
      if (position.y <= groundY + 0.08) {
        remove();
      }
    }
  });

  return (
    <group ref={groupRef} position={arrow.position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.052, 1.08, 8]} />
        <meshStandardMaterial color="#eadfba" roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.66, 0]}>
        <coneGeometry args={[0.13, 0.3, 8]} />
        <meshStandardMaterial color="#e8fbff" emissive="#7de7ff" emissiveIntensity={0.75} roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.64, 0]}>
        <boxGeometry args={[0.26, 0.065, 0.065]} />
        <meshStandardMaterial color="#8cf7d3" emissive="#00ffc4" emissiveIntensity={0.55} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.92, 0]}>
        <cylinderGeometry args={[0.018, 0.06, 0.54, 8]} />
        <meshBasicMaterial color="#8cf7d3" transparent opacity={0.32} />
      </mesh>
    </group>
  );
}

function ArrowProjectileLayer({ terrainScene }: { terrainScene: THREE.Object3D | null }) {
  const arrows = useGameStore(useShallow((state) => state.arrows));

  return (
    <>
      {arrows.map((arrow) => (
        <ArrowProjectile key={arrow.id} arrow={arrow} terrainScene={terrainScene} />
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
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);
  const activeLevelId = useGameStore((state) => state.activeLevel.id);
  const activeLevel = useGameStore((state) => state.activeLevel);
  const hasMap = Boolean(activeLevel.mapModelUrl);
  const hasPlayerCharacter = Boolean(activeLevel.playerCharacter?.fileUrl);

  const handleTerrainReady = useCallback((scene: THREE.Object3D) => {
    setTerrainScene(scene);
  }, []);

  // Initialize and spawn enemies
  useEffect(() => {
    spawnEnemies();
  }, [spawnEnemies]);

  useEffect(() => {
    preload3DModel(activeLevel.mapModelUrl);
    if (activeLevel.playerCharacter?.fileUrl) {
      preload3DModel(activeLevel.playerCharacter.fileUrl);
    }
    for (const object of activeLevel.placedObjects) {
      preload3DModel(object.fileUrl);
    }
  }, [activeLevel]);

  useEffect(() => {
    setGroundReady(false);
  }, [activeLevelId, activeLevel.mapModelUrl, worldVersion]);

  useEffect(() => {
    if (!terrainScene || !hasMap) return;
    snapRuntimeToTerrain(terrainScene);
    setGroundReady(true);
  }, [activeLevelId, hasMap, terrainScene, worldVersion]);

  return (
    <div className="game-canvas-container">
      <BowReticleOverlay />
      <BowFirePad />
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
          <Physics gravity={[0, -19.8 * mapScaleRatio, 0]}>
            {/* Terrain Level */}
            {hasMap ? <Terrain onReady={handleTerrainReady} /> : null}
            {groundReady ? <PlacedObjectLayer /> : null}

            {/* Playable Character */}
            {groundReady && hasPlayerCharacter ? <Player key={`player-${worldVersion}`} /> : null}

          </Physics>

          <BowTrajectoryLayer />
          <ArrowProjectileLayer terrainScene={terrainScene} />

          {/* Floating Damage Popup Numbers */}
          <FloatingDamageLayer />

          {/* Camera controller tracking the player */}
          <CameraController controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
