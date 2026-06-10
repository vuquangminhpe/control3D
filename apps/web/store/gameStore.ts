"use client";

import { create } from "zustand";
import * as THREE from "three";

export type GameStatus = "playing" | "game_over" | "victory";

export type EnemyType = "zombie_low" | "zombie_fantasy";
export type WeaponType = "sword" | "bow" | "greatsword";

export type ZombieSpawn = {
  id: string;
  type: EnemyType;
  position: [number, number, number];
};

export type PlacedObject = {
  id: string;
  modelId: string;
  name: string;
  fileUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type GameLevel = {
  id: string;
  name: string;
  mapModelUrl: string;
  playerSpawn: [number, number, number];
  robotSpawn: [number, number, number];
  robotStory: string;
  zombieSpawns: ZombieSpawn[];
  placedObjects: PlacedObject[];
  createdAt: string;
  updatedAt: string;
};

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

const PLAYER_SPAWN_POSITION: [number, number, number] = [0, 1.5, 5];
const ROBOT_SPAWN_POSITION: [number, number, number] = [-9, 1.2, 12];
const DEFAULT_MAP_MODEL_URL = "/uploads/models/d9d70e25-4e3b-4d34-97be-c56ec50e8a26/delivery.glb";
const CUSTOM_LEVELS_STORAGE_KEY = "control3d.customLevels.v1";

const enemyRuntimePositions = new Map<string, [number, number, number]>();

export function setEnemyRuntimePosition(id: string, pos: [number, number, number]) {
  enemyRuntimePositions.set(id, pos);
}

export function deleteEnemyRuntimePosition(id: string) {
  enemyRuntimePositions.delete(id);
}

export function getEnemyRuntimePosition(id: string) {
  return enemyRuntimePositions.get(id);
}

function getEnemyStats(type: EnemyType) {
  return type === "zombie_fantasy"
    ? { health: 110, maxHealth: 110 }
    : { health: 40, maxHealth: 40 };
}

function createDefaultZombieSpawns(): ZombieSpawn[] {
  return [
    { id: "e1", type: "zombie_low", position: [14, 1.2, -16] },
    { id: "e2", type: "zombie_low", position: [6, 1.2, -24] },
    { id: "e3", type: "zombie_fantasy", position: [-12, 1.2, -18] },
    { id: "e4", type: "zombie_fantasy", position: [-4, 1.2, -30] },
    { id: "e5", type: "zombie_low", position: [18, 1.2, -28] },
    { id: "e6", type: "zombie_low", position: [10, 1.2, -36] },
    { id: "e7", type: "zombie_low", position: [-18, 1.2, -28] },
    { id: "e8", type: "zombie_low", position: [-10, 1.2, -38] },
    { id: "e9", type: "zombie_fantasy", position: [20, 1.2, -42] },
    { id: "e10", type: "zombie_fantasy", position: [-22, 1.2, -44] },
    { id: "e11", type: "zombie_low", position: [0, 1.2, -46] },
    { id: "e12", type: "zombie_low", position: [8, 1.2, -52] },
  ];
}

const DEFAULT_LEVEL: GameLevel = {
  id: "default-sector",
  name: "Default Sector",
  mapModelUrl: DEFAULT_MAP_MODEL_URL,
  playerSpawn: PLAYER_SPAWN_POSITION,
  robotSpawn: ROBOT_SPAWN_POSITION,
  robotStory: "I can sell field gear based on your score. Clear threats, earn score, then come back for a bow or stronger blade.",
  zombieSpawns: createDefaultZombieSpawns(),
  placedObjects: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function createEnemiesFromLevel(level: GameLevel): EnemyState[] {
  const enemies = level.zombieSpawns.map((spawn, index) => {
    const stats = getEnemyStats(spawn.type);
    return {
      id: spawn.id || `e${index + 1}`,
      type: spawn.type,
      position: [...spawn.position] as [number, number, number],
      health: stats.health,
      maxHealth: stats.maxHealth,
      isDead: false,
      actionState: "idle",
    };
  });

  enemyRuntimePositions.clear();
  enemies.forEach((enemy) => {
    enemyRuntimePositions.set(enemy.id, [...enemy.position]);
  });

  return enemies;
}

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
  worldVersion: number;
  enemySpawnVersion: number;
  selectedWeapon: WeaponType;
  ownedWeapons: WeaponType[];

  // Enemies / NPCs
  enemies: EnemyState[];
  robotPosition: [number, number, number];
  activeLevel: GameLevel;
  savedLevels: GameLevel[];
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
  purchaseItem: (item: WeaponType) => boolean;
  equipWeapon: (weapon: WeaponType) => void;
  
  // Enemy Management
  spawnEnemies: () => void;
  updateEnemyPosition: (id: string, pos: [number, number, number]) => void;
  updateEnemyState: (id: string, state: Partial<EnemyState>) => void;
  hitEnemy: (id: string, damage: number, isCritical: boolean, damagePosition?: [number, number, number]) => void;

  // Level builder
  loadSavedLevels: () => Promise<void>;
  setActiveLevel: (levelId: string) => void;
  saveCustomLevel: (level: Omit<GameLevel, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<GameLevel | null>;
  deleteCustomLevel: (levelId: string) => Promise<void>;
  
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
    text: "Hello human. I am PATROL-BOT 9000. This sector is active. I can brief you, trade field gear for score, or let you return to combat.",
    options: [
      { text: "Open gear shop.", nextNodeId: "shop" },
      { text: "What are they exactly?", nextNodeId: "explain" },
      { text: "Sector briefing.", nextNodeId: "accept" },
    ],
  },
  shop: {
    id: "shop",
    text: "Gear is score-gated. Bow enables safer ranged hits. Greatsword raises melee damage. Purchases persist for this run.",
    options: [
      { text: "Buy bow - 200 score", nextNodeId: "buy_bow" },
      { text: "Buy greatsword - 450 score", nextNodeId: "buy_greatsword" },
      { text: "Equip bow", nextNodeId: "equip_bow" },
      { text: "Equip sword", nextNodeId: "equip_sword" },
      { text: "Equip greatsword", nextNodeId: "equip_greatsword" },
      { text: "Back", nextNodeId: "start" },
    ],
  },
  shopResult: {
    id: "shopResult",
    text: "Transaction processed.",
    options: [
      { text: "Back to shop", nextNodeId: "shop" },
      { text: "Exit", nextNodeId: "exit" },
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
    text: "Scanning your bio-signature... You are a high-tech Paladin. Your glowing sword deals massive combo damage (combo x3 triggers a Heavy sweep). Press J to attack, Space to jump, and Shift to Block.",
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
  playerPosition: PLAYER_SPAWN_POSITION,
  playerVelocity: [0, 0, 0],
  playerTargetMove: null,
  isPlayerAttacking: false,
  comboCount: 0,
  worldVersion: 0,
  enemySpawnVersion: 0,
  selectedWeapon: "sword",
  ownedWeapons: ["sword"],

  enemies: [],
  robotPosition: ROBOT_SPAWN_POSITION,
  activeLevel: DEFAULT_LEVEL,
  savedLevels: [],
  activeDialogueNpcId: null,
  dialogueNode: null,
  
  floatingDamages: [],

  startGame: () => {
    set((state) => ({
      status: "playing",
      score: 0,
      level: 1,
      xp: 0,
      nextLevelXp: 100,
      playerHp: 100,
      playerMaxHp: 100,
      playerPosition: [...PLAYER_SPAWN_POSITION],
      playerVelocity: [0, 0, 0],
      playerTargetMove: null,
      isPlayerAttacking: false,
      comboCount: 0,
      robotPosition: [...state.activeLevel.robotSpawn],
      activeDialogueNpcId: null,
      dialogueNode: null,
      floatingDamages: [],
      worldVersion: state.worldVersion + 1,
    }));
    get().spawnEnemies();
  },

  updatePlayerPosition: (pos) => set({ playerPosition: pos }),
  updatePlayerVelocity: (vel) => set({ playerVelocity: vel }),
  setPlayerTargetMove: (target) => set({ playerTargetMove: target }),
  
  damagePlayer: (amount) => {
    const currentPosition = get().playerPosition;
    set((state) => {
      const newHp = Math.max(state.playerHp - amount, 0);
      return {
        playerHp: newHp,
        status: newHp <= 0 ? "game_over" : state.status,
        playerTargetMove: newHp <= 0 ? null : state.playerTargetMove,
        isPlayerAttacking: newHp <= 0 ? false : state.isPlayerAttacking,
        comboCount: newHp <= 0 ? 0 : state.comboCount,
      };
    });
    get().addDamageNumber(amount, [currentPosition[0], currentPosition[1] + 2.2, currentPosition[2]], false);
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

  purchaseItem: (item) => {
    const costs: Record<WeaponType, number> = { sword: 0, bow: 200, greatsword: 450 };
    const state = get();
    if (state.ownedWeapons.includes(item)) {
      set({ selectedWeapon: item });
      return true;
    }
    const cost = costs[item];
    if (state.score < cost) {
      return false;
    }
    set({
      score: state.score - cost,
      ownedWeapons: [...state.ownedWeapons, item],
      selectedWeapon: item,
    });
    return true;
  },

  equipWeapon: (weapon) => {
    if (!get().ownedWeapons.includes(weapon)) return;
    set({ selectedWeapon: weapon });
  },

  spawnEnemies: () => {
    set((state) => ({
      playerPosition: [...state.activeLevel.playerSpawn],
      robotPosition: [...state.activeLevel.robotSpawn],
      enemies: createEnemiesFromLevel(state.activeLevel),
      enemySpawnVersion: state.enemySpawnVersion + 1,
    }));
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

  hitEnemy: (id, damage, isCritical, damagePosition) => {
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
        floatingDamages: damagePosition
          ? [
              ...state.floatingDamages,
              {
                id: Math.random().toString(36).substring(2, 9),
                amount: damage,
                position: damagePosition,
                isCritical,
              },
            ]
          : state.floatingDamages,
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

  loadSavedLevels: async () => {
    if (typeof window === "undefined") return;
    try {
      const response = await fetch("/api/levels", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload?.success && Array.isArray(payload.data)) {
        const savedLevels = payload.data as GameLevel[];
        window.localStorage.setItem(CUSTOM_LEVELS_STORAGE_KEY, JSON.stringify(savedLevels));
        set({ savedLevels });
        return;
      }
    } catch {
      // Fall back to local cache below.
    }

    try {
      const raw = window.localStorage.getItem(CUSTOM_LEVELS_STORAGE_KEY);
      const savedLevels = raw ? (JSON.parse(raw) as GameLevel[]) : [];
      set({ savedLevels });
    } catch {
      set({ savedLevels: [] });
    }
  },

  setActiveLevel: (levelId) => {
    const state = get();
    const activeLevel = levelId === DEFAULT_LEVEL.id
      ? DEFAULT_LEVEL
      : state.savedLevels.find((level) => level.id === levelId) ?? DEFAULT_LEVEL;

    set((current) => ({
      activeLevel,
      playerPosition: [...activeLevel.playerSpawn],
      robotPosition: [...activeLevel.robotSpawn],
      floatingDamages: [],
      worldVersion: current.worldVersion + 1,
    }));
    get().spawnEnemies();
  },

  saveCustomLevel: async (input) => {
    if (typeof window === "undefined") return null;
    const now = new Date().toISOString();
    const fallbackLevel: GameLevel = {
      ...input,
      id: input.id || `level-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: input.id ? get().savedLevels.find((entry) => entry.id === input.id)?.createdAt ?? now : now,
      updatedAt: now,
    };

    try {
      const response = await fetch("/api/levels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json();
      if (response.ok && payload?.success) {
        const level = payload.data as GameLevel;
        const savedLevels = [
          ...get().savedLevels.filter((entry) => entry.id !== level.id),
          level,
        ];
        window.localStorage.setItem(CUSTOM_LEVELS_STORAGE_KEY, JSON.stringify(savedLevels));
        set({ savedLevels });
        return level;
      }
    } catch {
      // Persist locally if API is temporarily unavailable.
    }

    const savedLevels = [
      ...get().savedLevels.filter((entry) => entry.id !== fallbackLevel.id),
      fallbackLevel,
    ];
    window.localStorage.setItem(CUSTOM_LEVELS_STORAGE_KEY, JSON.stringify(savedLevels));
    set({ savedLevels });
    return fallbackLevel;
  },

  deleteCustomLevel: async (levelId) => {
    if (typeof window === "undefined") return;
    try {
      await fetch(`/api/levels/${encodeURIComponent(levelId)}`, { method: "DELETE" });
    } catch {
      // Keep local delete functional if API is temporarily unavailable.
    }
    const savedLevels = get().savedLevels.filter((level) => level.id !== levelId);
    window.localStorage.setItem(CUSTOM_LEVELS_STORAGE_KEY, JSON.stringify(savedLevels));
    set((state) => ({
      savedLevels,
      activeLevel: state.activeLevel.id === levelId ? DEFAULT_LEVEL : state.activeLevel,
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
      dialogueNode: {
        ...robotDialogueTree.start,
        text: `${robotDialogueTree.start.text} ${get().activeLevel.robotStory}`,
      },
      playerTargetMove: null, // Stop player walking when starting dialogue
      isPlayerAttacking: false,
      comboCount: 0,
    });
  },

  chooseDialogueOption: (nextNodeId) => {
    if (nextNodeId === "exit") {
      get().closeDialogue();
      return;
    }
    if (nextNodeId === "buy_bow" || nextNodeId === "buy_greatsword") {
      const item = nextNodeId === "buy_bow" ? "bow" : "greatsword";
      const ok = get().purchaseItem(item);
      set({
        dialogueNode: {
          ...robotDialogueTree.shopResult,
          text: ok ? `${item} purchased and equipped.` : "Not enough score for that item.",
        },
      });
      return;
    }
    if (nextNodeId === "equip_sword" || nextNodeId === "equip_bow" || nextNodeId === "equip_greatsword") {
      const weapon = nextNodeId.replace("equip_", "") as WeaponType;
      const owned = get().ownedWeapons.includes(weapon);
      if (owned) get().equipWeapon(weapon);
      set({
        dialogueNode: {
          ...robotDialogueTree.shopResult,
          text: owned ? `${weapon} equipped.` : `You do not own ${weapon} yet.`,
        },
      });
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
