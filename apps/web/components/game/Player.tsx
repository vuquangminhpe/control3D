"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { getEnemyRuntimePosition, useGameStore } from "@/store/gameStore";
import { ModelLoader } from "@/components/3d/ModelLoader";

const BOW_MIN_SPEED = 18;
const BOW_MAX_SPEED = 46;
const BOW_MAX_CHARGE_MS = 1250;
const BOW_GRAVITY = -19.8;
const BOW_TRAJECTORY_STEPS = 28;
const BOW_TRAJECTORY_STEP_SECONDS = 0.075;

function CustomPlayerVisual({ src }: { src: string }) {
  return (
    <group position={[0, -1.5, 0]}>
      <Suspense fallback={null}>
        <ModelLoader fitHeight={1.85} groundToY={0} src={src} />
      </Suspense>
    </group>
  );
}

function buildBowTrajectory(origin: THREE.Vector3, velocity: THREE.Vector3): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i < BOW_TRAJECTORY_STEPS; i += 1) {
    const t = i * BOW_TRAJECTORY_STEP_SECONDS;
    points.push([
      Number((origin.x + velocity.x * t).toFixed(3)),
      Number((origin.y + velocity.y * t + 0.5 * BOW_GRAVITY * t * t).toFixed(3)),
      Number((origin.z + velocity.z * t).toFixed(3)),
    ]);
  }
  return points;
}

