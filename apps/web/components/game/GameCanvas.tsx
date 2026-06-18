"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { OrbitControls, Html, Environment, Sky, Line, useGLTF } from "@react-three/drei";
import { FBXLoader } from "three-stdlib";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import type {
  RealtimeEnemyState,
  RealtimeCombatAttack,
  RealtimeNpcState,
  RealtimeWorldSnapshot,
} from "@control3d/shared/schemas/realtime";
import {
  getEnemyRuntimePosition,
  setEnemyRuntimePosition,
  useGameStore,
  type ArrowProjectileState,
} from "@/store/gameStore";
import { AnimationActionPlayer, Player } from "./Player";
import { Terrain } from "./Terrain";
import { FloatingDamage, prewarmDamageTextures } from "./FloatingDamage";
import { ModelLoader } from "@/components/3d/ModelLoader";
import { CharacterEnemyBot, CharacterEnemyVisual, NpcBot, NpcVisual } from "./EnemyBot";
import { preload3DModel } from "@/hooks/use3DModel";
import { getIntelligentScaleMultiplier } from "@/lib/3d/camera";
import { getEnemyDimensions, getNpcDimensions, getPlayerDimensions } from "./runtimeDimensions";

export type RemotePresencePlayer = {
  id: string;
  displayName: string;
  seq: number;
  serverTimeMs: number;
  characterId: string | null;
  position: [number, number, number];
  velocity: [number, number, number];
  characterName: string | null;
  characterFileUrl: string | null;
  characterActions?: RuntimeActionLink[];
  actionState: string;
  activeActionName: string | null;
  activeActionUrl: string | null;
};

type RuntimeActionLink = {
  enabled?: boolean;
  fileUrl?: string | null;
  name?: string | null;
  trigger?: string | null;
};

function actionNameMatches(action: RuntimeActionLink, terms: string[]) {
  const lowerName = String(action.name ?? "").toLowerCase();
  return terms.some((term) => lowerName.includes(term));
}

function pickRemoteAnimationUrl(
  player: RemotePresencePlayer,
  playerActions: RuntimeActionLink[],
) {
  if (player.activeActionUrl) return player.activeActionUrl;

  const enabledActions = playerActions.filter((action) => action.enabled && action.fileUrl);
  const state = String(player.actionState || "idle").toLowerCase();
  const findByTrigger = (trigger: string, terms: string[] = []) =>
    enabledActions.find((action) => action.trigger === trigger && (!terms.length || actionNameMatches(action, terms))) ??
    enabledActions.find((action) => action.trigger === trigger);

  if (state.includes("attack") || state.includes("slash") || state.includes("kick")) {
    const attackTerms = state.includes("kick")
      ? ["kick", "heavy", "3"]
      : state.includes("slash")
        ? ["slash", "combo", "2"]
        : ["attack", "light", "1"];
    return findByTrigger("attack", attackTerms)?.fileUrl ?? null;
  }

  if (state.includes("jump")) {
    return findByTrigger("jump")?.fileUrl ?? null;
  }

  if (state.includes("block") || state.includes("hit")) {
    return findByTrigger(state.includes("block") ? "block" : "hit")?.fileUrl ??
      findByTrigger("idle")?.fileUrl ??
      null;
  }

  if (state.includes("run") || state.includes("walk") || state.includes("move")) {
    return findByTrigger("move")?.fileUrl ?? findByTrigger("walk")?.fileUrl ?? null;
  }

  return findByTrigger("idle")?.fileUrl ?? null;
}

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

