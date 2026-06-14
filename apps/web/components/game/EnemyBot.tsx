"use client";

import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";
import { useGameStore, type EnemyState } from "@/store/gameStore";

// Helper to search and find proper animation clips
function findClipByName(clips: THREE.AnimationClip[], keywords: string[]) {
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    return keywords.some((kw) => name.includes(kw));
  });
}

type BotProps = {
  enemy: EnemyState;
  mapScaleRatio: number;
};

type VisualProps = {
  enemy: EnemyState;
  mapScaleRatio: number;
};

function CharacterEnemyVisual({ enemy, mapScaleRatio }: VisualProps) {
  const modelUrl = useMemo(() => {
    return enemy.type === "zombie_fantasy"
      ? "/models/zombie_fantasy_animated.glb"
      : "/models/low_poly_zombie_game_animation.glb";
  }, [enemy.type]);

  const { scene, animations } = useGLTF(modelUrl, "https://www.gstatic.com/draco/v1/decoders/");

  // Clone scene so multiple bots don't share the same scene instance
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Setup animations
  const clips = useMemo(() => {
    const idle = findClipByName(animations, ["idle", "stand", "breath"]) || animations[0];
    const run = findClipByName(animations, ["run", "walk", "chase", "move"]) || animations[0];
    const attack = findClipByName(animations, ["attack", "bite", "strike", "hit"]) || animations[0];
    const death = findClipByName(animations, ["death", "die", "fall"]) || animations[0];
    return { idle, run, attack, death };
  }, [animations]);

  const visualRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!visualRef.current) return;
    const mixer = new THREE.AnimationMixer(visualRef.current);
    mixerRef.current = mixer;

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [clonedScene]);

  // Play animation clip helper
  const playClip = (clip: THREE.AnimationClip | null, loop = true) => {
    if (!mixerRef.current || !clip) return;
    const action = mixerRef.current.clipAction(clip);
    
    if (activeActionRef.current === action) return;
    
    if (activeActionRef.current) {
      activeActionRef.current.fadeOut(0.24);
    }
    
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.24);
    action.play();
    activeActionRef.current = action;
  };

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  useEffect(() => {
    if (enemy.isDead || enemy.health <= 0) {
      playClip(clips.death, false);
    } else if (enemy.actionState === "attack") {
      playClip(clips.attack);
    } else if (enemy.actionState === "run") {
      playClip(clips.run);
    } else {
      playClip(clips.idle);
    }
  }, [enemy.isDead, enemy.health, enemy.actionState, clips]);

  return (
    <group ref={visualRef}>
      <primitive object={clonedScene} scale={enemy.type === "zombie_fantasy" ? 1.0 : 0.85} />
    </group>
  );
}

