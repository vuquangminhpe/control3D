"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";

export function PatrolRobot() {
  const rigidBodyRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  // Zustand state and actions
  const robotPosition = useGameStore((state) => state.robotPosition);
  const playerPosition = useGameStore((state) => state.playerPosition);
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);
  const startDialogue = useGameStore((state) => state.startDialogue);
  
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const patrolStart = useRef<number>(-12);
  const patrolEnd = useRef<number>(5);
  const direction = useRef<number>(1); // 1 = forward, -1 = backward
  const isInteracting = activeDialogueNpcId === "robot_NPC";

  // 1. Load Robot GLB
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const { scene, animations } = useGLTF("/models/robot_tuan_tra_NPC.glb", dracoPath);

  // Clone scene
  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    cloned.scale.setScalar(0.012); // robot model is usually exported in large scale units
    return cloned;
  }, [scene]);

  // 2. Play animations
  const { ref: animRef, actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    // Play the patrol animation if available
    const walkAnim = actions[animations[0]?.name];
    if (walkAnim) {
      walkAnim.reset().play();
    }
    return () => {
      walkAnim?.stop();
    };
  }, [actions, animations]);

  // 3. Patrol Movement AI
  useFrame((state, delta) => {
    if (!rigidBodyRef.current || !groupRef.current) return;

    const body = rigidBodyRef.current;
    const pos = body.translation();
    const currentZ = pos.z;

    const pPos = new THREE.Vector3(...playerPosition);
    const rPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const distToPlayer = rPos.distanceTo(pPos);

    // Show talk prompt if close to player
    const closeEnough = distToPlayer < 3.5;
    setShowPrompt(closeEnough && !isInteracting);

    // Keyboard 'E' key listener for interaction
    if (closeEnough && !isInteracting) {
      // Look for interaction trigger
      // Note: We also bind this to click in HTML/canvas or keydown E
    }

    if (isInteracting) {
      // Face the player during interaction
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      const toPlayer = pPos.clone().sub(rPos);
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      groupRef.current.rotation.y = angle;
      return;
    }

    // Move back and forth along Z axis
    const speed = 1.8;
    let targetVelZ = direction.current * speed;

    if (direction.current === 1 && currentZ >= patrolEnd.current) {
      direction.current = -1;
    } else if (direction.current === -1 && currentZ <= patrolStart.current) {
      direction.current = 1;
    }

    body.setLinvel({ x: 0, y: body.linvel().y, z: targetVelZ }, true);

    // Rotate to face patrol direction
    const targetAngle = direction.current === 1 ? 0 : Math.PI;
    groupRef.current.rotation.y = targetAngle;
  });

  // Handle keydown 'E' for interaction
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e" && showPrompt) {
        startDialogue("robot_NPC");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPrompt, startDialogue]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders="cuboid"
      position={robotPosition}
      enabledRotations={[false, false, false]}
      type="kinematicVelocity"
    >
      {showPrompt && (
        <Html position={[0, 2.5, 0]} center distanceFactor={8}>
          <div className="npc-prompt">
            <div className="key-cap">E</div>
            <span>Talk to Robot</span>
          </div>
        </Html>
      )}

      <group ref={groupRef} onClick={() => showPrompt && startDialogue("robot_NPC")}>
        <primitive object={clonedScene} ref={animRef} />
      </group>
    </RigidBody>
  );
}

// Preload the GLB
useGLTF.preload("/models/robot_tuan_tra_NPC.glb", "https://www.gstatic.com/draco/v1/decoders/");
