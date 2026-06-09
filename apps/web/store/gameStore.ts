"use client";

import { create } from "zustand";
import * as THREE from "three";

export type GameStatus = "playing" | "game_over" | "victory";

export type EnemyType = "zombie_low" | "zombie_fantasy";

export type EnemyState = {
  id: string;
  type: EnemyType;
  position: [number, number, number];
  health: number;
  maxHealth: number;
  isDead: boolean;
  actionState: string;
};

export type FloatingDamage = {
  id: string;
  amount: number;
  position: [number, number, number];
  isCritical: boolean;
};

export type DialogOption = {
  text: string;
  nextNodeId: string;
  action?: () => void;
};

export type DialogNode = {
  id: string;
  text: string;
  options: DialogOption[];
};

interface GameState {
  // Game Status
  status: GameStatus;
  score: number;
  level: number;
  xp: number;
  nextLevelXp: number;
  
  // Player Stats
  playerHp: number;
  playerMaxHp: number;
  playerPosition: [number, number, number];
  playerVelocity: [number, number, number];
  playerTargetMove: [number, number, number] | null;
  isPlayerAttacking: boolean;
  comboCount: number;

  // Enemies / NPCs
  enemies: EnemyState[];
  robotPosition: [number, number, number];
  activeDialogueNpcId: string | null;
  dialogueNode: DialogNode | null;

  // Floating Damage Numbers
  floatingDamages: FloatingDamage[];

  // Actions
  startGame: () => void;
  updatePlayerPosition: (pos: [number, number, number]) => void;
  updatePlayerVelocity: (vel: [number, number, number]) => void;
  setPlayerTargetMove: (target: [number, number, number] | null) => void;
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
  gainXp: (amount: number) => void;
  triggerAttackStart: (combo: number) => void;
  triggerAttackEnd: () => void;
  
  // Enemy Management
  spawnEnemies: () => void;
  updateEnemyPosition: (id: string, pos: [number, number, number]) => void;
  updateEnemyState: (id: string, state: Partial<EnemyState>) => void;
  hitEnemy: (id: string, damage: number, isCritical: boolean) => void;
  
  // Floating Damage
  addDamageNumber: (amount: number, pos: [number, number, number], isCritical: boolean) => void;
  removeDamageNumber: (id: string) => void;

  // Dialogue
  startDialogue: (npcId: string) => void;
  chooseDialogueOption: (nextNodeId: string) => void;
  closeDialogue: () => void;
}

const robotDialogueTree: Record<string, DialogNode> = {
  start: {
    id: "start",
    text: "Hello human. I am PATROL-BOT 9000. This town has been overrun by infected zombies. Will you help clean it up?",
    options: [
      { text: "Yes, I will defeat them!", nextNodeId: "accept" },
      { text: "What are they exactly?", nextNodeId: "explain" },
      { text: "No, I'm busy.", nextNodeId: "decline" },
    ],
  },
  explain: {
    id: "explain",
    text: "My sensors detect two strains of mutations. Low-poly ones are weak but fast. The fantasy ones are highly armored and hit like trucks! Watch out for their screams.",
    options: [
      { text: "I'm ready to fight them now.", nextNodeId: "accept" },
      { text: "Show me my stats or upgrades.", nextNodeId: "stats" },
    ],
  },
  stats: {
    id: "stats",
    text: "Scanning your bio-signature... You are a high-tech Paladin. Your glowing sword deals massive combo damage (combo x3 triggers a Heavy sweep). Press J/Space to attack, Shift/I to Block.",
    options: [
      { text: "Alright, let's fight!", nextNodeId: "accept" },
    ],
  },
  decline: {
    id: "decline",
    text: "Understood. Safe travels. Don't go near the central quarry without a weapon.",
    options: [
      { text: "Actually, let me help.", nextNodeId: "accept" },
      { text: "Goodbye.", nextNodeId: "exit" },
    ],
  },
  accept: {
    id: "accept",
    text: "Excellent. I have registered 4 active zombie threats in the area. If you defeat them all, you will bring peace back to this sector.",
    options: [
      { text: "Roger that!", nextNodeId: "exit" },
    ],
  },
};