function SpectatorCameraController({
  controlsRef,
  focusPlayerId,
  mapScaleRatio,
  players,
  worldSnapshot,
}: {
  controlsRef: React.MutableRefObject<any>;
  focusPlayerId: string | null;
  mapScaleRatio: number;
  players: RemotePresencePlayer[];
  worldSnapshot: RealtimeWorldSnapshot | null;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 1.5, 0));
  const initializedRef = useRef(false);

  const overview = useMemo(() => {
    const points = [
      ...players.map((player) => player.position),
      ...(worldSnapshot?.enemies ?? []).map((enemy) => enemy.position),
      ...(worldSnapshot?.npcs ?? []).map((npc) => npc.position),
    ];
    if (!points.length) return { center: new THREE.Vector3(0, 1.5, 0), radius: 12 * mapScaleRatio };

    const bounds = new THREE.Box3();
    for (const point of points) {
      bounds.expandByPoint(new THREE.Vector3(point[0], point[1], point[2]));
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(10 * mapScaleRatio, size.length() * 0.56);
    center.y += 1.2 * mapScaleRatio;
    return { center, radius };
  }, [mapScaleRatio, players, worldSnapshot]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const distance = Math.max(14 * mapScaleRatio, overview.radius * 1.7);
    camera.position.set(
      overview.center.x + distance * 0.45,
      overview.center.y + distance * 0.85,
      overview.center.z + distance * 0.8,
    );
    targetRef.current.copy(overview.center);
    if (controlsRef.current) {
      controlsRef.current.target.copy(overview.center);
      controlsRef.current.update();
    }
  }, [camera, controlsRef, mapScaleRatio, overview.center, overview.radius]);

  useFrame((_, delta) => {
    const focusedPlayer = focusPlayerId
      ? players.find((player) => player.id === focusPlayerId)
      : null;
    const nextTarget = focusedPlayer
      ? new THREE.Vector3(
          focusedPlayer.position[0],
          focusedPlayer.position[1] + 1.4 * mapScaleRatio,
          focusedPlayer.position[2],
        )
      : overview.center;
    const distance = focusedPlayer
      ? 9 * mapScaleRatio
      : Math.max(16 * mapScaleRatio, overview.radius * 1.75);
    const nextCameraPosition = focusedPlayer
      ? new THREE.Vector3(
          focusedPlayer.position[0] + distance * 0.35,
          focusedPlayer.position[1] + distance * 0.7,
          focusedPlayer.position[2] + distance * 0.82,
        )
      : new THREE.Vector3(
          overview.center.x + distance * 0.42,
          overview.center.y + distance * 0.85,
          overview.center.z + distance * 0.78,
        );
    const alpha = 1 - Math.exp(-Math.max(delta, 0) * (focusedPlayer ? 3.8 : 2.2));
    targetRef.current.lerp(nextTarget, alpha);
    camera.position.lerp(nextCameraPosition, alpha);
    if (controlsRef.current) {
      controlsRef.current.target.copy(targetRef.current);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      enablePan
      enableRotate
      dampingFactor={0.08}
      minDistance={4 * mapScaleRatio}
      maxDistance={140 * mapScaleRatio}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.08}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      makeDefault
    />
  );
}

const runtimeRaycaster = new THREE.Raycaster();
const runtimeDownVector = new THREE.Vector3(0, -1, 0);

function getRuntimeTerrainHitNormalY(hit: THREE.Intersection) {
  if (!hit.face) return 1;
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);
  return normal.y;
}

function pickRuntimeTerrainSurfaceHit(
  hits: THREE.Intersection[],
  preferredY: number,
) {
  const surfaceHits = hits.filter((hit) => hit.object.userData.isTerrainSurface);
  const upwardHits = surfaceHits.filter(
    (hit) => getRuntimeTerrainHitNormalY(hit) > 0.12,
  );
  const candidates = upwardHits.length ? upwardHits : surfaceHits;
  return candidates.sort((a, b) => {
    const aDelta = Math.abs(a.point.y - preferredY);
    const bDelta = Math.abs(b.point.y - preferredY);
    if (Math.abs(aDelta - bDelta) > 0.001) return aDelta - bDelta;
    return b.point.y - a.point.y;
  })[0] ?? null;
}

function getRuntimeTerrainY(terrain: THREE.Object3D, x: number, z: number, fallbackY: number) {
  terrain.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(terrain);
  const rayStartY = bounds.isEmpty()
    ? 1000
    : bounds.max.y + Math.max(bounds.getSize(new THREE.Vector3()).y, 20);
  runtimeRaycaster.set(new THREE.Vector3(x, rayStartY, z), runtimeDownVector);
  const hit = pickRuntimeTerrainSurfaceHit(
    runtimeRaycaster.intersectObject(terrain, true),
    fallbackY,
  );
  return hit?.point.y ?? fallbackY;
}

