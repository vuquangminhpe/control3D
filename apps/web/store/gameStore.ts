"use client";

import { create } from "zustand";
import * as THREE from "three";

export type GameStatus = "playing" | "game_over" | "victory";

export type EnemyType = "zombie_low" | "zombie_fantasy";
export type WeaponType = "sword" | "bow" | "greatsword";
export type WeaponActionPose = "default" | "idle" | "walk" | "run" | "attack" | "slash" | "kick" | "block";

export type WeaponTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type WeaponHitbox = {
  reach: number;
  radius: number;
  arcDegrees: number;
  damageMultiplier: number;
};

export type WeaponLoadout = {
  modelId?: string;
  name: string;
  fileUrl?: string;
  transform: WeaponTransform;
  actionTransforms: Partial<Record<WeaponActionPose, WeaponTransform>>;
  hitbox: WeaponHitbox;
};

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
  isMap?: boolean;
};

export type StoryVariableType = "string" | "number" | "boolean" | "character";

export type StoryVariable = {
  id: string;
  name: string;
  type: StoryVariableType;
  defaultValue: string | number | boolean;
};

export type StoryNodeKind =
  | "start"
  | "character"
  | "dialogue"
  | "choice"
  | "event"
  | "shop"
  | "condition"
  | "set_variable"
  | "random"
  | "delay"
  | "comment"
  | "bark"
  | "animation";

export type StoryNode = {
  id: string;
  kind: StoryNodeKind;
  title: string;
  text: string;
  modelId?: string | null;
  modelName?: string | null;
  fileUrl?: string | null;
  action?: string | null;
  characterActionId?: string | null;
  characterActionName?: string | null;
  condition?: string | null;
  currencyChange?: number | null;
  position: { x: number; y: number };
  variableId?: string | null;
  variableValue?: string | null;
  variableOperator?: string | null;
  choices?: string[] | null;
  delayDuration?: number | null;
  animationName?: string | null;
  conditionVariableId?: string | null;
  conditionOperator?: string | null;
  conditionValue?: string | null;
};

export type StoryEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  condition?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type StoryGraph = {
  nodes: StoryNode[];
  edges: StoryEdge[];
  variables?: StoryVariable[];
};


export type LevelCharacter = {
  modelId: string;
  name: string;
  fileUrl: string;
  format?: string;
};