export const useGameStore = create<GameState>((set, get) => ({
  status: "playing",
  score: 0,
  level: 1,
  xp: 0,
  nextLevelXp: 100,
  
  playerHp: 100,
  playerMaxHp: 100,
  playerPosition: [0, 1.5, 5],
  playerVelocity: [0, 0, 0],
  playerTargetMove: null,
  isPlayerAttacking: false,
  comboCount: 0,

  enemies: [],
  robotPosition: [10, 1.2, -5],
  activeDialogueNpcId: null,
  dialogueNode: null,
  
  floatingDamages: [],

  startGame: () => {
    set({
      status: "playing",
      score: 0,
      level: 1,
      xp: 0,
      playerHp: 100,
      playerTargetMove: null,
      isPlayerAttacking: false,
      comboCount: 0,
      floatingDamages: [],
    });
    get().spawnEnemies();
  },

  updatePlayerPosition: (pos) => set({ playerPosition: pos }),
  updatePlayerVelocity: (vel) => set({ playerVelocity: vel }),
  setPlayerTargetMove: (target) => set({ playerTargetMove: target }),
  
  damagePlayer: (amount) => {
    set((state) => {
      const newHp = Math.max(state.playerHp - amount, 0);
      return {
        playerHp: newHp,
        status: newHp <= 0 ? "game_over" : state.status,
      };
    });
  },

  healPlayer: (amount) => {
    set((state) => ({
      playerHp: Math.min(state.playerHp + amount, state.playerMaxHp),
    }));
  },

  gainXp: (amount) => {
    set((state) => {
      let newXp = state.xp + amount;
      let newLevel = state.level;
      let nextXp = state.nextLevelXp;
      
      if (newXp >= nextXp) {
        newXp -= nextXp;
        newLevel += 1;
        nextXp = Math.floor(nextXp * 1.5);
      }
      
      return {
        xp: newXp,
        level: newLevel,
        nextLevelXp: nextXp,
        playerMaxHp: 100 + (newLevel - 1) * 15,
        playerHp: Math.min(state.playerHp + 25, 100 + (newLevel - 1) * 15), // Heal partly on level up
      };
    });
  },

  triggerAttackStart: (combo) => set({ isPlayerAttacking: true, comboCount: combo }),
  triggerAttackEnd: () => set({ isPlayerAttacking: false }),

  spawnEnemies: () => {
    const initialEnemies: EnemyState[] = [
      // Close to robot
      { id: "e1", type: "zombie_low", position: [15, 1.2, -10], health: 40, maxHealth: 40, isDead: false, actionState: "idle" },
      { id: "e2", type: "zombie_low", position: [5, 1.2, -18], health: 40, maxHealth: 40, isDead: false, actionState: "idle" },
      // Further in the ruins
      { id: "e3", type: "zombie_fantasy", position: [-12, 1.2, -8], health: 100, maxHealth: 100, isDead: false, actionState: "idle" },
      { id: "e4", type: "zombie_fantasy", position: [-5, 1.2, -22], health: 120, maxHealth: 120, isDead: false, actionState: "idle" },
    ];
    set({ enemies: initialEnemies });
  },

  updateEnemyPosition: (id, pos) => {
    set((state) => ({
      enemies: state.enemies.map((e) => (e.id === id ? { ...e, position: pos } : e)),
    }));
  },

  updateEnemyState: (id, updates) => {
    set((state) => ({
      enemies: state.enemies.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  hitEnemy: (id, damage, isCritical) => {
    set((state) => {
      let scoreIncrement = 0;
      let xpIncrement = 0;
      
      const updatedEnemies = state.enemies.map((e) => {
        if (e.id === id) {
          const newHp = Math.max(e.health - damage, 0);
          const isDeadNow = newHp <= 0;
          if (isDeadNow && !e.isDead) {
            scoreIncrement = e.type === "zombie_fantasy" ? 300 : 100;
            xpIncrement = e.type === "zombie_fantasy" ? 50 : 25;
          }
          return { ...e, health: newHp, isDead: isDeadNow, actionState: isDeadNow ? "death" : e.actionState };
        }
        return e;
      });

      // Check for victory
      const allDead = updatedEnemies.every((e) => e.isDead);
      const nextStatus = allDead ? "victory" : state.status;

      // Delayed effect to trigger XP gain
      if (xpIncrement > 0) {
        setTimeout(() => get().gainXp(xpIncrement), 10);
      }

      return {
        enemies: updatedEnemies,
        score: state.score + scoreIncrement,
        status: nextStatus,
      };
    });
  },

  addDamageNumber: (amount, pos, isCritical) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      floatingDamages: [...state.floatingDamages, { id, amount, position: pos, isCritical }],
    }));
  },

  removeDamageNumber: (id) => {
    set((state) => ({
      floatingDamages: state.floatingDamages.filter((fd) => fd.id !== id),
    }));
  },

  startDialogue: (npcId) => {
    set({
      activeDialogueNpcId: npcId,
      dialogueNode: robotDialogueTree.start,
      playerTargetMove: null, // Stop player walking when starting dialogue
    });
  },

  chooseDialogueOption: (nextNodeId) => {
    if (nextNodeId === "exit") {
      get().closeDialogue();
      return;
    }
    const node = robotDialogueTree[nextNodeId];
    if (node) {
      set({ dialogueNode: node });
    } else {
      get().closeDialogue();
    }
  },

  closeDialogue: () => {
    set({ activeDialogueNpcId: null, dialogueNode: null });
  },
}));
