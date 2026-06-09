"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useGameStore } from "@/store/gameStore";
import { stabilizeClipRootMotion, stripPositionTracks } from "./animationUtils";

type EnemyZombieProps = {
  id: string;
};

export function EnemyZombie({ id }: EnemyZombieProps) {
  const rigidBodyRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  const initialPositionRef = useRef<[number, number, number]>(
    useGameStore.getState().enemies.find((entry) => entry.id === id)?.position ?? [0, 1.2, 0]
  );
  const lastSyncedPositionRef = useRef<[number, number, number]>(initialPositionRef.current);
  const lastPositionSyncTimeRef = useRef(0);

  // Zustand state and actions
  const enemyType = useGameStore((state) => state.enemies.find((e) => e.id === id)?.type);
  const enemyHealth = useGameStore((state) => state.enemies.find((e) => e.id === id)?.health ?? 0);
  const enemyMaxHealth = useGameStore((state) => state.enemies.find((e) => e.id === id)?.maxHealth ?? 1);
  const enemyIsDead = useGameStore((state) => state.enemies.find((e) => e.id === id)?.isDead ?? true);
  const updateEnemyPosition = useGameStore((state) => state.updateEnemyPosition);
  const updateEnemyState = useGameStore((state) => state.updateEnemyState);

  const [animState, setAnimState] = useState<string>("idle");
  const lastAttackTime = useRef<number>(0);
  const isCurrentlyAttacking = useRef<boolean>(false);

  if (!enemyType) return null;

  const isFantasy = enemyType === "zombie_fantasy";

  // 1. Load GLB based on zombie type
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const modelUrl = isFantasy
    ? "/models/zombie_fantasy_animated.glb"
    : "/models/low_poly_zombie_game_animation.glb";

  const { scene, animations } = useGLTF(modelUrl, dracoPath);
  const stabilizedAnimations = useMemo(
    () =>
      animations.map((clip) => {
        const nextClip = stabilizeClipRootMotion(clip.clone());
        return isFantasy ? stripPositionTracks(nextClip) : nextClip;
      }),
    [animations, isFantasy]
  );

  // Clone scene so multiple zombies don't share the same root transform
  const modelScale = isFantasy ? 0.27 : 0.1;

  const clonedScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = true;
      }
    });
    cloned.scale.setScalar(modelScale);
    cloned.position.set(0, 0, 0);
    return cloned;
  }, [scene, modelScale]);

  // 2. Setup Animations
  const { actions, mixer } = useAnimations(stabilizedAnimations, clonedScene);

  // Animation mapping helper
  const animationMap = useMemo(() => {
    if (isFantasy) {
      return {
        idle: "Zombie|Idle",
        walk: "Zombie|Walk",
        run: "Zombie|running",
        attack: "Zombie|attackA",
        death: "Zombie|death",
        damage: "Zombie|damage",
      };
    } else {
      return {
        idle: "Idle",
        walk: "Walk",
        run: "Walk", // low poly only has walk
        attack: "Attack",
        death: "Death",
        damage: "Idle",
      };
    }
  }, [isFantasy]);

  // Handle Action state change
  useEffect(() => {
    const mappedClip = animationMap[animState as keyof typeof animationMap];
    const action = actions[mappedClip];

    if (action) {
      action.reset();
      
      if (animState === "attack" || animState === "death") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }

      action.play();
      
      // Stop old actions
      Object.entries(actions).forEach(([name, act]) => {
        if (name !== mappedClip && act) {
          act.fadeOut(0.2);
        }
      });
    }
  }, [animState, actions, animationMap]);

  // Listen to animation finished (to end attacks or trigger cleanup)
  useEffect(() => {
    if (!mixer) return;

    const onFinished = (e: any) => {
      const clipName = e.action.getClip().name;
      if (clipName === animationMap.attack) {
        isCurrentlyAttacking.current = false;
        setAnimState("idle");
      }
    };

    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [mixer, animationMap]);

  // 3. AI Chase and Attack Logic
  useFrame((state, delta) => {
    const gameState = useGameStore.getState();
    const playerPosition = gameState.playerPosition;
    const playerHp = gameState.playerHp;

    if (!rigidBodyRef.current || !groupRef.current || enemyIsDead) {
      if (enemyIsDead && animState !== "death") {
        setAnimState("death");
        rigidBodyRef.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    clonedScene.position.set(0, 0, 0);

    const body = rigidBodyRef.current;
    const pos = body.translation();
    const currentPosVec = new THREE.Vector3(pos.x, pos.y, pos.z);

    const nextPosition: [number, number, number] = [pos.x, pos.y, pos.z];
    const lastPosition = lastSyncedPositionRef.current;
    if (
      state.clock.elapsedTime - lastPositionSyncTimeRef.current > 0.1 &&
      (
        Math.abs(nextPosition[0] - lastPosition[0]) > 0.05 ||
        Math.abs(nextPosition[1] - lastPosition[1]) > 0.05 ||
        Math.abs(nextPosition[2] - lastPosition[2]) > 0.05
      )
    ) {
      lastSyncedPositionRef.current = nextPosition;
      lastPositionSyncTimeRef.current = state.clock.elapsedTime;
      updateEnemyPosition(id, nextPosition);
    }

    // Dead player -> idle
    if (playerHp <= 0) {
      if (animState !== "idle") setAnimState("idle");
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      return;
    }

    const playerVec = new THREE.Vector3(...playerPosition);
    const toPlayer = playerVec.clone().sub(currentPosVec);
    toPlayer.y = 0; // ignores height differences for distance checks
    const distance = toPlayer.length();

    const chaseRange = 14;
    const attackRange = isFantasy ? 2.3 : 1.8;
    const attackCooldown = isFantasy ? 2500 : 1800; // ms
    const speed = isFantasy ? 3.5 : 2.5;

    // Trigger hit react state if HP is reduced recently
    // Wait, the damage animation is played when hit
    if (enemyHealth <= 0) {
      updateEnemyState(id, { isDead: true });
      setAnimState("death");
      return;
    }

    if (distance < attackRange) {
      // Within attack range: Attack player!
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);

      // Rotate to face player
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      groupRef.current.rotation.y = angle;

      const now = Date.now();
      if (now - lastAttackTime.current > attackCooldown && !isCurrentlyAttacking.current) {
        isCurrentlyAttacking.current = true;
        lastAttackTime.current = now;
        setAnimState("attack");

        // Deal damage to player on impact frame (simulate with half cooldown timeout)
        setTimeout(() => {
          const gameState = useGameStore.getState();
          const latestEnemy = gameState.enemies.find((entry) => entry.id === id);
          if (!latestEnemy || latestEnemy.isDead || gameState.playerHp <= 0) return;
          
          // Re-evaluate distance
          const newPos = rigidBodyRef.current?.translation();
          if (!newPos) return;
          const freshEnemyPos = new THREE.Vector3(newPos.x, newPos.y, newPos.z);
          const freshPlayerPos = new THREE.Vector3(...gameState.playerPosition);
          const d = freshEnemyPos.distanceTo(freshPlayerPos);

          if (d <= attackRange + 0.5) {
            // Apply damage, blocking reduces damage by 75%
            const isBlocking = gameState.playerHp > 0 && !gameState.isPlayerAttacking;
            const rawDamage = isFantasy ? 20 : 10;
            const finalDamage = isBlocking ? Math.max(Math.floor(rawDamage * 0.25), 1) : rawDamage;
            
            gameState.damagePlayer(finalDamage);
          }
        }, 500);
      }
    } else if (distance < chaseRange && !isCurrentlyAttacking.current) {
      // Chase player
      toPlayer.normalize();
      const vx = toPlayer.x * speed;
      const vz = toPlayer.z * speed;
      body.setLinvel({ x: vx, y: body.linvel().y, z: vz }, true);

      // Rotate to face travel direction
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      groupRef.current.rotation.y = angle;

      const runAnim = isFantasy ? "run" : "walk";
      if (animState !== runAnim) setAnimState(runAnim);
    } else {
      // Idle / Stop chasing
      if (!isCurrentlyAttacking.current) {
        body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
        if (animState !== "idle") setAnimState("idle");
      }
    }
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      position={initialPositionRef.current}
      enabledRotations={[false, false, false]}
      type="dynamic"
      linearDamping={1}
      ccd
      canSleep={false}
    >
      <CapsuleCollider args={[0.7, 0.4]} position={[0, 1.1, 0]} />
      
      {/* 3D Billboard HP Bar above head */}
      {!enemyIsDead && (
        <group position={[0, 2.3, 0]}>
          {/* Background */}
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[1.2, 0.12]} />
            <meshBasicMaterial color="#333333" toneMapped={false} />
          </mesh>
          {/* Health fill */}
          <mesh position={[((enemyHealth / enemyMaxHealth) - 1) * 0.6, 0, 0.01]}>
            <planeGeometry args={[1.2 * (enemyHealth / enemyMaxHealth), 0.1]} />
            <meshBasicMaterial color={isFantasy ? "#ff3c00" : "#ffaa00"} toneMapped={false} />
          </mesh>
        </group>
      )}

      <group ref={groupRef}>
        <primitive object={clonedScene} />
      </group>
    </RigidBody>
  );
}

// Preload the GLBs
useGLTF.preload("/models/zombie_fantasy_animated.glb", "https://www.gstatic.com/draco/v1/decoders/");
useGLTF.preload("/models/low_poly_zombie_game_animation.glb", "https://www.gstatic.com/draco/v1/decoders/");
