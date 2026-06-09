"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";
import { PaladinCharacter } from "./PaladinCharacter";

export function Player() {
  const rigidBodyRef = useRef<any>(null);
  const playerNodeRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Zustand state and actions
  const playerHp = useGameStore((state) => state.playerHp);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const updatePlayerPosition = useGameStore((state) => state.updatePlayerPosition);
  const updatePlayerVelocity = useGameStore((state) => state.updatePlayerVelocity);
  const targetMove = useGameStore((state) => state.playerTargetMove);
  const setTargetMove = useGameStore((state) => state.setPlayerTargetMove);
  const isAttacking = useGameStore((state) => state.isPlayerAttacking);
  const triggerAttackStart = useGameStore((state) => state.triggerAttackStart);
  const triggerAttackEnd = useGameStore((state) => state.triggerAttackEnd);
  const enemies = useGameStore((state) => state.enemies);
  const hitEnemy = useGameStore((state) => state.hitEnemy);
  const addDamageNumber = useGameStore((state) => state.addDamageNumber);
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);

  // Local movement states
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, Shift: false });
  const [actionState, setActionState] = useState<string>("idle");
  const [comboStep, setComboStep] = useState<number>(0); // 0 = idle, 1 = attack, 2 = slash, 3 = kick
  const blockActiveRef = useRef<boolean>(false);
  const hasHitThisSwing = useRef<boolean>(false);

  // Speed configuration
  const speed = 7;
  const rotationSpeed = 10;

  // Track inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (playerHp <= 0 || activeDialogueNpcId) return;

      const key = e.key.toLowerCase();
      if (["w", "arrowup"].includes(e.key)) setKeys((k) => ({ ...k, w: true }));
      if (["s", "arrowdown"].includes(e.key)) setKeys((k) => ({ ...k, s: true }));
      if (["a", "arrowleft"].includes(e.key)) setKeys((k) => ({ ...k, a: true }));
      if (["d", "arrowright"].includes(e.key)) setKeys((k) => ({ ...k, d: true }));
      if (e.key === "Shift") {
        setKeys((k) => ({ ...k, Shift: true }));
        blockActiveRef.current = true;
      }

      // Attack bindings: J or Space for Light, K for Heavy slash
      if ((key === "j" || e.key === " ") && !isAttacking) {
        handleAttack(false); // Light Combo
      }
      if (key === "k" && !isAttacking) {
        handleAttack(true); // Heavy Slash
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (["w", "arrowup"].includes(e.key)) setKeys((k) => ({ ...k, w: false }));
      if (["s", "arrowdown"].includes(e.key)) setKeys((k) => ({ ...k, s: false }));
      if (["a", "arrowleft"].includes(e.key)) setKeys((k) => ({ ...k, a: false }));
      if (["d", "arrowright"].includes(e.key)) setKeys((k) => ({ ...k, d: false }));
      if (e.key === "Shift") {
        setKeys((k) => ({ ...k, Shift: false }));
        blockActiveRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [playerHp, isAttacking, comboStep, activeDialogueNpcId]);

  // Handle attacks (Combo system)
  const handleAttack = (isHeavy: boolean) => {
    setTargetMove(null); // Stop click-to-move when attacking
    hasHitThisSwing.current = false;

    if (isHeavy) {
      // Heavy Attack finisher
      setActionState("kick");
      triggerAttackStart(3);
      setComboStep(3);
      return;
    }

    // Light Attack Combo (1 -> 2 -> 1...)
    let nextStep = 1;
    if (comboStep === 1) {
      nextStep = 2;
      setActionState("slash");
    } else {
      nextStep = 1;
      setActionState("attack");
    }

    setComboStep(nextStep);
    triggerAttackStart(nextStep);
  };

  // Called when animations end playing
  const onAnimationFinished = (actionName: string) => {
    if (["attack", "slash", "kick"].includes(actionName)) {
      triggerAttackEnd();
      setActionState("idle");
      // Set a short timer to reset combo step if user stops attacking
      setTimeout(() => {
        setComboStep(0);
      }, 800);
    }
    if (actionName === "death") {
      // Stay in death state
    }
  };

  // Combat collision check (checks on active frame window)
  const checkCombatCollisions = (playerPos: THREE.Vector3, playerRot: THREE.Quaternion) => {
    if (hasHitThisSwing.current) return;

    // We check hit collision around halfway through the attack animations
    // Let's assume a attack range of 2.2 units and 90-degree front arc cone
    const attackRange = 2.4;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRot);

    for (const enemy of enemies) {
      if (enemy.isDead) continue;

      const enemyPos = new THREE.Vector3(...enemy.position);
      const toEnemy = enemyPos.clone().sub(playerPos);
      const distance = toEnemy.length();

      if (distance <= attackRange) {
        toEnemy.normalize();
        const angle = forward.angleTo(toEnemy);

        // Hitting within a 75 degree angle in front of character
        if (angle < Math.PI * 0.45) {
          hasHitThisSwing.current = true;

          // Damage parameters based on combo steps
          let baseDamage = 15;
          let isCrit = false;
          if (comboStep === 2) baseDamage = 22; // Combo step 2 (slash)
          if (comboStep === 3) {
            baseDamage = 35; // Heavy Finisher kick
            isCrit = Math.random() > 0.4;
          } else {
            isCrit = Math.random() > 0.8;
          }

          const finalDamage = isCrit ? Math.floor(baseDamage * 1.5) : baseDamage;

          // Push floating damage number
          const floatPos: [number, number, number] = [
            enemy.position[0] + (Math.random() - 0.5) * 0.5,
            enemy.position[1] + 1.2,
            enemy.position[2] + (Math.random() - 0.5) * 0.5,
          ];
          addDamageNumber(finalDamage, floatPos, isCrit);

          // Apply damage
          hitEnemy(enemy.id, finalDamage, isCrit);
          break; // Hit one enemy per swing to balance, or can do multi-hit if we want
        }
      }
    }
  };

  useFrame((state, delta) => {
    if (!rigidBodyRef.current || !playerNodeRef.current) return;

    const body = rigidBodyRef.current;
    const playerPos = body.translation();
    const playerVec3 = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    
    // Sync position with Zustand store
    updatePlayerPosition([playerPos.x, playerPos.y, playerPos.z]);

    // Handle Death
    if (playerHp <= 0) {
      if (actionState !== "death") {
        setActionState("death");
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    // 1. Combat check (if currently in attack animation state)
    if (isAttacking) {
      const q = new THREE.Quaternion();
      playerNodeRef.current.getWorldQuaternion(q);
      checkCombatCollisions(playerVec3, q);
      
      // Stop moving while attacking to add momentum weight
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      return;
    }

    // 2. Blocking state
    if (blockActiveRef.current) {
      if (actionState !== "block") {
        setActionState("block");
      }
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      return;
    }

    // 3. Movement Calculations
    let moveX = 0;
    let moveZ = 0;
    let isKeyboardMoving = false;

    if (keys.w) { moveZ -= 1; isKeyboardMoving = true; }
    if (keys.s) { moveZ += 1; isKeyboardMoving = true; }
    if (keys.a) { moveX -= 1; isKeyboardMoving = true; }
    if (keys.d) { moveX += 1; isKeyboardMoving = true; }

    // Clear click target if keyboard is used
    if (isKeyboardMoving) {
      setTargetMove(null);
    }

    const currentVel = body.linvel();
    let targetX = 0;
    let targetZ = 0;

    if (isKeyboardMoving) {
      // Calculate movement relative to camera angle
      const camEuler = new THREE.Euler(0, camera.rotation.y, 0, "YXZ");
      const moveDir = new THREE.Vector3(moveX, 0, moveZ).normalize().applyEuler(camEuler);
      
      targetX = moveDir.x * speed;
      targetZ = moveDir.z * speed;
      
      // Face the direction of keyboard movement
      const angle = Math.atan2(moveDir.x, moveDir.z);
      const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      playerNodeRef.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
      
      const newAction = speed > 4 ? "run" : "walk";
      if (actionState !== newAction) setActionState(newAction);

    } else if (targetMove) {
      // Click-to-move logic
      const dest = new THREE.Vector3(...targetMove);
      const dirVec = dest.clone().sub(playerVec3);
      dirVec.y = 0; // ignores height difference
      const dist = dirVec.length();

      if (dist > 0.3) {
        dirVec.normalize();
        targetX = dirVec.x * speed;
        targetZ = dirVec.z * speed;

        // Face click target
        const angle = Math.atan2(dirVec.x, dirVec.z);
        const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        playerNodeRef.current.quaternion.slerp(targetRotation, rotationSpeed * delta);

        if (actionState !== "run") setActionState("run");
      } else {
        // Reached destination
        setTargetMove(null);
        if (actionState !== "idle") setActionState("idle");
      }
    } else {
      // No movement
      if (actionState !== "idle") setActionState("idle");
    }

    // Apply horizontal velocity, keeping the vertical gravity velocity from physics
    body.setLinvel({ x: targetX, y: currentVel.y, z: targetZ }, true);
    updatePlayerVelocity([targetX, currentVel.y, targetZ]);
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      position={playerPosition}
      enabledRotations={[false, false, false]} // Lock character from tipping over
      linearDamping={1}
      type="dynamic"
    >
      <CapsuleCollider args={[0.7, 0.4]} position={[0, 1.1, 0]} />
      <group ref={playerNodeRef}>
        <PaladinCharacter
          currentAction={actionState}
          onAnimationFinished={onAnimationFinished}
        />
      </group>
    </RigidBody>
  );
}