export function CharacterEnemyBot({ enemy, mapScaleRatio }: BotProps) {
  const rigidBodyRef = useRef<any>(null);
  const modelRef = useRef<THREE.Group>(null);
  const lastAttackTimeRef = useRef<number>(0);

  const modelHeight = (enemy.type === "zombie_fantasy" ? 2.3 : 1.8) * mapScaleRatio;

  useFrame(() => {
    const body = rigidBodyRef.current;
    if (!body) return;

    const currentPos = body.translation();
    const store = useGameStore.getState();
    const playerPos = new THREE.Vector3(...store.playerPosition);
    const enemyPosVec = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
    
    // Sync position back to store for hit calculations
    store.updateEnemyPosition(enemy.id, [currentPos.x, currentPos.y, currentPos.z]);

    // Handle Death
    if (enemy.isDead || enemy.health <= 0) {
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      return;
    }

    // Calculate distance to player
    const toPlayer = playerPos.clone().sub(enemyPosVec);
    toPlayer.y = 0; // Lock vertical distance
    const dist = toPlayer.length();
    
    const detectionRadius = 15 * mapScaleRatio;
    const attackRadius = 2.0 * mapScaleRatio;
    const speed = (enemy.type === "zombie_fantasy" ? 3.0 : 2.0) * mapScaleRatio;

    // AI States
    if (dist < detectionRadius && dist > attackRadius && store.playerHp > 0 && store.status === "playing") {
      // Chase Player
      toPlayer.normalize();
      body.setLinvel({ x: toPlayer.x * speed, y: body.linvel().y, z: toPlayer.z * speed }, true);

      // Rotate towards player
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      if (modelRef.current) {
        modelRef.current.rotation.y = angle;
      }
      
      // Update store action state
      if (enemy.actionState !== "run") {
        store.updateEnemyState(enemy.id, { actionState: "run" });
      }
    } else if (dist <= attackRadius && store.playerHp > 0 && store.status === "playing") {
      // Attack Player
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);

      // Face player while attacking
      toPlayer.normalize();
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      if (modelRef.current) {
        modelRef.current.rotation.y = angle;
      }

      // Deal damage to player on cooldown (e.g. 1.5 seconds)
      const now = window.performance.now();
      if (now - lastAttackTimeRef.current > 1500) {
        lastAttackTimeRef.current = now;
        const damage = enemy.type === "zombie_fantasy" ? 12 : 5;
        store.damagePlayer(damage);
      }

      if (enemy.actionState !== "attack") {
        store.updateEnemyState(enemy.id, { actionState: "attack" });
      }
    } else {
      // Idle
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);

      if (enemy.actionState !== "idle") {
        store.updateEnemyState(enemy.id, { actionState: "idle" });
      }
    }
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      position={enemy.position}
      enabledRotations={[false, false, false]}
      linearDamping={1}
      type="dynamic"
    >
      <CapsuleCollider
        args={[(modelHeight / 2) - 0.2, 0.45 * mapScaleRatio]}
        position={[0, (modelHeight / 2), 0]}
      />
      <group ref={modelRef}>
        <Suspense fallback={null}>
          <CharacterEnemyVisual enemy={enemy} mapScaleRatio={mapScaleRatio} />
        </Suspense>
      </group>
      {/* Visual health bar overlay */}
      {!enemy.isDead && enemy.health < enemy.maxHealth && (
        <Html position={[0, modelHeight + 0.3, 0]} center>
          <div className="enemy-health-bar-container">
            <div
              className="enemy-health-bar-fill"
              style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
            />
          </div>
        </Html>
      )}
    </RigidBody>
  );
}

function NpcVisual({ mapScaleRatio }: { mapScaleRatio: number }) {
  const { scene, animations } = useGLTF("/models/robot_tuan_tra_NPC.glb", "https://www.gstatic.com/draco/v1/decoders/");

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  const modelRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (!modelRef.current) return;
    const mixer = new THREE.AnimationMixer(modelRef.current);
    mixerRef.current = mixer;

    const idleClip = findClipByName(animations, ["idle", "stand", "breath", "patrol"]) || animations[0];
    if (idleClip) {
      const action = mixer.clipAction(idleClip);
      action.play();
    }

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [clonedScene, animations]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  return (
    <group ref={modelRef}>
      <primitive object={clonedScene} scale={1.25 * mapScaleRatio} />
    </group>
  );
}

export function NpcBot({ position, npcId }: { position: [number, number, number]; npcId: string }) {
  const [isNear, setIsNear] = useState(false);
  const mapScaleRatio = useGameStore((state) => state.mapScaleRatio);

  useFrame(() => {
    // Distance check to player
    const store = useGameStore.getState();
    const playerPos = new THREE.Vector3(...store.playerPosition);
    const npcPos = new THREE.Vector3(...position);
    const dist = playerPos.distanceTo(npcPos);

    const activeDialogueNpcId = store.activeDialogueNpcId;

    if (dist < 3.0 * mapScaleRatio && !activeDialogueNpcId) {
      setIsNear(true);
    } else {
      setIsNear(false);
    }
  });

  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <Suspense fallback={null}>
        <NpcVisual mapScaleRatio={mapScaleRatio} />
      </Suspense>
      {isNear && (
        <Html position={[0, 2.3 * mapScaleRatio, 0]} center>
          <div className="npc-prompt-bubble">
            Press <strong className="prompt-key">E</strong> to interact
          </div>
        </Html>
      )}
    </RigidBody>
  );
}

