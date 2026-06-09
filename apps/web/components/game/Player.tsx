"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";
import { PaladinCharacter } from "./PaladinCharacter";

export function Player() {
  const rigidBodyRef = useRef<any>(null);
  const playerNodeRef = useRef<THREE.Group>(null);
  const initialPlayerPositionRef = useRef<[number, number, number]>([...useGameStore.getState().playerPosition]);
  const { camera } = useThree();

  // Zustand state and actions
  const playerHp = useGameStore((state) => state.playerHp);
  const updatePlayerPosition = useGameStore((state) => state.updatePlayerPosition);
  const updatePlayerVelocity = useGameStore((state) => state.updatePlayerVelocity);
  const isAttacking = useGameStore((state) => state.isPlayerAttacking);
  const triggerAttackStart = useGameStore((state) => state.triggerAttackStart);
  const triggerAttackEnd = useGameStore((state) => state.triggerAttackEnd);
  const hitEnemy = useGameStore((state) => state.hitEnemy);
  const addDamageNumber = useGameStore((state) => state.addDamageNumber);
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);

  // Local movement states
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, Shift: false });
  const [actionState, setActionState] = useState<string>("idle");
  const [comboStep, setComboStep] = useState<number>(0); // 0 = idle, 1 = attack, 2 = slash, 3 = kick
  const blockActiveRef = useRef<boolean>(false);
  const hasHitThisSwing = useRef<boolean>(false);
  const attackRecoveryTimeoutRef = useRef<number | null>(null);
  const hitRecoveryTimeoutRef = useRef<number | null>(null);
  const combatProfileRef = useRef<{ damage: number; critChance: number }>({ damage: 15, critChance: 0.2 });
  const groundedContactsRef = useRef(0);
  const jumpActiveRef = useRef(false);
  const lastSyncedPositionRef = useRef<[number, number, number]>(initialPlayerPositionRef.current);
  const lastSyncedVelocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const previousHpRef = useRef(playerHp);

  // Speed configuration
  const speed = 7;
  const rotationSpeed = 10;

  const clearAttackRecoveryTimeout = useCallback(() => {
    if (attackRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(attackRecoveryTimeoutRef.current);
      attackRecoveryTimeoutRef.current = null;
    }
  }, []);

  const clearHitRecoveryTimeout = useCallback(() => {
    if (hitRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(hitRecoveryTimeoutRef.current);
      hitRecoveryTimeoutRef.current = null;
    }
  }, []);

  const finishAttackAnimation = useCallback(() => {
    clearAttackRecoveryTimeout();
    triggerAttackEnd();
    setActionState("idle");
    window.setTimeout(() => {
      setComboStep(0);
    }, 800);
  }, [clearAttackRecoveryTimeout, triggerAttackEnd]);

  const handleJump = useCallback(() => {
    if (!rigidBodyRef.current || jumpActiveRef.current || groundedContactsRef.current <= 0) {
      return;
    }

    const body = rigidBodyRef.current;
    const currentVel = body.linvel();
    jumpActiveRef.current = true;
    setActionState("jump");
    body.setLinvel({ x: currentVel.x, y: 6.8, z: currentVel.z }, true);
  }, []);

  useEffect(() => {
    if (playerHp < previousHpRef.current && playerHp > 0 && !isAttacking && !jumpActiveRef.current) {
      clearHitRecoveryTimeout();
      setActionState("hit");
      hitRecoveryTimeoutRef.current = window.setTimeout(() => {
        hitRecoveryTimeoutRef.current = null;
        if (!jumpActiveRef.current) {
          setActionState("idle");
        }
      }, 420);
    }

    previousHpRef.current = playerHp;
  }, [clearHitRecoveryTimeout, isAttacking, playerHp]);

  // Handle attacks (Combo system)
  const handleAttack = useCallback((mode: "light" | "heavy" | "alt") => {
    hasHitThisSwing.current = false;

    if (mode === "heavy") {
      combatProfileRef.current = { damage: 35, critChance: 0.4 };
      setActionState("kick");
      triggerAttackStart(3);
      setComboStep(3);
      return;
    }

    if (mode === "alt") {
      const randomAttackPool = [
        { action: "attack", damage: 17, critChance: 0.18, combo: 1 },
        { action: "slash", damage: 22, critChance: 0.22, combo: 2 },
        { action: "kick", damage: 35, critChance: 0.4, combo: 3 },
        { action: "attackAlt1", damage: 18, critChance: 0.22, combo: 1 },
        { action: "attackAlt2", damage: 24, critChance: 0.28, combo: 2 },
        { action: "attackAlt3", damage: 30, critChance: 0.35, combo: 3 },
      ] as const;
      const selectedAttack = randomAttackPool[Math.floor(Math.random() * randomAttackPool.length)];
      combatProfileRef.current = { damage: selectedAttack.damage, critChance: selectedAttack.critChance };
      setComboStep(selectedAttack.combo);
      setActionState(selectedAttack.action);
      triggerAttackStart(selectedAttack.combo);
      return;
    }

    combatProfileRef.current = { damage: comboStep === 1 ? 22 : 15, critChance: comboStep === 1 ? 0.24 : 0.2 };
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
  }, [comboStep, triggerAttackStart]);

  // Track inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (playerHp <= 0 || activeDialogueNpcId) return;

      const key = e.key.toLowerCase();
      if (["w", "arrowup"].includes(key)) setKeys((k) => ({ ...k, w: true }));
      if (["s", "arrowdown"].includes(key)) setKeys((k) => ({ ...k, s: true }));
      if (["a", "arrowleft"].includes(key)) setKeys((k) => ({ ...k, a: true }));
      if (["d", "arrowright"].includes(key)) setKeys((k) => ({ ...k, d: true }));
      if (e.key === "Shift") {
        setKeys((k) => ({ ...k, Shift: true }));
        blockActiveRef.current = true;
      }

      if (key === "j" && !isAttacking) {
        handleAttack("light");
      }
      if (key === "k" && !isAttacking) {
        handleAttack("heavy");
      }
      if (e.code === "Space" && !isAttacking) {
        e.preventDefault();
        handleJump();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["w", "arrowup"].includes(key)) setKeys((k) => ({ ...k, w: false }));
      if (["s", "arrowdown"].includes(key)) setKeys((k) => ({ ...k, s: false }));
      if (["a", "arrowleft"].includes(key)) setKeys((k) => ({ ...k, a: false }));
      if (["d", "arrowright"].includes(key)) setKeys((k) => ({ ...k, d: false }));
      if (e.key === "Shift") {
        setKeys((k) => ({ ...k, Shift: false }));
        blockActiveRef.current = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (playerHp <= 0 || activeDialogueNpcId) return;
      if (e.button !== 2 || isAttacking) return;
      e.preventDefault();
      handleAttack("alt");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeDialogueNpcId, handleAttack, handleJump, isAttacking, playerHp]);

  // Called when animations end playing
  const onAnimationFinished = useCallback((actionName: string) => {
    if (["attack", "slash", "kick", "attackAlt1", "attackAlt2", "attackAlt3"].includes(actionName)) {
      finishAttackAnimation();
    }
    if (actionName === "death") {
      // Stay in death state
    }
  }, [finishAttackAnimation]);

  useEffect(() => {
    clearAttackRecoveryTimeout();

    if (!isAttacking) {
      return;
    }

    const recoveryDelay =
      actionState === "kick" ? 1100 :
      actionState === "attackAlt3" ? 1050 :
      actionState === "attackAlt2" ? 980 :
      actionState === "attackAlt1" ? 900 :
      actionState === "slash" ? 900 :
      actionState === "attack" ? 850 :
      null;

    if (recoveryDelay === null) {
      return;
    }

    attackRecoveryTimeoutRef.current = window.setTimeout(() => {
      finishAttackAnimation();
    }, recoveryDelay);

    return () => {
      clearAttackRecoveryTimeout();
    };
  }, [actionState, clearAttackRecoveryTimeout, finishAttackAnimation, isAttacking]);

  useEffect(() => {
    return () => {
      clearAttackRecoveryTimeout();
      clearHitRecoveryTimeout();
    };
  }, [clearAttackRecoveryTimeout, clearHitRecoveryTimeout]);

  // Combat collision check (checks on active frame window)
  const checkCombatCollisions = (playerPos: THREE.Vector3, playerRot: THREE.Quaternion) => {
    if (hasHitThisSwing.current) return;

    // We check hit collision around halfway through the attack animations
    // Let's assume a attack range of 2.2 units and 90-degree front arc cone
    const attackRange = 2.4;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRot);

    const enemies = useGameStore.getState().enemies;
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
          const { damage, critChance } = combatProfileRef.current;
          const isCrit = Math.random() < critChance;
          const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;

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
    const currentVel = body.linvel();
    const isGrounded = groundedContactsRef.current > 0 && currentVel.y <= 0.2;
    
    const nextPosition: [number, number, number] = [playerPos.x, playerPos.y, playerPos.z];
    const lastPosition = lastSyncedPositionRef.current;
    if (
      Math.abs(nextPosition[0] - lastPosition[0]) > 0.02 ||
      Math.abs(nextPosition[1] - lastPosition[1]) > 0.02 ||
      Math.abs(nextPosition[2] - lastPosition[2]) > 0.02
    ) {
      lastSyncedPositionRef.current = nextPosition;
      updatePlayerPosition(nextPosition);
    }

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
      body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      return;
    }

    if (actionState === "hit") {
      body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      return;
    }

    // 2. Blocking state
    if (blockActiveRef.current) {
      if (actionState !== "block") {
        setActionState("block");
      }
      body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      return;
    }

    // 3. Movement Calculations
    let moveX = 0;
    let moveZ = 0;
    let isKeyboardMoving = false;

    if (keys.w) { moveZ += 1; isKeyboardMoving = true; }
    if (keys.s) { moveZ -= 1; isKeyboardMoving = true; }
    if (keys.a) { moveX -= 1; isKeyboardMoving = true; }
    if (keys.d) { moveX += 1; isKeyboardMoving = true; }

    // Clear click target if keyboard is used
    let targetX = 0;
    let targetZ = 0;

    if (isKeyboardMoving) {
      const cameraForward = new THREE.Vector3();
      camera.getWorldDirection(cameraForward);
      cameraForward.y = 0;
      cameraForward.normalize();

      const cameraRight = new THREE.Vector3().crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
      const moveDir = cameraForward.multiplyScalar(moveZ).add(cameraRight.multiplyScalar(moveX)).normalize();
      
      targetX = moveDir.x * speed;
      targetZ = moveDir.z * speed;
      
      // Face the direction of keyboard movement
      const angle = Math.atan2(moveDir.x, moveDir.z);
      const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      playerNodeRef.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
      
      if (!jumpActiveRef.current) {
        const newAction = speed > 4 ? "run" : "walk";
        if (actionState !== newAction) setActionState(newAction);
      }

    } else {
      // No movement
      if (!jumpActiveRef.current && actionState !== "idle") setActionState("idle");
    }

    if (jumpActiveRef.current && isGrounded) {
      jumpActiveRef.current = false;
      if (Math.abs(targetX) > 0.1 || Math.abs(targetZ) > 0.1) {
        setActionState("run");
      } else {
        setActionState("idle");
      }
    }

    // Apply horizontal velocity, keeping the vertical gravity velocity from physics
    body.setLinvel({ x: targetX, y: currentVel.y, z: targetZ }, true);
    const nextVelocity: [number, number, number] = [targetX, currentVel.y, targetZ];
    const lastVelocity = lastSyncedVelocityRef.current;
    if (
      Math.abs(nextVelocity[0] - lastVelocity[0]) > 0.05 ||
      Math.abs(nextVelocity[1] - lastVelocity[1]) > 0.05 ||
      Math.abs(nextVelocity[2] - lastVelocity[2]) > 0.05
    ) {
      lastSyncedVelocityRef.current = nextVelocity;
      updatePlayerVelocity(nextVelocity);
    }
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders={false}
      position={initialPlayerPositionRef.current}
      enabledRotations={[false, false, false]} // Lock character from tipping over
      linearDamping={1}
      type="dynamic"
      ccd
      canSleep={false}
    >
      <CapsuleCollider args={[0.7, 0.4]} position={[0, 1.1, 0]} />
      <CuboidCollider
        args={[0.32, 0.08, 0.32]}
        position={[0, 0.1, 0]}
        sensor
        onIntersectionEnter={() => {
          groundedContactsRef.current += 1;
        }}
        onIntersectionExit={() => {
          groundedContactsRef.current = Math.max(groundedContactsRef.current - 1, 0);
        }}
      />
      <group ref={playerNodeRef}>
        <PaladinCharacter
          currentAction={actionState}
          onAnimationFinished={onAnimationFinished}
        />
      </group>
    </RigidBody>
  );
}