export function Player() {
  const rigidBodyRef = useRef<any>(null);
  const playerNodeRef = useRef<THREE.Group>(null);
  const initialPlayerPositionRef = useRef<[number, number, number]>([...useGameStore.getState().playerPosition]);
  const { camera } = useThree();

  // Zustand state and actions
  const playerHp = useGameStore((state) => state.playerHp);
  const updatePlayerPosition = useGameStore((state) => state.updatePlayerPosition);
  const updatePlayerVelocity = useGameStore((state) => state.updatePlayerVelocity);
  const triggerAttackStart = useGameStore((state) => state.triggerAttackStart);
  const triggerAttackEnd = useGameStore((state) => state.triggerAttackEnd);
  const hitEnemy = useGameStore((state) => state.hitEnemy);
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);
  const setBowAim = useGameStore((state) => state.setBowAim);
  const clearBowAim = useGameStore((state) => state.clearBowAim);
  const spawnArrow = useGameStore((state) => state.spawnArrow);
  const playerCharacter = useGameStore((state) => state.activeLevel.playerCharacter);

  // Local movement states
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, Shift: false });
  const [actionState, setActionState] = useState<string>("idle");
  const [comboStep, setComboStep] = useState<number>(0); // 0 = idle, 1 = attack, 2 = slash, 3 = kick
  const blockActiveRef = useRef<boolean>(false);
  const hasHitThisSwing = useRef<boolean>(false);
  const attackRecoveryTimeoutRef = useRef<number | null>(null);
  const attackDeadlineRef = useRef<number>(0);
  const isAttackingRef = useRef<boolean>(false);
  const hitRecoveryTimeoutRef = useRef<number | null>(null);
  const combatProfileRef = useRef<{ damage: number; critChance: number }>({ damage: 15, critChance: 0.2 });
  const groundedContactsRef = useRef(0);
  const jumpActiveRef = useRef(false);
  const lastSyncedPositionRef = useRef<[number, number, number]>(initialPlayerPositionRef.current);
  const lastSyncedVelocityRef = useRef<[number, number, number]>([0, 0, 0]);
  const previousHpRef = useRef(playerHp);
  const playerPositionVecRef = useRef(new THREE.Vector3());
  const enemyPositionVecRef = useRef(new THREE.Vector3());
  const toEnemyVecRef = useRef(new THREE.Vector3());
  const attackQuaternionRef = useRef(new THREE.Quaternion());
  const cameraForwardRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const weaponForwardRef = useRef(new THREE.Vector3());
  const bowOriginRef = useRef(new THREE.Vector3());
  const bowDirectionRef = useRef(new THREE.Vector3());
  const bowVelocityRef = useRef(new THREE.Vector3());
  const bowFlatDirectionRef = useRef(new THREE.Vector3());
  const bowTargetQuaternionRef = useRef(new THREE.Quaternion());
  const yAxisRef = useRef(new THREE.Vector3(0, 1, 0));
  const bowAimingRef = useRef(false);
  const bowChargeStartMsRef = useRef(0);
  const bowReleaseUntilMsRef = useRef(0);
  const bowReleaseTimeoutRef = useRef<number | null>(null);
  const previousBowFireHeldRef = useRef(false);

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

  const clearBowReleaseTimeout = useCallback(() => {
    if (bowReleaseTimeoutRef.current !== null) {
      window.clearTimeout(bowReleaseTimeoutRef.current);
      bowReleaseTimeoutRef.current = null;
    }
  }, []);

  const finishAttackAnimation = useCallback(() => {
    clearAttackRecoveryTimeout();
    attackDeadlineRef.current = 0;
    isAttackingRef.current = false;
    hasHitThisSwing.current = false;
    triggerAttackEnd();
    setActionState("idle");
    window.setTimeout(() => {
      setComboStep(0);
    }, 800);
  }, [clearAttackRecoveryTimeout, triggerAttackEnd]);

  const beginAttack = useCallback((
    action: string,
    combo: number,
    profile: { damage: number; critChance: number },
    recoveryMs: number
  ) => {
    clearAttackRecoveryTimeout();
    hasHitThisSwing.current = false;
    combatProfileRef.current = profile;
    attackDeadlineRef.current = window.performance.now() + recoveryMs + 250;
    isAttackingRef.current = true;
    setComboStep(combo);
    setActionState(action);
    triggerAttackStart(combo);
    attackRecoveryTimeoutRef.current = window.setTimeout(() => {
      finishAttackAnimation();
    }, recoveryMs);
  }, [clearAttackRecoveryTimeout, finishAttackAnimation, triggerAttackStart]);

  const handleJump = useCallback(() => {
    if (!rigidBodyRef.current || jumpActiveRef.current || groundedContactsRef.current <= 0 || bowAimingRef.current) {
      return;
    }

    const body = rigidBodyRef.current;
    const currentVel = body.linvel();
    jumpActiveRef.current = true;
    setActionState("jump");
    body.setLinvel({ x: currentVel.x, y: 6.8, z: currentVel.z }, true);
  }, []);

  const startBowAim = useCallback(() => {
    const gameState = useGameStore.getState();
    if (gameState.selectedWeapon !== "bow" || isAttackingRef.current || bowAimingRef.current) return false;

    clearAttackRecoveryTimeout();
    clearBowReleaseTimeout();
    bowAimingRef.current = true;
    bowChargeStartMsRef.current = window.performance.now();
    bowReleaseUntilMsRef.current = 0;
    hasHitThisSwing.current = false;
    triggerAttackEnd();
    setComboStep(0);
    setActionState("block");
    return true;
  }, [clearAttackRecoveryTimeout, clearBowReleaseTimeout, triggerAttackEnd]);

  const shootBow = useCallback(() => {
    if (!bowAimingRef.current) return;

    const gameState = useGameStore.getState();
    const aim = gameState.bowAim;
    const bowLoadout = gameState.weaponLoadouts.bow;
    const charge = Math.max(0.08, aim.charge);
    const damage = Math.max(1, Math.round((16 + 42 * charge) * bowLoadout.hitbox.damageMultiplier));

    bowAimingRef.current = false;
    clearBowAim();

    if (gameState.selectedWeapon === "bow" && aim.isAiming) {
      spawnArrow({
        position: aim.origin,
        velocity: aim.velocity,
        damage,
        power: charge,
      });
      bowReleaseUntilMsRef.current = window.performance.now() + 260;
      setActionState("attack");
      bowReleaseTimeoutRef.current = window.setTimeout(() => {
        bowReleaseUntilMsRef.current = 0;
        if (!isAttackingRef.current && !blockActiveRef.current && !jumpActiveRef.current) {
          setActionState("idle");
        }
      }, 260);
    }
  }, [clearBowAim, spawnArrow]);

  const cancelBowAim = useCallback(() => {
    if (!bowAimingRef.current) return;
    bowAimingRef.current = false;
    clearBowAim();
    if (!isAttackingRef.current && !jumpActiveRef.current) {
      setActionState("idle");
    }
  }, [clearBowAim]);

  useEffect(() => {
    if (playerHp < previousHpRef.current && playerHp > 0 && !isAttackingRef.current && !jumpActiveRef.current) {
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
  }, [clearHitRecoveryTimeout, playerHp]);

  // Handle attacks (Combo system)
  const handleAttack = useCallback((mode: "light" | "heavy" | "alt") => {
    if (isAttackingRef.current) return;
    const gameState = useGameStore.getState();
    const selectedWeapon = gameState.selectedWeapon;
    const weaponHitbox = gameState.weaponLoadouts[selectedWeapon].hitbox;
    const damageMultiplier = weaponHitbox.damageMultiplier;

    if (mode === "heavy") {
      const baseHeavyDamage = selectedWeapon === "greatsword" ? 55 : selectedWeapon === "bow" ? 28 : 35;
      const heavyDamage = Math.max(1, Math.round(baseHeavyDamage * damageMultiplier));
      beginAttack("kick", 3, { damage: heavyDamage, critChance: 0.4 }, 1100);
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
      const recoveryDelay =
        selectedAttack.action === "kick" ? 1100 :
        selectedAttack.action === "attackAlt3" ? 1050 :
        selectedAttack.action === "attackAlt2" ? 980 :
        selectedAttack.action === "attackAlt1" ? 900 :
        selectedAttack.action === "slash" ? 900 :
        850;

      const weaponBonus = selectedWeapon === "greatsword" ? 14 : selectedWeapon === "bow" ? 6 : 0;
      beginAttack(
        selectedAttack.action,
        selectedAttack.combo,
        { damage: Math.max(1, Math.round((selectedAttack.damage + weaponBonus) * damageMultiplier)), critChance: selectedAttack.critChance },
        recoveryDelay
      );
      return;
    }

    let nextStep = 1;
    const lightDamage = Math.max(1, Math.round((selectedWeapon === "greatsword" ? 26 : selectedWeapon === "bow" ? 18 : 15) * damageMultiplier));
    const slashDamage = Math.max(1, Math.round((selectedWeapon === "greatsword" ? 36 : selectedWeapon === "bow" ? 24 : 22) * damageMultiplier));
    if (comboStep === 1) {
      nextStep = 2;
      beginAttack("slash", nextStep, { damage: slashDamage, critChance: 0.24 }, 900);
    } else {
      nextStep = 1;
      beginAttack("attack", nextStep, { damage: lightDamage, critChance: 0.2 }, 850);
    }
  }, [beginAttack, comboStep]);

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

      if (key === "j" && !isAttackingRef.current) {
        handleAttack("light");
      }
      if (key === "k" && !isAttackingRef.current) {
        handleAttack("heavy");
      }
      if (e.code === "Space" && !isAttackingRef.current) {
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
      if (e.button !== 2 || isAttackingRef.current) return;
      e.preventDefault();
      if (startBowAim()) return;
      handleAttack("alt");
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      shootBow();
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeDialogueNpcId, handleAttack, handleJump, playerHp, shootBow, startBowAim]);

  useEffect(() => {
    return () => {
      clearAttackRecoveryTimeout();
      clearHitRecoveryTimeout();
      clearBowReleaseTimeout();
      clearBowAim();
    };
  }, [clearAttackRecoveryTimeout, clearBowAim, clearBowReleaseTimeout, clearHitRecoveryTimeout]);

  // Combat collision check (checks on active frame window)
  const checkCombatCollisions = (playerPos: THREE.Vector3) => {
    if (hasHitThisSwing.current || !playerNodeRef.current) return;

    const gameState = useGameStore.getState();
    const selectedWeapon = gameState.selectedWeapon;
    const weaponHitbox = gameState.weaponLoadouts[selectedWeapon].hitbox;
    const enemies = gameState.enemies;
    const weaponForward = weaponForwardRef.current
      .set(0, 0, 1)
      .applyQuaternion(playerNodeRef.current.quaternion)
      .setY(0)
      .normalize();
    const minFacingDot = Math.cos(THREE.MathUtils.degToRad(weaponHitbox.arcDegrees) / 2);
    let closestHit:
      | {
          enemyId: string;
          position: [number, number, number];
          distance: number;
        }
      | null = null;

    for (const enemy of enemies) {
      if (enemy.isDead) continue;

      const runtimePos = getEnemyRuntimePosition(enemy.id) ?? enemy.position;
      const enemyPos = enemyPositionVecRef.current.fromArray(runtimePos);
      const toEnemy = toEnemyVecRef.current.copy(enemyPos).sub(playerPos);
      toEnemy.y = 0;
      const distance = toEnemy.length();
      const directionToEnemy = distance > 0 ? toEnemy.clone().normalize() : toEnemy;
      const isInsideArc = weaponForward.dot(directionToEnemy) >= minFacingDot;
      const targetRadius = enemy.type === "zombie_fantasy" ? 1.35 : 0.75;
      const hitDistance = weaponHitbox.reach + weaponHitbox.radius + targetRadius;

      if (isInsideArc && distance <= hitDistance && (!closestHit || distance < closestHit.distance)) {
        closestHit = {
          enemyId: enemy.id,
          position: runtimePos,
          distance,
        };
      }
    }

    if (!closestHit) return;

    hasHitThisSwing.current = true;

    const { damage, critChance } = combatProfileRef.current;
    const isCrit = Math.random() < critChance;
    const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;

    const floatPos: [number, number, number] = [
      closestHit.position[0] + (Math.random() - 0.5) * 0.5,
      closestHit.position[1] + 1.2,
      closestHit.position[2] + (Math.random() - 0.5) * 0.5,
    ];
    hitEnemy(closestHit.enemyId, finalDamage, isCrit, floatPos);
  };

  useFrame((state, delta) => {
    if (!rigidBodyRef.current || !playerNodeRef.current) return;

    const body = rigidBodyRef.current;
    const playerPos = body.translation();
    const playerVec3 = playerPositionVecRef.current.set(playerPos.x, playerPos.y, playerPos.z);
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
        cancelBowAim();
        finishAttackAnimation();
        setActionState("death");
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    if (activeDialogueNpcId) {
      cancelBowAim();
      if (isAttackingRef.current) {
        finishAttackAnimation();
      }
      if (actionState !== "idle") {
        setActionState("idle");
      }
      body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      return;
    }

    const frameGameState = useGameStore.getState();
    const bowFireHeld = frameGameState.selectedWeapon === "bow" && frameGameState.bowFireHeld;
    if (bowFireHeld && !previousBowFireHeldRef.current && !bowAimingRef.current && !isAttackingRef.current) {
      startBowAim();
    }
    if (!bowFireHeld && previousBowFireHeldRef.current && bowAimingRef.current) {
      shootBow();
    }
    previousBowFireHeldRef.current = bowFireHeld;

    if (bowAimingRef.current) {
      const gameState = useGameStore.getState();
      if (gameState.selectedWeapon !== "bow") {
        cancelBowAim();
      } else {
        const charge = THREE.MathUtils.clamp(
          (window.performance.now() - bowChargeStartMsRef.current) / BOW_MAX_CHARGE_MS,
          0,
          1,
        );
        const speed = THREE.MathUtils.lerp(BOW_MIN_SPEED, BOW_MAX_SPEED, charge);
        const bowDirection = bowDirectionRef.current;
        camera.getWorldDirection(bowDirection).normalize();
        const bowOrigin = bowOriginRef.current
          .copy(playerVec3)
          .addScaledVector(bowDirection, 0.9);
        bowOrigin.y += 1.55;
        const bowVelocity = bowVelocityRef.current.copy(bowDirection).multiplyScalar(speed);
        const flatDirection = bowFlatDirectionRef.current.copy(bowDirection).setY(0);

        if (flatDirection.lengthSq() > 0.001) {
          flatDirection.normalize();
          const angle = Math.atan2(flatDirection.x, flatDirection.z);
          const targetRotation = bowTargetQuaternionRef.current.setFromAxisAngle(yAxisRef.current, angle);
          playerNodeRef.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
        }

        setBowAim({
          isAiming: true,
          charge,
          origin: [bowOrigin.x, bowOrigin.y, bowOrigin.z],
          velocity: [bowVelocity.x, bowVelocity.y, bowVelocity.z],
          trajectory: buildBowTrajectory(bowOrigin, bowVelocity),
        });

        if (actionState !== "block") {
          setActionState("block");
        }
        body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
        return;
      }
    }

    if (bowReleaseUntilMsRef.current > window.performance.now()) {
      body.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
      return;
    }

    // 1. Combat check (if currently in attack animation state)
    if (isAttackingRef.current) {
      if (attackDeadlineRef.current > 0 && window.performance.now() > attackDeadlineRef.current) {
        finishAttackAnimation();
        return;
      }

      checkCombatCollisions(playerVec3);
      
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
      const cameraForward = cameraForwardRef.current;
      camera.getWorldDirection(cameraForward);
      cameraForward.y = 0;
      cameraForward.normalize();

      const cameraRight = cameraRightRef.current.crossVectors(cameraForward, yAxisRef.current).normalize();
      const moveDir = cameraForward.multiplyScalar(moveZ).add(cameraRight.multiplyScalar(moveX)).normalize();
      
      targetX = moveDir.x * speed;
      targetZ = moveDir.z * speed;
      
      // Face the direction of keyboard movement
      const angle = Math.atan2(moveDir.x, moveDir.z);
      const targetRotation = attackQuaternionRef.current.setFromAxisAngle(yAxisRef.current, angle);
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
        {playerCharacter?.fileUrl ? <CustomPlayerVisual src={playerCharacter.fileUrl} /> : null}
      </group>
    </RigidBody>
  );
}
