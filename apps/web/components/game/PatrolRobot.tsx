"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Html } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useGameStore } from "@/store/gameStore";
import { stabilizeClipRootMotion, stripPositionTracks } from "./animationUtils";

export function PatrolRobot() {
  const groupRef = useRef<THREE.Group>(null);
  const robotPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(...useGameStore.getState().robotPosition));
  const raycasterRef = useRef(new THREE.Raycaster());
  const downVectorRef = useRef(new THREE.Vector3(0, -1, 0));
  const rayOriginRef = useRef(new THREE.Vector3());
  const terrainMeshesRef = useRef<THREE.Mesh[]>([]);
  const { scene: worldScene } = useThree();
  
  // Zustand state and actions
  const activeDialogueNpcId = useGameStore((state) => state.activeDialogueNpcId);
  const startDialogue = useGameStore((state) => state.startDialogue);
  
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const patrolStart = useRef<number>(-12);
  const patrolEnd = useRef<number>(5);
  const direction = useRef<number>(1); // 1 = forward, -1 = backward
  const isInteracting = activeDialogueNpcId === "robot_NPC";

  useEffect(() => {
    const terrainMeshes: THREE.Mesh[] = [];
    worldScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isTerrainSurface) {
        terrainMeshes.push(child);
      }
    });
    terrainMeshesRef.current = terrainMeshes;
  }, [worldScene]);

  // 1. Load Robot GLB
  const dracoPath = "https://www.gstatic.com/draco/v1/decoders/";
  const { scene, animations } = useGLTF("/models/robot_tuan_tra_NPC.glb", dracoPath);
  const stabilizedAnimations = useMemo(
    () => animations.map((clip) => stripPositionTracks(stabilizeClipRootMotion(clip.clone()))),
    [animations]
  );

  // Clone scene
  const modelScale = 0.55;

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

  // 2. Play animations
  const { actions } = useAnimations(stabilizedAnimations, clonedScene);

  useEffect(() => {
    // Play the patrol animation if available
    const walkAnim = actions[stabilizedAnimations[0]?.name];
    if (walkAnim) {
      walkAnim.reset().play();
    }
    return () => {
      walkAnim?.stop();
    };
  }, [actions, stabilizedAnimations]);

  // 3. Patrol Movement AI
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const playerPosition = useGameStore.getState().playerPosition;
    const robotPos = robotPositionRef.current;
    clonedScene.position.set(0, 0, 0);
    const currentZ = robotPos.z;

    if (terrainMeshesRef.current.length === 0) {
      worldScene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.isTerrainSurface) {
          terrainMeshesRef.current.push(child);
        }
      });
    }

    rayOriginRef.current.set(robotPos.x, 80, robotPos.z);
    raycasterRef.current.set(rayOriginRef.current, downVectorRef.current);
    const groundHit = terrainMeshesRef.current.length > 0
      ? raycasterRef.current.intersectObjects(terrainMeshesRef.current, false)[0]
      : undefined;

    if (groundHit) {
      robotPos.y = groundHit.point.y;
    } else if (robotPos.y === 0) {
      robotPos.y = 1.2;
    }

    const pPos = new THREE.Vector3(...playerPosition);
    const distToPlayer = robotPos.distanceTo(pPos);

    // Show talk prompt if close to player
    const closeEnough = distToPlayer < 3.5;
    setShowPrompt((prev) => {
      const next = closeEnough && !isInteracting;
      return prev === next ? prev : next;
    });

    groupRef.current.position.copy(robotPos);

    if (isInteracting) {
      const toPlayer = pPos.clone().sub(robotPos);
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      groupRef.current.rotation.y = angle;
      return;
    }

    const speed = 1.8;
    if (direction.current === 1 && currentZ >= patrolEnd.current) {
      direction.current = -1;
    } else if (direction.current === -1 && currentZ <= patrolStart.current) {
      direction.current = 1;
    }

    robotPos.z += direction.current * speed * delta;
    groupRef.current.position.copy(robotPos);

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
    <group ref={groupRef} onClick={() => showPrompt && startDialogue("robot_NPC")}>
      <group position={[0, 7, 0]}>
        <mesh>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial color="#ffd400" toneMapped={false} />
        </mesh>
        <mesh position={[0, -2.6, 0]}>
          <cylinderGeometry args={[0.08, 0.18, 5.2, 10]} />
          <meshBasicMaterial color="#ffd400" transparent opacity={0.28} toneMapped={false} />
        </mesh>
        <Html position={[0, 0.45, 0]} center distanceFactor={20}>
          <div style={{ color: "#ffd400", fontWeight: 800, textShadow: "0 0 8px rgba(0,0,0,0.8)" }}>
            ROBOT NPC
          </div>
        </Html>
      </group>

      {showPrompt && (
        <Html position={[0, 2.5, 0]} center distanceFactor={8}>
          <div className="npc-prompt">
            <div className="key-cap">E</div>
            <span>Talk to Robot</span>
          </div>
        </Html>
      )}
      <primitive object={clonedScene} />
    </group>
  );
}

// Preload the GLB
useGLTF.preload("/models/robot_tuan_tra_NPC.glb", "https://www.gstatic.com/draco/v1/decoders/");