export type GameLevel = {
  id: string;
  name: string;
  mapModelUrl: string;
  playerCharacter?: LevelCharacter | null;
  playerSpawn: [number, number, number];
  robotSpawn: [number, number, number];
  robotStory: string;
  storyGraph: StoryGraph;
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

export type BowAimState = {
  isAiming: boolean;
  charge: number;
  origin: [number, number, number];
  velocity: [number, number, number];
  trajectory: [number, number, number][];
};

export type ArrowProjectileState = {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  damage: number;
  power: number;
  createdAt: number;
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
  speakerName?: string;
  speakerSub?: string;
  isDelay?: boolean;
  delayDuration?: number;
  nextNodeId?: string;
};

const PLAYER_SPAWN_POSITION: [number, number, number] = [0, 1.5, 0];
const ROBOT_SPAWN_POSITION: [number, number, number] = [0, 0, 0];
const DEFAULT_MAP_MODEL_URL = "";
const CUSTOM_LEVELS_STORAGE_KEY = "control3d.customLevels.v1";
const WEAPON_LOADOUTS_STORAGE_KEY = "control3d.weaponLoadouts.v1";
const EMPTY_BOW_AIM: BowAimState = {
  isAiming: false,
  charge: 0,
  origin: [0, 0, 0],
  velocity: [0, 0, 0],
  trajectory: [],
};

const EMPTY_STORY_GRAPH: StoryGraph = {
  nodes: [
    {
      id: "story-start",
      kind: "start",
      title: "Start",
      text: "Story begins here.",
      position: { x: 96, y: 160 },
    },
  ],
  edges: [],
  variables: [],
};


export const weaponCatalog: Record<WeaponType, { label: string; cost: number; description: string }> = {
  sword: {
    label: "Sword",
    cost: 0,
    description: "Balanced melee weapon. Good default timing for slash chains.",
  },
  bow: {
    label: "Bow",
    cost: 200,
    description: "Longer hit reach for safer ranged-style combat.",
  },
  greatsword: {
    label: "Greatsword",
    cost: 450,
    description: "Heavy melee weapon with stronger light and heavy hits.",
  },
};

const DEFAULT_WEAPON_LOADOUTS: Record<WeaponType, WeaponLoadout> = {
  sword: {
    name: "Default energy sword",
    transform: {
      position: [0, 0, 0],
      rotation: [-90, 0, 90],
      scale: [1, 1, 1],
    },
    hitbox: {
      reach: 2.65,
      radius: 0.45,
      arcDegrees: 96,
      damageMultiplier: 1,
    },
    actionTransforms: {
      attack: { position: [0, -4, 3], rotation: [-96, 10, 102], scale: [1.04, 1.04, 1.04] },
      slash: { position: [2, -2, 1], rotation: [-92, -18, 86], scale: [1.06, 1.06, 1.06] },
      kick: { position: [0, -3, 2], rotation: [-104, 0, 96], scale: [1.02, 1.02, 1.02] },
      block: { position: [-2, 0, 2], rotation: [-80, 18, 74], scale: [1, 1, 1] },
    },
  },
  bow: {
    name: "Default bow slot",
    transform: {
      position: [0, 2, 0],
      rotation: [-80, 0, 92],
      scale: [1, 1, 1],
    },
    hitbox: {
      reach: 11,
      radius: 0.35,
      arcDegrees: 28,
      damageMultiplier: 0.92,
    },
    actionTransforms: {
      attack: { position: [0, -2, 5], rotation: [-86, 4, 96], scale: [1.03, 1.03, 1.03] },
      slash: { position: [0, -2, 5], rotation: [-86, 4, 96], scale: [1.03, 1.03, 1.03] },
      block: { position: [-3, 1, 1], rotation: [-74, 22, 82], scale: [1, 1, 1] },
    },
  },
  greatsword: {
    name: "Default greatsword slot",
    transform: {
      position: [0, -3, 0],
      rotation: [-90, 0, 90],
      scale: [1.28, 1.28, 1.28],
    },
    hitbox: {
      reach: 3.1,
      radius: 0.72,
      arcDegrees: 112,
      damageMultiplier: 1.18,
    },
    actionTransforms: {
      attack: { position: [0, -7, 4], rotation: [-100, 12, 104], scale: [1.34, 1.34, 1.34] },
      slash: { position: [3, -4, 2], rotation: [-94, -22, 88], scale: [1.36, 1.36, 1.36] },
      kick: { position: [0, -5, 3], rotation: [-108, 0, 100], scale: [1.3, 1.3, 1.3] },
    },
  },
};

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

const DEFAULT_LEVEL: GameLevel = {
  id: "empty-map",
  name: "New Map",
  mapModelUrl: DEFAULT_MAP_MODEL_URL,
  playerCharacter: null,
  playerSpawn: PLAYER_SPAWN_POSITION,
  robotSpawn: ROBOT_SPAWN_POSITION,
  robotStory: "",
  storyGraph: EMPTY_STORY_GRAPH,
  zombieSpawns: [],
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

function normalizeStoryGraph(graph: StoryGraph | undefined | null): StoryGraph {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    return {
      nodes: EMPTY_STORY_GRAPH.nodes.map((node) => ({ ...node, position: { ...node.position } })),
      edges: [],
    };
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      text: node.text ?? "",
      position: {
        x: Number.isFinite(node.position?.x) ? node.position.x : 96,
        y: Number.isFinite(node.position?.y) ? node.position.y : 160,
      },
    })),
    edges: (graph.edges ?? []).filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)),
  };
}

function normalizeLevel(level: GameLevel): GameLevel {
  return {
    ...level,
    storyGraph: normalizeStoryGraph(level.storyGraph),
    zombieSpawns: level.zombieSpawns ?? [],
    placedObjects: level.placedObjects ?? [],
  };
}

