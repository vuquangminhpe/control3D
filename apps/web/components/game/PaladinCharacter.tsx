"use client";

import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { stabilizeClipRootMotion } from "./animationUtils";

type PaladinCharacterProps = {
  currentAction: string;
  onAnimationFinished?: (actionName: string) => void;
};

export function PaladinCharacter({
  currentAction,
  onAnimationFinished,
}: PaladinCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const onAnimationFinishedRef = useRef(onAnimationFinished);
  const activeActionNameRef = useRef<string>("idle");

  // 1. Load Main Model
  const originalModel = useFBX("/models/ProS/Paladin J Nordstrom.fbx");

  // Clone model to allow clean independent instancing and skeleton binding
  const model = useMemo(() => {
    const cloned = SkeletonUtils.clone(originalModel) as THREE.Group;
    cloned.scale.setScalar(0.015); // Scale down from FBX unit size (usually cm)
    
    // Traversal to enable shadow casting and setup glowing/metallic materials
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Enhance default material of character
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.4;
              mat.metalness = 0.75;
            }
          });
        }
      }
    });

    return cloned;
  }, [originalModel]);

  // 2. Load Animations
  const animFBXs = {
    idle: useFBX("/models/ProS/sword and shield idle.fbx"),
    walk: useFBX("/models/ProS/sword and shield walk.fbx"),
    run: useFBX("/models/ProS/sword and shield run.fbx"),
    jump: useFBX("/models/ProS/sword and shield jump.fbx"),
    hit: useFBX("/models/ProS/sword and shield impact.fbx"),
    attack: useFBX("/models/ProS/sword and shield attack.fbx"),
    attackAlt1: useFBX("/models/ProS/sword and shield attack (2).fbx"),
    attackAlt2: useFBX("/models/ProS/sword and shield attack (3).fbx"),
    attackAlt3: useFBX("/models/ProS/sword and shield slash (2).fbx"),
    slash: useFBX("/models/ProS/sword and shield slash.fbx"),
    kick: useFBX("/models/ProS/sword and shield kick.fbx"),
    block: useFBX("/models/ProS/sword and shield block.fbx"),
    death: useFBX("/models/ProS/sword and shield death.fbx"),
  };

  useEffect(() => {
    onAnimationFinishedRef.current = onAnimationFinished;
  }, [onAnimationFinished]);

  // 3. Attach Neon Sword and Glassmorphic Shield to bones
  useEffect(() => {
    let rightHand: THREE.Object3D | null = null;
    let leftHand: THREE.Object3D | null = null;

    model.traverse((child) => {
      if (child instanceof THREE.Bone) {
        const name = child.name.toLowerCase();
        if (name.includes("righthand")) {
          rightHand = child;
        } else if (name.includes("lefthand")) {
          leftHand = child;
        }
      }
    });

    // Clean up old weapons first
    if (rightHand) {
      const oldWeapons = (rightHand as THREE.Object3D).children.filter(
        (c) => c.name === "glowing-sword"
      );
      oldWeapons.forEach((w) => (rightHand as THREE.Object3D).remove(w));
    }
    if (leftHand) {
      const oldShields = (leftHand as THREE.Object3D).children.filter(
        (c) => c.name === "energy-shield"
      );
      oldShields.forEach((s) => (leftHand as THREE.Object3D).remove(s));
    }

    // Attach Glowing Neon Sword
    if (rightHand) {
      const swordGroup = new THREE.Group();
      swordGroup.name = "glowing-sword";
      
      // Hilt / Guard
      const hiltGeom = new THREE.CylinderGeometry(0.8, 0.8, 12, 8);
      const hiltMat = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.8 });
      const hilt = new THREE.Mesh(hiltGeom, hiltMat);
      hilt.rotation.x = Math.PI / 2;
      swordGroup.add(hilt);

      const guardGeom = new THREE.BoxGeometry(10, 2, 2);
      const guard = new THREE.Mesh(guardGeom, hiltMat);
      guard.position.y = 5;
      swordGroup.add(guard);

      // Neon Blade
      const bladeGeom = new THREE.BoxGeometry(2, 60, 0.5);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: "#00aaff",
        emissive: "#0055ff",
        emissiveIntensity: 6,
        roughness: 0.1,
        metalness: 0.9,
      });
      const blade = new THREE.Mesh(bladeGeom, bladeMat);
      blade.position.y = 35;
      swordGroup.add(blade);

      // Align sword to hand bone orientation
      swordGroup.rotation.x = -Math.PI / 2;
      swordGroup.rotation.y = 0;
      swordGroup.rotation.z = Math.PI / 2;
      swordGroup.position.set(0, 0, 0);

      (rightHand as THREE.Object3D).add(swordGroup);
    }

    // Attach Glassmorphic / Energy Shield
    if (leftHand) {
      const shieldGroup = new THREE.Group();
      shieldGroup.name = "energy-shield";

      // Shield Plate (Glassmorphism + Neon outline)
      const plateGeom = new THREE.CylinderGeometry(20, 20, 2, 6, 1, false, 0, Math.PI * 2);
      const plateMat = new THREE.MeshStandardMaterial({
        color: "#00ffd5",
        emissive: "#004433",
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.65,
        roughness: 0.05,
        metalness: 0.95,
        side: THREE.DoubleSide,
      });
      const plate = new THREE.Mesh(plateGeom, plateMat);
      plate.rotation.x = Math.PI / 2;
      shieldGroup.add(plate);

      // Inner metallic core
      const coreGeom = new THREE.CylinderGeometry(6, 6, 3, 6);
      const coreMat = new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.9, roughness: 0.2 });
      const core = new THREE.Mesh(coreGeom, coreMat);
      core.rotation.x = Math.PI / 2;
      shieldGroup.add(core);

      // Positioning shield on forearm/hand
      shieldGroup.position.set(0, 5, 0);
      shieldGroup.rotation.y = Math.PI / 2;
      shieldGroup.rotation.x = Math.PI / 6;

      (leftHand as THREE.Object3D).add(shieldGroup);
    }
  }, [model]);

  // 4. Initialize Mixer and Map Animations
  useEffect(() => {
    if (!groupRef.current) return;

    const mixer = new THREE.AnimationMixer(model);
    mixerRef.current = mixer;
    activeActionNameRef.current = "idle";

    const actions: Record<string, THREE.AnimationAction> = {};

    // Map animation clips from each loaded FBX file
    Object.entries(animFBXs).forEach(([name, fbx]) => {
      if (fbx.animations && fbx.animations.length > 0) {
        const clip = stabilizeClipRootMotion(fbx.animations[0].clone());
        clip.name = name;
        
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.timeScale = 1;
        action.setEffectiveWeight(1);
        
        // Loop modes & restrictions
        if (["jump", "hit", "attack", "attackAlt1", "attackAlt2", "attackAlt3", "slash", "kick", "death"].includes(name)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        
        actions[name] = action;
      }
    });

    actionsRef.current = actions;

    // Start with Idle action
    if (actions.idle) {
      actions.idle.play();
    }

    // Animation completion event listener
    const onFinished = (e: any) => {
      const actionName = e.action.getClip().name;
      onAnimationFinishedRef.current?.(actionName);
    };
    mixer.addEventListener("finished", onFinished);

    return () => {
      mixer.removeEventListener("finished", onFinished);
      mixer.stopAllAction();
      actionsRef.current = {};
      mixerRef.current = null;
    };
  }, [model]);

  // 5. Action transitions / crossfading state machine
  useEffect(() => {
    const actions = actionsRef.current;
    const prevActionName = activeActionNameRef.current;
    const nextActionName = actions[currentAction] ? currentAction : "idle";

    if (prevActionName === nextActionName) return;

    const prevAction = actions[prevActionName];
    const nextAction = actions[nextActionName];

    if (nextAction) {
      nextAction.reset();
      nextAction.enabled = true;
      nextAction.timeScale = 1;
      nextAction.setEffectiveWeight(1);
      
      // Customize fade durations based on states
      let fadeDuration = 0.25;
      if (["jump", "hit", "attack", "attackAlt1", "attackAlt2", "attackAlt3", "slash", "kick"].includes(nextActionName)) {
        fadeDuration = 0.1; // Fast transition for attacks
      }
      
      if (prevAction) {
        nextAction.crossFadeFrom(prevAction, fadeDuration, true);
        prevAction.fadeOut(fadeDuration);
      }
      
      nextAction.play();
      activeActionNameRef.current = nextActionName;
    }
  }, [currentAction]);

  // 6. Update mixer on frame ticks
  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

// Preload assets for fast load times
useFBX.preload("/models/ProS/Paladin J Nordstrom.fbx");
useFBX.preload("/models/ProS/sword and shield idle.fbx");
useFBX.preload("/models/ProS/sword and shield walk.fbx");
useFBX.preload("/models/ProS/sword and shield run.fbx");
useFBX.preload("/models/ProS/sword and shield jump.fbx");
useFBX.preload("/models/ProS/sword and shield impact.fbx");
useFBX.preload("/models/ProS/sword and shield attack.fbx");
useFBX.preload("/models/ProS/sword and shield attack (2).fbx");
useFBX.preload("/models/ProS/sword and shield attack (3).fbx");
useFBX.preload("/models/ProS/sword and shield slash (2).fbx");
useFBX.preload("/models/ProS/sword and shield slash.fbx");
useFBX.preload("/models/ProS/sword and shield kick.fbx");
useFBX.preload("/models/ProS/sword and shield block.fbx");
useFBX.preload("/models/ProS/sword and shield death.fbx");