function useTerrainSnappedPosition(
  position: [number, number, number],
  terrainScene: THREE.Object3D | null,
) {
  return useMemo<[number, number, number]>(() => {
    if (!terrainScene) return position;
    return [
      position[0],
      getRuntimeTerrainY(terrainScene, position[0], position[2], position[1]),
      position[2],
    ];
  }, [position, terrainScene]);
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
        Number(groundY.toFixed(2)),
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
      robotSpawn: snapEntity(state.activeLevel.robotSpawn, 0),
      placedObjects: state.activeLevel.placedObjects.map((object) => ({
        ...object,
        position: snapObject(object.position),
      })),
    };
    const snappedEnemies = state.enemies.map((enemy) => ({
      ...enemy,
      position: snapEntity(enemy.position, 0),
    }));
    snappedEnemies.forEach((enemy) => {
      setEnemyRuntimePosition(enemy.id, [...enemy.position]);
    });

    return {
      activeLevel,
      playerPosition: [...activeLevel.playerSpawn],
      robotPosition: [...activeLevel.robotSpawn],
      enemies: snappedEnemies,
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

function isEnvironmentAsset(name: string, fileUrl: string) {
  const lowerName = name.toLowerCase();
  const lowerUrl = fileUrl.toLowerCase();
  return (
    lowerName.includes("map") ||
    lowerName.includes("terrain") ||
    lowerName.includes("env") ||
    lowerName.includes("ground") ||
    lowerName.includes("scene") ||
    lowerName.includes("building") ||
    lowerName.includes("dungeon") ||
    lowerName.includes("sector") ||
    lowerName.includes("level") ||
    lowerName.includes("room") ||
    lowerName.includes("floor") ||
    lowerName.includes("cliff") ||
    lowerName.includes("rock") ||
    lowerName.includes("road") ||
    lowerUrl.includes("map") ||
    lowerUrl.includes("terrain") ||
    lowerUrl.includes("environment")
  );
}

function preloadRuntimeModel(src: string | null | undefined) {
  if (!src) return;
  try {
    preload3DModel(src);
  } catch (error) {
    console.warn("Runtime model preload failed:", src, error);
  }
}

function PlacedObjectLayer() {
  const placedObjects = useGameStore((state) => state.activeLevel.placedObjects);
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);
  const placedObjectMaxSize = 1.8 * mapScaleRatio;

  return (
    <>
      {placedObjects.map((object, index) => {
        const isEnv = object.isMap || isEnvironmentAsset(object.name, object.fileUrl);
        const rotRad: [number, number, number] = [
          (object.rotation[0] * Math.PI) / 180,
          (object.rotation[1] * Math.PI) / 180,
          (object.rotation[2] * Math.PI) / 180,
        ];
        
        const loader = (
          <Suspense fallback={null}>
            <ModelLoader
              debugLabel={`runtime-placed-object:${object.name}`}
              fitMaxSize={isEnv ? 92 * mapScaleRatio : placedObjectMaxSize * getIntelligentScaleMultiplier(object.name)}
              groundToY={0}
              src={object.fileUrl}
              markAsTerrain={isEnv}
            />
          </Suspense>
        );

        if (isEnv) {
          return (
            <RigidBody
              key={`${object.id}-${index}`}
              type="fixed"
              colliders="trimesh"
              position={object.position}
              rotation={rotRad}
              scale={object.scale}
            >
              {loader}
            </RigidBody>
          );
        }

        return (
          <group
            key={`${object.id}-${index}`}
            position={object.position}
            rotation={rotRad}
            scale={object.scale}
          >
            {loader}
          </group>
        );
      })}
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

function ActorFallbackMesh({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  return (
    <mesh castShadow position={[0, height / 2, 0]}>
      <capsuleGeometry args={[height * 0.18, height * 0.64, 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
  );
}

type ActorRenderLod = "high" | "proxy";

function useActorRenderLod(
  position: [number, number, number],
  mapScaleRatio: number,
  highDistance = 56,
): ActorRenderLod {
  const { camera } = useThree();
  const [lod, setLod] = useState<ActorRenderLod>("high");
  const lastCheckRef = useRef(0);
  const actorPositionRef = useRef(new THREE.Vector3(...position));

  useEffect(() => {
    actorPositionRef.current.fromArray(position);
  }, [position]);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    if (elapsed - lastCheckRef.current < 0.35) return;
    lastCheckRef.current = elapsed;

    const threshold = highDistance * Math.max(mapScaleRatio, 0.001);
    const nextLod =
      camera.position.distanceTo(actorPositionRef.current) <= threshold
        ? "high"
        : "proxy";
    setLod((current) => (current === nextLod ? current : nextLod));
  });

  return lod;
}

class RuntimeModelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; resetKey: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn("Runtime actor model failed:", error);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function RemotePlayerAvatar({
  player,
  playerActions,
  mapScaleRatio,
}: {
  player: RemotePresencePlayer;
  playerActions: RuntimeActionLink[];
  mapScaleRatio: number;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const targetPositionRef = useRef(new THREE.Vector3(...player.position));
  const currentPositionRef = useRef(new THREE.Vector3(...player.position));
  const projectedVelocityRef = useRef(new THREE.Vector3());
  const targetYawRef = useRef(0);
  const initialPosition = useMemo(
    () => [...player.position] as [number, number, number],
    [player.id],
  );
  const [modelScene, setModelScene] = useState<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationActions = player.characterActions?.length
    ? player.characterActions
    : playerActions;
  const dimensions = getPlayerDimensions(mapScaleRatio);
  const lod = useActorRenderLod(player.position, mapScaleRatio, 64);
  const remoteAnimationUrl = useMemo(
    () => pickRemoteAnimationUrl(player, animationActions),
    [animationActions, player],
  );

  useEffect(() => {
    setModelScene(null);
  }, [player.characterFileUrl]);

  useEffect(() => {
    const packetAgeSeconds = THREE.MathUtils.clamp(
      (Date.now() - (player.serverTimeMs || Date.now())) / 1000,
      0,
      0.18,
    );
    targetPositionRef.current
      .fromArray(player.position)
      .addScaledVector(
        projectedVelocityRef.current.fromArray(player.velocity),
        packetAgeSeconds,
      );
    const horizontalSpeed = Math.hypot(player.velocity[0], player.velocity[2]);
    if (horizontalSpeed > 0.08) {
      targetYawRef.current = Math.atan2(player.velocity[0], player.velocity[2]);
    }
  }, [player.position, player.serverTimeMs, player.velocity]);

  useEffect(() => {
    if (!modelScene) return;
    const mixer = new THREE.AnimationMixer(modelScene);
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(modelScene);
      mixerRef.current = null;
    };
  }, [modelScene]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    const group = groupRef.current;
    if (!group) return;

    const lerpAlpha = 1 - Math.exp(-Math.max(delta, 0) * 12);
    currentPositionRef.current.lerp(targetPositionRef.current, lerpAlpha);
    group.position.copy(currentPositionRef.current);

    const yawDelta = THREE.MathUtils.euclideanModulo(
      targetYawRef.current - group.rotation.y + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
    group.rotation.y += yawDelta * (1 - Math.exp(-Math.max(delta, 0) * 10));
  });

  return (
    <group ref={groupRef} position={initialPosition}>
      {lod === "high" && player.characterFileUrl ? (
        <Suspense fallback={<ActorFallbackMesh color="#7dd3fc" height={dimensions.visualHeight} />}>
          <RuntimeModelErrorBoundary
            fallback={<ActorFallbackMesh color="#7dd3fc" height={dimensions.visualHeight} />}
            resetKey={player.characterFileUrl}
          >
            <ModelLoader
              debugLabel={`remote-player:${player.displayName}`}
              fitHeight={dimensions.visualHeight}
              groundToY={0}
              src={player.characterFileUrl}
              onSceneReady={setModelScene}
            />
          </RuntimeModelErrorBoundary>
        </Suspense>
      ) : (
        <ActorFallbackMesh color="#7dd3fc" height={dimensions.visualHeight} />
      )}
      {lod === "high" && modelScene && remoteAnimationUrl ? (
        <Suspense fallback={null}>
          <AnimationActionPlayer
            key={remoteAnimationUrl}
            animationUrl={remoteAnimationUrl}
            mixerRef={mixerRef}
          />
        </Suspense>
      ) : null}
      <Html center position={[0, dimensions.labelY, 0]}>
        <span className="remote-player-label">
          {player.displayName}
          {player.actionState && player.actionState !== "idle" ? (
            <em>{player.actionState}</em>
          ) : null}
        </span>
      </Html>
    </group>
  );
}

function RemotePlayerLayer({
  players,
  playerActions,
  mapScaleRatio,
}: {
  players: RemotePresencePlayer[];
  playerActions: RuntimeActionLink[];
  mapScaleRatio: number;
}) {
  return (
    <>
      {players.map((player) => (
        <RemotePlayerAvatar
          key={player.id}
          player={player}
          playerActions={playerActions}
          mapScaleRatio={mapScaleRatio}
        />
      ))}
    </>
  );
}

function ServerEnemyAvatar({
  enemy,
  mapScaleRatio,
  terrainScene,
}: {
  enemy: RealtimeEnemyState;
  mapScaleRatio: number;
  terrainScene: THREE.Object3D | null;
}) {
  const snappedPosition = useTerrainSnappedPosition(enemy.position, terrainScene);
  const groupRef = useRef<THREE.Group | null>(null);
  const targetPositionRef = useRef(new THREE.Vector3(...snappedPosition));
  const currentPositionRef = useRef(new THREE.Vector3(...snappedPosition));
  const targetYawRef = useRef(0);
  const localEnemy = useMemo(
    () => ({
      id: enemy.id,
      type: enemy.type,
      position: enemy.position,
      health: enemy.hp,
      maxHealth: enemy.maxHp,
      isDead: enemy.isDead,
      actionState: enemy.actionState,
    }),
    [enemy],
  );
  const dimensions = getEnemyDimensions(enemy.type, mapScaleRatio);
  const lod = useActorRenderLod(snappedPosition, mapScaleRatio, 58);

  useEffect(() => {
    targetPositionRef.current.fromArray(snappedPosition);
    const horizontalSpeed = Math.hypot(enemy.velocity[0], enemy.velocity[2]);
    if (horizontalSpeed > 0.05) {
      targetYawRef.current = Math.atan2(enemy.velocity[0], enemy.velocity[2]);
    }
  }, [enemy.velocity, snappedPosition]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const alpha = 1 - Math.exp(-Math.max(delta, 0) * 10);
    currentPositionRef.current.lerp(targetPositionRef.current, alpha);
    group.position.copy(currentPositionRef.current);
    const yawDelta = THREE.MathUtils.euclideanModulo(
      targetYawRef.current - group.rotation.y + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
    group.rotation.y += yawDelta * (1 - Math.exp(-Math.max(delta, 0) * 9));
  });

  return (
    <group ref={groupRef} position={snappedPosition}>
      {lod === "high" ? (
        <Suspense
          fallback={
            <ActorFallbackMesh
              color={enemy.type === "zombie_fantasy" ? "#d946ef" : "#84cc16"}
              height={dimensions.visualHeight}
            />
          }
        >
          <RuntimeModelErrorBoundary
            fallback={
              <ActorFallbackMesh
                color={enemy.type === "zombie_fantasy" ? "#d946ef" : "#84cc16"}
                height={dimensions.visualHeight}
              />
            }
            resetKey={enemy.type}
          >
            <CharacterEnemyVisual enemy={localEnemy} mapScaleRatio={mapScaleRatio} />
          </RuntimeModelErrorBoundary>
        </Suspense>
      ) : (
        <ActorFallbackMesh
          color={enemy.type === "zombie_fantasy" ? "#d946ef" : "#84cc16"}
          height={dimensions.visualHeight}
        />
      )}
      {!enemy.isDead && enemy.hp < enemy.maxHp ? (
        <Html position={[0, dimensions.labelY, 0]} center>
          <div className="enemy-health-bar-container">
            <div
              className="enemy-health-bar-fill"
              style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }}
            />
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function ServerNpcAvatar({
  npc,
  mapScaleRatio,
  terrainScene,
}: {
  npc: RealtimeNpcState;
  mapScaleRatio: number;
  terrainScene: THREE.Object3D | null;
}) {
  const snappedPosition = useTerrainSnappedPosition(npc.position, terrainScene);
  const dimensions = getNpcDimensions(npc.kind, mapScaleRatio);
  const lod = useActorRenderLod(snappedPosition, mapScaleRatio, 52);

  return (
    <group position={snappedPosition}>
      {lod === "high" && npc.fileUrl ? (
        <Suspense fallback={<ActorFallbackMesh color="#fbbf24" height={dimensions.visualHeight} />}>
          <RuntimeModelErrorBoundary
            fallback={<ActorFallbackMesh color="#fbbf24" height={dimensions.visualHeight} />}
            resetKey={npc.fileUrl}
          >
            <ModelLoader
              debugLabel={`server-npc:${npc.name ?? npc.id}`}
              fitHeight={dimensions.visualHeight}
              groundToY={0}
              src={npc.fileUrl}
            />
          </RuntimeModelErrorBoundary>
        </Suspense>
      ) : lod === "high" ? (
        <Suspense fallback={<ActorFallbackMesh color="#fbbf24" height={dimensions.visualHeight} />}>
          <RuntimeModelErrorBoundary
            fallback={<ActorFallbackMesh color="#fbbf24" height={dimensions.visualHeight} />}
            resetKey="robot-npc"
          >
            <NpcVisual mapScaleRatio={mapScaleRatio} />
          </RuntimeModelErrorBoundary>
        </Suspense>
      ) : (
        <ActorFallbackMesh color="#fbbf24" height={dimensions.visualHeight} />
      )}
      <Html center position={[0, dimensions.labelY, 0]}>
        <span className="remote-player-label">
          {npc.name ?? npc.kind}
          {npc.kind !== "npc" ? <em>{npc.kind}</em> : null}
        </span>
      </Html>
    </group>
  );
}

function ServerWorldLayer({
  snapshot,
  mapScaleRatio,
  terrainScene,
}: {
  snapshot: RealtimeWorldSnapshot;
  mapScaleRatio: number;
  terrainScene: THREE.Object3D | null;
}) {
  return (
    <>
      {snapshot.enemies.map((enemy) => (
        <ServerEnemyAvatar
          key={enemy.id}
          enemy={enemy}
          mapScaleRatio={mapScaleRatio}
          terrainScene={terrainScene}
        />
      ))}
      {snapshot.npcs.map((npc) => (
        <ServerNpcAvatar
          key={npc.id}
          npc={npc}
          mapScaleRatio={mapScaleRatio}
          terrainScene={terrainScene}
        />
      ))}
    </>
  );
}

type RuntimeStatsSnapshot = {
  fps: number;
  actors: number;
  high: number;
  proxy: number;
  remotePlayers: number;
  enemies: number;
  npcs: number;
  localFallback: boolean;
};

function countHighLod(
  camera: THREE.Camera,
  positions: Array<[number, number, number]>,
  threshold: number,
) {
  let high = 0;
  const point = new THREE.Vector3();
  for (const position of positions) {
    point.fromArray(position);
    if (camera.position.distanceTo(point) <= threshold) high += 1;
  }
  return high;
}

function RuntimePerformanceOverlay({
  enemies,
  mapScaleRatio,
  remotePlayers,
  show,
  useServerWorld,
  worldSnapshot,
}: {
  enemies: Array<{ position: [number, number, number] }>;
  mapScaleRatio: number;
  remotePlayers: RemotePresencePlayer[];
  show: boolean;
  useServerWorld: boolean;
  worldSnapshot: RealtimeWorldSnapshot | null;
}) {
  const { camera } = useThree();
  const frameCountRef = useRef(0);
  const lastSampleRef = useRef(0);
  const [stats, setStats] = useState<RuntimeStatsSnapshot>({
    fps: 0,
    actors: 0,
    high: 0,
    proxy: 0,
    remotePlayers: 0,
    enemies: 0,
    npcs: 0,
    localFallback: false,
  });

  useFrame((state) => {
    if (!show) return;
    frameCountRef.current += 1;
    const now = state.clock.elapsedTime;
    const elapsed = now - lastSampleRef.current;
    if (elapsed < 0.5) return;

    const scale = Math.max(mapScaleRatio, 0.001);
    const remoteHigh = countHighLod(
      camera,
      remotePlayers.map((player) => player.position),
      64 * scale,
    );
    const serverEnemies = worldSnapshot?.enemies ?? [];
    const enemySource = useServerWorld ? serverEnemies : enemies;
    const enemyHigh = countHighLod(
      camera,
      enemySource.map((enemy) => enemy.position),
      58 * scale,
    );
    const npcs = worldSnapshot?.npcs ?? [];
    const npcHigh = countHighLod(
      camera,
      npcs.map((npc) => npc.position),
      52 * scale,
    );
    const actorCount = remotePlayers.length + enemySource.length + npcs.length;
    const high = remoteHigh + enemyHigh + npcHigh;

    setStats({
      fps: Math.round(frameCountRef.current / elapsed),
      actors: actorCount,
      high,
      proxy: Math.max(0, actorCount - high),
      remotePlayers: remotePlayers.length,
      enemies: enemySource.length,
      npcs: npcs.length,
      localFallback: !useServerWorld,
    });
    frameCountRef.current = 0;
    lastSampleRef.current = now;
  });

  if (!show) return null;

  return (
    <Html fullscreen prepend>
      <aside className="runtime-perf-overlay">
        <header>
          <span>Runtime</span>
          <strong>{stats.fps} FPS</strong>
        </header>
        <div>
          <span>Actors</span>
          <strong>{stats.actors}</strong>
        </div>
        <div>
          <span>LOD</span>
          <strong>{stats.high} high / {stats.proxy} proxy</strong>
        </div>
        <div>
          <span>Remote</span>
          <strong>{stats.remotePlayers}</strong>
        </div>
        <div>
          <span>World</span>
          <strong>{stats.enemies} enemies / {stats.npcs} NPC</strong>
        </div>
        {stats.localFallback ? <em>Local preview world</em> : <em>Server world</em>}
      </aside>
    </Html>
  );
}

class PreloadErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.warn("Preloader failed for animation asset:", error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function FbxPreloader({ url }: { url: string }) {
  useLoader(FBXLoader, url);
  return null;
}

function GltfPreloader({ url }: { url: string }) {
  useGLTF(url, "https://www.gstatic.com/draco/v1/decoders/");
  return null;
}

function AnimationAssetPreloader({ url }: { url: string }) {
  const isFbx = url.split("?")[0].split("#").pop()?.endsWith(".fbx");
  if (isFbx) {
    return <FbxPreloader url={url} />;
  } else {
    return <GltfPreloader url={url} />;
  }
}

export function GameCanvas({
  playerActions = [],
  remotePlayers = [],
  worldSnapshot = null,
  onCombatAttack,
  showRuntimeStats = false,
  spectatorFocusPlayerId = null,
  spectatorMode = false,
}: {
  playerActions?: any[];
  remotePlayers?: RemotePresencePlayer[];
  worldSnapshot?: RealtimeWorldSnapshot | null;
  onCombatAttack?: (attack: RealtimeCombatAttack) => Promise<void> | void;
  showRuntimeStats?: boolean;
  spectatorFocusPlayerId?: string | null;
  spectatorMode?: boolean;
}) {
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
  const enemies = useGameStore((state) => state.enemies);
  const robotPosition = useGameStore((state) => state.robotPosition);
  const useServerWorld = Boolean(worldSnapshot);

  const handleTerrainReady = useCallback((scene: THREE.Object3D) => {
    setTerrainScene(scene);
  }, []);

  // Initialize and spawn enemies
  useEffect(() => {
    if (!useServerWorld) {
      spawnEnemies();
    }
  }, [spawnEnemies, useServerWorld]);

  useEffect(() => {
    preloadRuntimeModel(activeLevel.mapModelUrl);
    preloadRuntimeModel(activeLevel.playerCharacter?.fileUrl);
    for (const object of activeLevel.placedObjects) {
      preloadRuntimeModel(object.fileUrl);
    }
  }, [activeLevel]);

  useEffect(() => {
    preloadRuntimeModel("/models/low_poly_zombie_game_animation.glb");
    preloadRuntimeModel("/models/zombie_fantasy_animated.glb");
    preloadRuntimeModel("/models/robot_tuan_tra_NPC.glb");

    for (const player of remotePlayers) {
      preloadRuntimeModel(player.characterFileUrl);
      for (const action of player.characterActions ?? []) {
        preloadRuntimeModel(action.fileUrl);
      }
    }

    for (const npc of worldSnapshot?.npcs ?? []) {
      preloadRuntimeModel(npc.fileUrl);
    }
  }, [remotePlayers, worldSnapshot]);

  useEffect(() => {
    setGroundReady(false);
  }, [activeLevelId, activeLevel.mapModelUrl, worldVersion]);

  useEffect(() => {
    if (!terrainScene || !hasMap) return;
    const frame = window.requestAnimationFrame(() => {
      snapRuntimeToTerrain(terrainScene);
      setGroundReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeLevelId, hasMap, terrainScene, worldVersion]);

  return (
    <div className="game-canvas-container">
      {!spectatorMode ? <BowReticleOverlay /> : null}
      {!spectatorMode ? <BowFirePad /> : null}
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
          {/* Preload all enabled animations in a hidden group */}
          <group visible={false}>
            {playerActions
              .filter((action) => action.enabled && action.fileUrl)
              .map((action) => (
                <PreloadErrorBoundary key={action.id}>
                  <AnimationAssetPreloader url={action.fileUrl} />
                </PreloadErrorBoundary>
              ))}
          </group>

          <Physics gravity={[0, -19.8 * mapScaleRatio, 0]}>
            {/* Terrain Level */}
            {hasMap ? <Terrain onReady={handleTerrainReady} /> : null}
            {groundReady ? <PlacedObjectLayer /> : null}

            {/* Playable Character */}
            {groundReady && hasPlayerCharacter ? (
              !spectatorMode ? (
                <Player
                  key={`player-${worldVersion}`}
                  playerActions={playerActions}
                  serverEnemies={worldSnapshot?.enemies ?? []}
                  onCombatAttack={onCombatAttack}
                />
              ) : null
            ) : null}

            {/* Enemies & NPC Bots */}
            {!useServerWorld && groundReady &&
              enemies.map((enemy) => (
                <CharacterEnemyBot key={enemy.id} enemy={enemy} mapScaleRatio={mapScaleRatio} />
              ))}
            {!useServerWorld && groundReady && activeLevel.robotSpawn ? (
              <NpcBot position={robotPosition} npcId="robot" />
            ) : null}

          </Physics>
          {groundReady && worldSnapshot ? (
            <ServerWorldLayer
              snapshot={worldSnapshot}
              mapScaleRatio={mapScaleRatio}
              terrainScene={terrainScene}
            />
          ) : null}

          <BowTrajectoryLayer />
          {!spectatorMode ? <ArrowProjectileLayer terrainScene={terrainScene} /> : null}
          <RemotePlayerLayer
            players={remotePlayers}
            playerActions={playerActions}
            mapScaleRatio={mapScaleRatio}
          />

          {/* Floating Damage Popup Numbers */}
          <FloatingDamageLayer />

          {/* Camera controller tracking the player */}
          {spectatorMode ? (
            <SpectatorCameraController
              controlsRef={controlsRef}
              focusPlayerId={spectatorFocusPlayerId}
              mapScaleRatio={mapScaleRatio}
              players={remotePlayers}
              worldSnapshot={worldSnapshot}
            />
          ) : (
            <CameraController controlsRef={controlsRef} />
          )}
          <RuntimePerformanceOverlay
            enemies={enemies}
            mapScaleRatio={mapScaleRatio}
            remotePlayers={remotePlayers}
            show={showRuntimeStats}
            useServerWorld={useServerWorld}
            worldSnapshot={worldSnapshot}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