function normalizeWeaponLoadouts(input?: Partial<Record<WeaponType, Partial<WeaponLoadout>>>) {
  return (Object.keys(DEFAULT_WEAPON_LOADOUTS) as WeaponType[]).reduce((acc, weapon) => {
    const defaults = DEFAULT_WEAPON_LOADOUTS[weapon];
    const saved = input?.[weapon];
    acc[weapon] = {
      ...defaults,
      ...saved,
      transform: {
        ...defaults.transform,
        ...saved?.transform,
      },
      actionTransforms: {
        ...defaults.actionTransforms,
        ...saved?.actionTransforms,
      },
      hitbox: {
        ...defaults.hitbox,
        ...saved?.hitbox,
      },
    };
    return acc;
  }, {} as Record<WeaponType, WeaponLoadout>);
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
  weaponLoadouts: Record<WeaponType, WeaponLoadout>;
  bowAim: BowAimState;
  bowFireHeld: boolean;
  arrows: ArrowProjectileState[];

  // Enemies / NPCs
  enemies: EnemyState[];
  robotPosition: [number, number, number];
  activeLevel: GameLevel;
  savedLevels: GameLevel[];
  activeDialogueNpcId: string | null;
  dialogueNode: DialogNode | null;
  runtimeVariables: Record<string, string | number | boolean>;
  mapScaleRatio: number;
  activeGameplayActionUrl: string | null;
  activeGameplayActionName: string | null;

  // Floating Damage Numbers
  floatingDamages: FloatingDamage[];

  // Actions
  startGame: () => void;
  setMapScaleRatio: (ratio: number) => void;
  setActiveGameplayAction: (url: string | null, name: string | null) => void;
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
  loadWeaponLoadouts: () => void;
  updateWeaponLoadout: (weapon: WeaponType, loadout: WeaponLoadout) => void;
  setBowAim: (aim: BowAimState) => void;
  clearBowAim: () => void;
  setBowFireHeld: (held: boolean) => void;
  spawnArrow: (arrow: Omit<ArrowProjectileState, "id" | "createdAt">) => void;
  removeArrow: (id: string) => void;
  
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

function runGraphLogic(
  nodeId: string,
  variables: Record<string, any>,
  graph: StoryGraph,
  setVars: (v: Record<string, any>) => void,
  purchaseItem: (item: WeaponType) => boolean,
  equipWeapon: (weapon: WeaponType) => void,
  ownedWeapons: WeaponType[],
  score: number,
  get: () => GameState,
  set: (s: Partial<GameState>) => void
): DialogNode | null {
  let currentNode = graph.nodes.find((n) => n.id === nodeId);
  if (!currentNode) return null;

  // Inject active gameplay variables dynamically
  variables.player_hp = get().playerHp;
  variables.player_score = get().score;
  variables.player_weapon = get().selectedWeapon;
  variables.enemy_count = get().enemies.filter((e) => !e.isDead).length;

  let speakerName = "";
  let speakerSub = "";

  let safetyCounter = 0;
  while (currentNode && safetyCounter < 100) {
    safetyCounter++;

    if (currentNode.kind === "start") {
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "character") {
      speakerName = currentNode.modelName || currentNode.title || "";
      speakerSub = "NPC SPEAKER";
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "comment") {
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "set_variable" && currentNode.variableId) {
      const varName = currentNode.variableId;
      let val: any = currentNode.variableValue ?? "";
      const varDef = graph.variables?.find((v) => v.name === varName);
      if (varDef) {
        if (varDef.type === "number") val = Number(val) || 0;
        if (varDef.type === "boolean") val = val === "true" || val === "1" || val === true;
      }

      const op = currentNode.variableOperator || "set";
      if (op === "add" && typeof val === "number") {
        variables[varName] = (Number(variables[varName]) || 0) + val;
      } else if (op === "sub" && typeof val === "number") {
        variables[varName] = (Number(variables[varName]) || 0) - val;
      } else {
        variables[varName] = val;
      }
      setVars({ ...variables });

      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "condition" && currentNode.conditionVariableId) {
      const val = variables[currentNode.conditionVariableId];
      const op = currentNode.conditionOperator || "==";
      let checkVal: any = currentNode.conditionValue ?? "";
      const varDef = graph.variables?.find((v) => v.name === currentNode!.conditionVariableId);
      if (varDef) {
        if (varDef.type === "number") checkVal = Number(checkVal) || 0;
        if (varDef.type === "boolean") checkVal = checkVal === "true" || checkVal === "1" || checkVal === true;
      }

      let isTrue = false;
      if (op === "==") isTrue = val === checkVal;
      else if (op === "!=") isTrue = val !== checkVal;
      else if (op === ">") isTrue = val > checkVal;
      else if (op === "<") isTrue = val < checkVal;
      else if (op === ">=") isTrue = val >= checkVal;
      else if (op === "<=") isTrue = val <= checkVal;

      const matchHandle = isTrue ? "true" : "false";
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id && e.sourceHandle === matchHandle);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "random") {
      const outlets = graph.edges.filter((e) => e.sourceId === currentNode!.id);
      if (outlets.length > 0) {
        const randIndex = Math.floor(Math.random() * outlets.length);
        currentNode = graph.nodes.find((n) => n.id === outlets[randIndex].targetId);
      } else {
        currentNode = undefined;
      }
      continue;
    }

    if (currentNode.kind === "event" && currentNode.action) {
      const action = currentNode.action;
      if (action === "heal_player") {
        set({ playerHp: get().playerMaxHp });
      } else if (action === "give_score_100") {
        set({ score: get().score + 100 });
      } else if (action === "spawn_zombies") {
        get().spawnEnemies();
      } else if (action === "complete_level") {
        set({ status: "victory" });
      }
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    if (currentNode.kind === "animation") {
      if (currentNode.characterActionId || currentNode.animationName) {
        variables.lastCharacterActionId = currentNode.characterActionId || currentNode.animationName;
        variables.lastCharacterActionName = currentNode.characterActionName || currentNode.animationName || "";
        variables.lastCharacterActionModelId = currentNode.modelId || "";
        setVars({ ...variables });
      }
      const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
      currentNode = edge ? graph.nodes.find((n) => n.id === edge.targetId) : undefined;
      continue;
    }

    break;
  }

  if (!currentNode) return null;

  if (currentNode.kind === "delay") {
    return {
      id: currentNode.id,
      text: `Waiting for ${currentNode.delayDuration || 1} seconds...`,
      options: [],
      speakerName: speakerName || "SYSTEM",
      speakerSub: "TIMED DELAY GATE",
      isDelay: true,
      delayDuration: currentNode.delayDuration || 1,
      nextNodeId: graph.edges.find((e) => e.sourceId === currentNode!.id)?.targetId || "exit",
    };
  }

  let text = currentNode.text || "";

  if (currentNode.kind === "shop") {
    text = text || "Gear Shop: Trade score for weapons.";
    return {
      id: "shop",
      text,
      speakerName: speakerName || "GEAR SHOP",
      speakerSub: "AUTOMATED MERCHANT",
      options: [
        { text: "Buy bow - 200 score", nextNodeId: "buy_bow" },
        { text: "Buy greatsword - 450 score", nextNodeId: "buy_greatsword" },
        { text: "Equip bow", nextNodeId: "equip_bow" },
        { text: "Equip sword", nextNodeId: "equip_sword" },
        { text: "Equip greatsword", nextNodeId: "equip_greatsword" },
        {
          text: "Back",
          nextNodeId: graph.edges.find((e) => e.sourceId === currentNode!.id)?.targetId || "exit",
        },
      ],
    };
  }

  const options: DialogOption[] = [];
  if (currentNode.kind === "choice") {
    const choices = currentNode.choices || ["Next"];
    choices.forEach((choiceText, idx) => {
      const edge = graph.edges.find(
        (e) => e.sourceId === currentNode!.id && e.sourceHandle === `choice-${idx}`
      );
      options.push({
        text: choiceText,
        nextNodeId: edge ? edge.targetId : "exit",
      });
    });
  } else {
    const edge = graph.edges.find((e) => e.sourceId === currentNode!.id);
    if (edge) {
      options.push({
        text: edge.label || "Continue",
        nextNodeId: edge.targetId,
      });
    }
  }

  return {
    id: currentNode.id,
    text,
    options,
    ...(speakerName ? { speakerName, speakerSub } : {}),
  };
}

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
  weaponLoadouts: DEFAULT_WEAPON_LOADOUTS,
  bowAim: EMPTY_BOW_AIM,
  bowFireHeld: false,
  arrows: [],

  enemies: [],
  robotPosition: ROBOT_SPAWN_POSITION,
  activeLevel: DEFAULT_LEVEL,
  savedLevels: [],
  activeDialogueNpcId: null,
  dialogueNode: null,
  runtimeVariables: {},
  mapScaleRatio: 1.0,
  activeGameplayActionUrl: null,
  activeGameplayActionName: null,
  
  floatingDamages: [],

  setMapScaleRatio: (ratio) => set((state) => (
    Math.abs(state.mapScaleRatio - ratio) < 0.001 ? state : { mapScaleRatio: ratio }
  )),

  setActiveGameplayAction: (url, name) => set({
    activeGameplayActionUrl: url,
    activeGameplayActionName: name,
  }),

  startGame: () => {
    set((state) => ({
      status: "playing",
      score: 0,
      level: 1,
      xp: 0,
      nextLevelXp: 100,
      playerHp: 100,
      playerMaxHp: 100,
      playerPosition: [...state.activeLevel.playerSpawn],
      playerVelocity: [0, 0, 0],
      playerTargetMove: null,
      isPlayerAttacking: false,
      comboCount: 0,
      robotPosition: [...state.activeLevel.robotSpawn],
      activeDialogueNpcId: null,
      dialogueNode: null,
      runtimeVariables: {},
      floatingDamages: [],
      bowAim: EMPTY_BOW_AIM,
      bowFireHeld: false,
      arrows: [],
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
    const state = get();
    if (state.ownedWeapons.includes(item)) {
      set({ selectedWeapon: item });
      return true;
    }
    const cost = weaponCatalog[item].cost;
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

  loadWeaponLoadouts: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WEAPON_LOADOUTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<WeaponType, Partial<WeaponLoadout>>>;
      set({
        weaponLoadouts: normalizeWeaponLoadouts(parsed),
      });
    } catch {
      set({ weaponLoadouts: DEFAULT_WEAPON_LOADOUTS });
    }
  },

  updateWeaponLoadout: (weapon, loadout) => {
    set((state) => {
      const weaponLoadouts = {
        ...state.weaponLoadouts,
        [weapon]: loadout,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(WEAPON_LOADOUTS_STORAGE_KEY, JSON.stringify(weaponLoadouts));
      }
      return { weaponLoadouts };
    });
  },

  setBowAim: (aim) => set({ bowAim: aim }),
  clearBowAim: () => set({ bowAim: EMPTY_BOW_AIM }),
  setBowFireHeld: (held) => set({ bowFireHeld: held }),
  spawnArrow: (arrow) => {
    const id = `arrow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      arrows: [
        ...state.arrows,
        {
          ...arrow,
          id,
          createdAt: window.performance.now(),
        },
      ],
    }));
  },
  removeArrow: (id) => {
    set((state) => ({
      arrows: state.arrows.filter((arrow) => arrow.id !== id),
    }));
  },

  spawnEnemies: () => {
    set((state) => ({
      playerPosition: [...state.activeLevel.playerSpawn],
      robotPosition: [...state.activeLevel.robotSpawn],
      enemies: createEnemiesFromLevel(state.activeLevel),
      bowAim: EMPTY_BOW_AIM,
      bowFireHeld: false,
      arrows: [],
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
        const savedLevels = (payload.data as GameLevel[]).map(normalizeLevel);
        window.localStorage.setItem(CUSTOM_LEVELS_STORAGE_KEY, JSON.stringify(savedLevels));
        set({ savedLevels });
        return;
      }
    } catch {
      // Fall back to local cache below.
    }

    try {
      const raw = window.localStorage.getItem(CUSTOM_LEVELS_STORAGE_KEY);
      const savedLevels = raw ? (JSON.parse(raw) as GameLevel[]).map(normalizeLevel) : [];
      set({ savedLevels });
    } catch {
      set({ savedLevels: [] });
    }
  },

  setActiveLevel: (levelId) => {
    const state = get();
    const activeLevel = normalizeLevel(levelId === DEFAULT_LEVEL.id
      ? DEFAULT_LEVEL
      : state.savedLevels.find((level) => level.id === levelId) ?? DEFAULT_LEVEL);

    set((current) => ({
      activeLevel,
      playerPosition: [...activeLevel.playerSpawn],
      robotPosition: [...activeLevel.robotSpawn],
      floatingDamages: [],
      bowAim: EMPTY_BOW_AIM,
      bowFireHeld: false,
      arrows: [],
      worldVersion: current.worldVersion + 1,
    }));
    get().spawnEnemies();
  },

  saveCustomLevel: async (input) => {
    if (typeof window === "undefined") return null;
    const now = new Date().toISOString();
    const fallbackLevel: GameLevel = {
      ...input,
      storyGraph: normalizeStoryGraph(input.storyGraph),
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
        const level = normalizeLevel(payload.data as GameLevel);
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
    const activeLevel = get().activeLevel;
    const graph = activeLevel.storyGraph;
    if (graph && graph.nodes && graph.nodes.length > 1) {
      const startNode = graph.nodes.find((n) => n.kind === "start");
      if (startNode) {
        const edge = graph.edges.find((e) => e.sourceId === startNode.id);
        const firstNodeId = edge ? edge.targetId : "exit";

        const initialVars = { ...get().runtimeVariables };
        if (graph.variables) {
          graph.variables.forEach((v) => {
            if (initialVars[v.name] === undefined) {
              initialVars[v.name] = v.defaultValue;
            }
          });
        }

        const nextDialogue = runGraphLogic(
          firstNodeId,
          initialVars,
          graph,
          (updatedVars) => {
            set({ runtimeVariables: updatedVars });
          },
          get().purchaseItem,
          get().equipWeapon,
          get().ownedWeapons,
          get().score,
          get,
          set
        );

        if (nextDialogue) {
          set({
            activeDialogueNpcId: npcId,
            dialogueNode: nextDialogue,
            playerTargetMove: null,
            isPlayerAttacking: false,
            comboCount: 0,
            runtimeVariables: initialVars,
          });
          return;
        }
      }
    }

    set({
      activeDialogueNpcId: npcId,
      dialogueNode: {
        ...robotDialogueTree.start,
        text: `${robotDialogueTree.start.text} ${get().activeLevel.robotStory}`,
      },
      playerTargetMove: null,
      isPlayerAttacking: false,
      comboCount: 0,
    });
  },

  chooseDialogueOption: (nextNodeId) => {
    if (nextNodeId === "exit") {
      get().closeDialogue();
      return;
    }

    const activeLevel = get().activeLevel;
    const graph = activeLevel.storyGraph;
    if (graph && graph.nodes && graph.nodes.length > 1) {
      if (nextNodeId === "buy_bow" || nextNodeId === "buy_greatsword") {
        const item = nextNodeId === "buy_bow" ? "bow" : "greatsword";
        const ok = get().purchaseItem(item);
        set({
          dialogueNode: {
            id: nextNodeId,
            text: ok ? `${item} purchased and equipped.` : "Not enough score for that item.",
            options: [
              {
                text: "Continue",
                nextNodeId: graph.edges.find((e) => e.sourceId === "shop")?.targetId || "exit",
              }
            ],
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
            id: nextNodeId,
            text: owned ? `${weapon} equipped.` : `You do not own ${weapon} yet.`,
            options: [
              {
                text: "Continue",
                nextNodeId: graph.edges.find((e) => e.sourceId === "shop")?.targetId || "exit",
              }
            ],
          },
        });
        return;
      }

      const nextDialogue = runGraphLogic(
        nextNodeId,
        { ...get().runtimeVariables },
        graph,
        (updatedVars) => {
          set({ runtimeVariables: updatedVars });
        },
        get().purchaseItem,
        get().equipWeapon,
        get().ownedWeapons,
        get().score,
        get,
        set
      );

      if (nextDialogue) {
        set({ dialogueNode: nextDialogue });
      } else {
        get().closeDialogue();
      }
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
