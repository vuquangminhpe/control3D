import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.CONTROL3D_REALTIME_PORT || process.env.PORT || 3005);
const WEB_ORIGIN = process.env.CONTROL3D_WEB_ORIGIN || "";
const MAX_CHAT_PER_10S = 8;
const MAX_PRESENCE_PER_10S = Number(process.env.CONTROL3D_MAX_PRESENCE_PER_10S || 300);
const MAX_PLAYER_SPEED = Number(process.env.CONTROL3D_MAX_PLAYER_SPEED || 45);
const MAX_CLIENTS_PER_ROOM = Number(process.env.CONTROL3D_MAX_CLIENTS_PER_ROOM || 50);
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_SOCKET_BUFFER_BYTES = 256 * 1024;
const RECENT_MESSAGE_LIMIT = 60;
const STALE_CLIENT_MS = 30_000;
const PRESENCE_BROADCAST_INTERVAL_MS = Math.max(
  33,
  Math.round(1000 / Number(process.env.CONTROL3D_PRESENCE_BROADCAST_HZ || 20)),
);
const WORLD_BROADCAST_INTERVAL_MS = Math.max(
  50,
  Math.round(1000 / Number(process.env.CONTROL3D_WORLD_BROADCAST_HZ || 10)),
);
const ENEMY_DETECTION_RADIUS = Number(process.env.CONTROL3D_ENEMY_DETECTION_RADIUS || 15);
const ENEMY_ATTACK_RADIUS = Number(process.env.CONTROL3D_ENEMY_ATTACK_RADIUS || 2);
const ENEMY_ATTACK_COOLDOWN_MS = Number(process.env.CONTROL3D_ENEMY_ATTACK_COOLDOWN_MS || 1100);
const COMBAT_ATTACK_COOLDOWN_MS = Number(process.env.CONTROL3D_COMBAT_ATTACK_COOLDOWN_MS || 420);
const PLAYER_MAX_HP = Number(process.env.CONTROL3D_PLAYER_MAX_HP || 100);
const PLAYER_HIT_RADIUS = 0.5;
const REALTIME_ACTION_TRIGGERS = new Set([
  "none",
  "attack",
  "talk",
  "move",
  "custom",
  "crouch",
  "jump",
  "idle",
]);

/** @type {Map<string, Set<ClientConnection>>} */
const rooms = new Map();
/** @type {Map<string, Set<ClientConnection>>} */
const dirtyPresenceByRoom = new Map();
/** @type {Map<string, RealtimeWorldSnapshot>} */
const roomWorlds = new Map();
/** @type {Map<string, Set<string>>} */
const rewardedEnemiesByRoom = new Map();
/** @type {Map<string, Map<string, number>>} */
const enemyDamageCooldownsByRoom = new Map();
/** @type {Map<string, RealtimeChatMessage[]>} */
const roomMessages = new Map();

/**
 * @typedef {{
 *   socket: import("node:net").Socket;
 *   id: string;
 *   mapId: string;
 *   userId: string;
 *   displayName: string;
 *   characterId: string | null;
 *   characterName: string | null;
 *   characterFileUrl: string | null;
 *   characterActions: Array<{
 *     id: string;
 *     name: string;
 *     fileUrl: string;
 *     enabled: boolean;
 *     trigger: string;
 *     keyBinding: string | null;
 *     durationMs: number | null;
 *   }>;
 *   presenceSeq: number;
 *   position: [number, number, number];
 *   velocity: [number, number, number];
 *   height: number;
 *   radius: number;
 *   hitRadius: number;
 *   hp: number;
 *   maxHp: number;
 *   actionState: string;
 *   activeActionName: string | null;
 *   activeActionUrl: string | null;
 *   chatTimestamps: number[];
 *   presenceTimestamps: number[];
 *   lastPresenceAt: number;
 *   lastAttackAt: number;
 *   lastSeenAt: number;
 *   frameBuffer: Buffer;
 *   closed: boolean;
 * }} ClientConnection
 *
 * @typedef {{
 *   id: string;
 *   type: "zombie_low" | "zombie_fantasy";
 *   position: [number, number, number];
 * }} RuntimeZombieSpawn
 *
 * @typedef {{
 *   id: string;
 *   status?: "draft" | "published" | "archived";
 *   playerSpawn: [number, number, number];
 *   robotSpawn: [number, number, number];
 *   zombieSpawns: RuntimeZombieSpawn[];
 *   mapCharacters?: Array<{
 *     id: string;
 *     characterId: string;
 *     modelId: string;
 *     name: string;
 *     fileUrl: string;
 *     format?: string;
 *     role: "playable" | "npc" | "story_actor" | "boss";
 *     displayLabel?: string | null;
 *     spawnPosition?: [number, number, number] | null;
 *     previewPosition?: [number, number, number] | null;
 *     storyEnabled?: boolean;
 *     sortOrder?: number;
 *   }>;
 * }} RealtimeMapRuntime
 *
 * @typedef {{
 *   id: string;
 *   type: "zombie_low" | "zombie_fantasy";
 *   position: [number, number, number];
 *   velocity: [number, number, number];
 *   hp: number;
 *   maxHp: number;
 *   actionState: string;
 *   isDead: boolean;
 *   seq: number;
 * }} RealtimeEnemyState
 *
 * @typedef {{
 *   id: string;
 *   kind: string;
 *   characterId: string | null;
 *   modelId: string | null;
 *   name: string | null;
 *   fileUrl: string | null;
 *   format: string | null;
 *   position: [number, number, number];
 *   actionState: string;
 *   seq: number;
 * }} RealtimeNpcState
 *
 * @typedef {{
 *   mapId: string;
 *   serverTimeMs: number;
 *   tick: number;
 *   enemies: RealtimeEnemyState[];
 *   npcs: RealtimeNpcState[];
 * }} RealtimeWorldSnapshot
 *
 * @typedef {{
 *   id: string;
 *   mapId: string;
 *   sessionId: string | null;
 *   userId: string;
 *   displayName: string;
 *   channel: "map" | "system";
 *   body: string;
 *   isDeleted: boolean;
 *   createdAt: string;
 * }} RealtimeChatMessage
 */

function getRealtimeSecret() {
  const configured =
    process.env.CONTROL3D_REALTIME_SECRET || process.env.CONTROL3D_AUTH_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("CONTROL3D_REALTIME_SECRET is required in production.");
  }

  return (
    "control3d-local-dev-secret-change-before-production"
  );
}

function getAllowedOrigins() {
  const configured = String(process.env.CONTROL3D_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (WEB_ORIGIN) configured.push(WEB_ORIGIN);
  return new Set(configured);
}

function isLocalDevOrigin(origin) {
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const parsed = new URL(origin);
    return (
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isOriginAllowed(request) {
  const origin = request.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  if (!origin) return isLocalDevOrigin("");
  if (allowedOrigins.has(origin)) return true;
  return isLocalDevOrigin(origin);
}

function signPayload(encodedPayload) {
  return createHmac("sha256", getRealtimeSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function verifyJoinToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expected = Buffer.from(signPayload(encodedPayload));
  const actual = Buffer.from(signature);
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.mapId || !payload.userId || !payload.displayName) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeCharacterActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((action) => {
      if (!action || typeof action !== "object") return null;
      const id = typeof action.id === "string" ? action.id : "";
      const name = typeof action.name === "string" ? action.name : "";
      const fileUrl = typeof action.fileUrl === "string" ? action.fileUrl : "";
      if (!id || !name || !fileUrl) return null;
      return {
        id: id.slice(0, 120),
        name: name.slice(0, 120),
        fileUrl: fileUrl.slice(0, 2000),
        enabled: action.enabled !== false,
        trigger:
          typeof action.trigger === "string" && REALTIME_ACTION_TRIGGERS.has(action.trigger)
            ? action.trigger
            : "none",
        keyBinding:
          typeof action.keyBinding === "string" ? action.keyBinding.slice(0, 80) : null,
        durationMs:
          typeof action.durationMs === "number" && Number.isFinite(action.durationMs)
            ? Math.max(1, Math.round(action.durationMs))
            : null,
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}

function finiteVector3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const vector = value.map((entry) => Number(entry));
  return vector.every((entry) => Number.isFinite(entry))
    ? /** @type {[number, number, number]} */ (vector)
    : fallback;
}

function nullableText(value, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function getRoom(mapId) {
  let room = rooms.get(mapId);
  if (!room) {
    room = new Set();
    rooms.set(mapId, room);
  }
  return room;
}

function getRecentMessages(mapId) {
  return roomMessages.get(mapId) ?? [];
}

function rememberMessage(message) {
  const messages = getRecentMessages(message.mapId);
  messages.push(message);
  roomMessages.set(message.mapId, messages.slice(-RECENT_MESSAGE_LIMIT));
}

async function persistChatMessage(message) {
  if (!WEB_ORIGIN) return;
  try {
    await fetch(`${WEB_ORIGIN.replace(/\/$/, "")}/api/internal/realtime/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-control3d-realtime-secret": getRealtimeSecret(),
      },
      body: JSON.stringify(message),
    });
  } catch {
    // Keep the room live even if durable storage is temporarily unavailable.
  }
}

function getKillReward(enemy) {
  return enemy.type === "zombie_fantasy" ? 300 : 100;
}

async function persistPointReward({ client, enemy, amount, transactionId }) {
  if (!WEB_ORIGIN) {
    return {
      transactionId,
      balanceAfter: null,
      amount,
      duplicate: false,
    };
  }

  const response = await fetch(`${WEB_ORIGIN.replace(/\/$/, "")}/api/internal/realtime/rewards`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-control3d-realtime-secret": getRealtimeSecret(),
    },
    body: JSON.stringify({
      id: transactionId,
      userId: client.userId,
      mapId: client.mapId,
      sessionId: client.id,
      enemyId: enemy.id,
      enemyType: enemy.type,
      amount,
      type: "monster_kill",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to persist point reward.");
  }
  const payload = await response.json().catch(() => null);
  if (!payload?.success) {
    throw new Error(payload?.error || "Failed to persist point reward.");
  }
  return payload.data;
}

async function awardEnemyKillReward(client, enemy) {
  let rewarded = rewardedEnemiesByRoom.get(client.mapId);
  if (!rewarded) {
    rewarded = new Set();
    rewardedEnemiesByRoom.set(client.mapId, rewarded);
  }
  if (rewarded.has(enemy.id)) return null;
  rewarded.add(enemy.id);

  const amount = getKillReward(enemy);
  const transactionId = `kill:${client.mapId}:${enemy.id}`;
  try {
    const result = await persistPointReward({ client, enemy, amount, transactionId });
    return {
      userId: client.userId,
      enemyId: enemy.id,
      amount,
      balanceAfter:
        typeof result.balanceAfter === "number" ? result.balanceAfter : null,
      transactionId,
      duplicate: Boolean(result.duplicate),
    };
  } catch {
    return {
      userId: client.userId,
      enemyId: enemy.id,
      amount,
      balanceAfter: null,
      transactionId,
      duplicate: false,
    };
  }
}

function getEnemyStats(type) {
  return type === "zombie_fantasy"
    ? { hp: 110, maxHp: 110 }
    : { hp: 40, maxHp: 40 };
}

function getEnemyDimensions(type) {
  return type === "zombie_fantasy"
    ? { height: 2.05, radius: 0.48, hitRadius: 1.05 }
    : { height: 1.8, radius: 0.42, hitRadius: 0.75 };
}

function fallbackZombieSpawns(runtime) {
  if (Array.isArray(runtime.zombieSpawns) && runtime.zombieSpawns.length > 0) {
    return runtime.zombieSpawns.map((spawn, index) => ({
      id: spawn.id || `e${index + 1}`,
      type: spawn.type === "zombie_fantasy" ? "zombie_fantasy" : "zombie_low",
      position: finiteVector3(spawn.position, [0, 0, 0]),
    }));
  }
  const spawn = Array.isArray(runtime.playerSpawn) ? runtime.playerSpawn : [0, 1.5, 0];
  return [
    {
      id: "fallback-enemy-1",
      type: "zombie_low",
      position: [spawn[0] + 4, spawn[1], spawn[2] + 5],
    },
    {
      id: "fallback-enemy-2",
      type: "zombie_low",
      position: [spawn[0] - 5, spawn[1], spawn[2] + 7],
    },
    {
      id: "fallback-enemy-3",
      type: "zombie_fantasy",
      position: [spawn[0] + 7, spawn[1], spawn[2] - 5],
    },
  ];
}

function runtimeNpcActors(runtime) {
  const actors = Array.isArray(runtime.mapCharacters)
    ? runtime.mapCharacters
        .filter((actor) => {
          const role = actor?.role;
          return (
            role === "npc" ||
            role === "story_actor" ||
            role === "boss" ||
            actor?.storyEnabled === true
          );
        })
        .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
        .map((actor, index) => ({
          id: nullableText(actor.id, 120) || `npc-${index + 1}`,
          kind: nullableText(actor.role, 40) || "npc",
          characterId: nullableText(actor.characterId, 120),
          modelId: nullableText(actor.modelId, 120),
          name: nullableText(actor.displayLabel, 120) || nullableText(actor.name, 120),
          fileUrl: nullableText(actor.fileUrl, 2000),
          format: nullableText(actor.format, 20),
          position: finiteVector3(
            actor.spawnPosition ?? actor.previewPosition,
            Array.isArray(runtime.robotSpawn) ? finiteVector3(runtime.robotSpawn) : [0, 0, 0],
          ),
          actionState: "idle",
          seq: 0,
        }))
    : [];

  if (actors.length > 0) return actors;

  return [
    {
      id: "robot",
      kind: "robot",
      characterId: null,
      modelId: null,
      name: "Robot",
      fileUrl: null,
      format: null,
      position: Array.isArray(runtime.robotSpawn) ? finiteVector3(runtime.robotSpawn) : [0, 0, 0],
      actionState: "idle",
      seq: 0,
    },
  ];
}

function createWorldSnapshot(mapId, runtime) {
  const enemies = fallbackZombieSpawns(runtime).map((spawn, index) => {
    const stats = getEnemyStats(spawn.type);
    const dimensions = getEnemyDimensions(spawn.type);
    return {
      id: spawn.id || `e${index + 1}`,
      type: spawn.type,
      position: spawn.position,
      velocity: [0, 0, 0],
      height: dimensions.height,
      radius: dimensions.radius,
      hitRadius: dimensions.hitRadius,
      hp: stats.hp,
      maxHp: stats.maxHp,
      actionState: "idle",
      isDead: false,
      seq: 0,
    };
  });

  return {
    mapId,
    serverTimeMs: Date.now(),
    tick: 0,
    enemies,
    npcs: runtimeNpcActors(runtime),
  };
}

async function fetchMapRuntime(mapId, isAdminPreview) {
  if (!WEB_ORIGIN) return null;
  const previewParam = isAdminPreview ? "?preview=1" : "";
  const response = await fetch(
    `${WEB_ORIGIN.replace(/\/$/, "")}/api/internal/realtime/maps/${encodeURIComponent(mapId)}/runtime${previewParam}`,
    {
      headers: {
        "x-control3d-realtime-secret": getRealtimeSecret(),
      },
    },
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.success ? payload.data?.map ?? null : null;
}

async function getRoomWorld(mapId, isAdminPreview) {
  const existing = roomWorlds.get(mapId);
  if (existing) return existing;

  const runtime =
    (await fetchMapRuntime(mapId, isAdminPreview)) ??
    {
      id: mapId,
      playerSpawn: [0, 1.5, 0],
      robotSpawn: [0, 0, 0],
      zombieSpawns: [],
    };
  const snapshot = createWorldSnapshot(mapId, runtime);
  roomWorlds.set(mapId, snapshot);
  return snapshot;
}

function toPresence(client) {
  if (client.spectator) return null;
  return {
    id: client.id,
    userId: client.userId,
    displayName: client.displayName,
    mapId: client.mapId,
    characterId: client.characterId,
    seq: client.presenceSeq,
    serverTimeMs: Date.now(),
    position: client.position,
    velocity: client.velocity,
    characterName: client.characterName,
    characterFileUrl: client.characterFileUrl,
    characterActions: client.characterActions,
    actionState: client.actionState,
    activeActionName: client.activeActionName,
    activeActionUrl: client.activeActionUrl,
    updatedAt: new Date().toISOString(),
  };
}

function sendEvent(client, type, payload) {
  if (client.socket.destroyed) return;
  if (client.socket.writableLength > MAX_SOCKET_BUFFER_BYTES) {
    closeClient(client, "buffer_overflow");
    return;
  }
  const body = Buffer.from(JSON.stringify({ type, payload }), "utf8");
  const header = [];
  header.push(0x81);
  if (body.length < 126) {
    header.push(body.length);
  } else if (body.length <= 0xffff) {
    header.push(126, (body.length >> 8) & 0xff, body.length & 0xff);
  } else {
    header.push(127, 0, 0, 0, 0);
    const high = Math.floor(body.length / 2 ** 32);
    const low = body.length >>> 0;
    header.push((high >> 24) & 0xff, (high >> 16) & 0xff, (high >> 8) & 0xff, high & 0xff);
    header.push((low >> 24) & 0xff, (low >> 16) & 0xff, (low >> 8) & 0xff, low & 0xff);
  }
  client.socket.write(Buffer.concat([Buffer.from(header), body]));
}

function sendError(client, code, message) {
  sendEvent(client, "error", { code, message });
}

function broadcast(mapId, type, payload, exceptClient) {
  const room = rooms.get(mapId);
  if (!room) return;
  for (const client of room) {
    if (exceptClient && client.id === exceptClient.id) continue;
    sendEvent(client, type, payload);
  }
}

function markPresenceDirty(client) {
  if (client.spectator) return;
  let dirtyRoom = dirtyPresenceByRoom.get(client.mapId);
  if (!dirtyRoom) {
    dirtyRoom = new Set();
    dirtyPresenceByRoom.set(client.mapId, dirtyRoom);
  }
  dirtyRoom.add(client);
}

function flushPresenceUpdates() {
  for (const [mapId, dirtyClients] of dirtyPresenceByRoom) {
    const room = rooms.get(mapId);
    if (!room || room.size === 0) {
      dirtyPresenceByRoom.delete(mapId);
      continue;
    }

    for (const client of dirtyClients) {
      if (client.closed || client.spectator || !room.has(client)) continue;
      const presence = toPresence(client);
      if (presence) {
        broadcast(mapId, "presence:update", presence, client);
      }
    }

    dirtyPresenceByRoom.delete(mapId);
  }
}

function getNearestPlayer(room, enemy) {
  let nearest = null;
  for (const client of room) {
    if (client.closed || client.spectator || client.hp <= 0) continue;
    const dx = client.position[0] - enemy.position[0];
    const dz = client.position[2] - enemy.position[2];
    const distance = Math.hypot(dx, dz);
    if (!nearest || distance < nearest.distance) {
      nearest = { client, distance, dx, dz };
    }
  }
  return nearest;
}

function getEnemyDamage(mapId, enemy) {
  return enemy.type === "zombie_fantasy" ? 12 : 5;
}

function applyEnemyDamage(mapId, enemy, client, now) {
  let cooldowns = enemyDamageCooldownsByRoom.get(mapId);
  if (!cooldowns) {
    cooldowns = new Map();
    enemyDamageCooldownsByRoom.set(mapId, cooldowns);
  }

  const cooldownKey = `${enemy.id}:${client.id}`;
  const lastHitAt = cooldowns.get(cooldownKey) ?? 0;
  if (now - lastHitAt < ENEMY_ATTACK_COOLDOWN_MS) return false;

  cooldowns.set(cooldownKey, now);
  const amount = getEnemyDamage(mapId, enemy);
  client.hp = Math.max(0, client.hp - amount);
  sendEvent(client, "player:damage", {
    userId: client.userId,
    enemyId: enemy.id,
    amount,
    hp: client.hp,
    maxHp: client.maxHp,
  });
  return true;
}

function simulateWorlds(deltaSeconds) {
  const now = Date.now();
  for (const [mapId, world] of roomWorlds) {
    const room = rooms.get(mapId);
    if (!room || room.size === 0) continue;

    let changed = false;
    for (const enemy of world.enemies) {
      if (enemy.isDead || enemy.hp <= 0) continue;

      const nearest = getNearestPlayer(room, enemy);
      if (!nearest || nearest.distance > ENEMY_DETECTION_RADIUS) {
        if (enemy.actionState !== "idle" || enemy.velocity.some((value) => value !== 0)) {
          enemy.actionState = "idle";
          enemy.velocity = [0, 0, 0];
          enemy.seq += 1;
          changed = true;
        }
        continue;
      }

      if (nearest.distance <= ENEMY_ATTACK_RADIUS + PLAYER_HIT_RADIUS + (enemy.radius ?? 0.42)) {
        if (applyEnemyDamage(mapId, enemy, nearest.client, now)) {
          changed = true;
        }
        if (enemy.actionState !== "attack" || enemy.velocity.some((value) => value !== 0)) {
          enemy.actionState = "attack";
          enemy.velocity = [0, 0, 0];
          enemy.seq += 1;
          changed = true;
        }
        continue;
      }

      const length = Math.max(nearest.distance, 0.0001);
      const speed = enemy.type === "zombie_fantasy" ? 3 : 2;
      const stopDistance = ENEMY_ATTACK_RADIUS + PLAYER_HIT_RADIUS + (enemy.radius ?? 0.42);
      const step = Math.min(nearest.distance - stopDistance, speed * deltaSeconds);
      const velocityX = (nearest.dx / length) * speed;
      const velocityZ = (nearest.dz / length) * speed;
      enemy.position = [
        Number((enemy.position[0] + (nearest.dx / length) * step).toFixed(3)),
        enemy.position[1],
        Number((enemy.position[2] + (nearest.dz / length) * step).toFixed(3)),
      ];
      enemy.velocity = [
        Number(velocityX.toFixed(3)),
        0,
        Number(velocityZ.toFixed(3)),
      ];
      enemy.actionState = "run";
      enemy.seq += 1;
      changed = true;
    }

    if (changed) {
      world.tick += 1;
      world.serverTimeMs = now;
      broadcast(mapId, "world:snapshot", world);
    }
  }
}

function normalizeDirection(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => Number.isFinite(entry))
  ) {
    return null;
  }
  const x = Number(value[0]);
  const z = Number(value[2]);
  const length = Math.hypot(x, z);
  if (length < 0.001) return null;
  return [x / length, 0, z / length];
}

function getAttackProfile(mode) {
  if (mode === "heavy") {
    return { damage: 35, reach: 3.4, arcDot: Math.cos((95 * Math.PI) / 180 / 2) };
  }
  if (mode === "alt") {
    return { damage: 24, reach: 4.2, arcDot: Math.cos((70 * Math.PI) / 180 / 2) };
  }
  return { damage: 18, reach: 3.1, arcDot: Math.cos((90 * Math.PI) / 180 / 2) };
}

function broadcastWorldSnapshot(mapId, world) {
  world.tick += 1;
  world.serverTimeMs = Date.now();
  broadcast(mapId, "world:snapshot", world);
}

function applyCombatAttack(client, payload) {
  const now = Date.now();
  if (now - client.lastAttackAt < COMBAT_ATTACK_COOLDOWN_MS) {
    sendError(client, "attack_rate_limited", "Attack cooldown has not finished.");
    return;
  }

  const direction = normalizeDirection(payload?.direction);
  if (!direction) {
    sendError(client, "invalid_attack", "Invalid attack direction.");
    return;
  }

  const world = roomWorlds.get(client.mapId);
  if (!world) {
    sendError(client, "world_not_ready", "World state is not ready.");
    return;
  }

  const mode = ["light", "heavy", "alt"].includes(payload?.mode) ? payload.mode : "light";
  const profile = getAttackProfile(mode);
  let best = null;
  for (const enemy of world.enemies) {
    if (enemy.isDead || enemy.hp <= 0) continue;
    const dx = enemy.position[0] - client.position[0];
    const dz = enemy.position[2] - client.position[2];
    const distance = Math.hypot(dx, dz);
    const targetRadius =
      typeof enemy.hitRadius === "number" && Number.isFinite(enemy.hitRadius)
        ? enemy.hitRadius
        : getEnemyDimensions(enemy.type).hitRadius;
    if (distance > profile.reach + targetRadius) continue;
    const length = Math.max(distance, 0.0001);
    const dot = (dx / length) * direction[0] + (dz / length) * direction[2];
    if (dot < profile.arcDot) continue;
    if (!best || distance < best.distance) {
      best = { enemy, distance };
    }
  }

  client.lastAttackAt = now;
  if (!best) {
    sendError(client, "attack_missed", "No enemy in server-authoritative hit range.");
    return;
  }

  const enemy = best.enemy;
  enemy.hp = Math.max(0, enemy.hp - profile.damage);
  const wasDead = enemy.isDead;
  enemy.isDead = enemy.hp <= 0;
  enemy.actionState = enemy.isDead ? "death" : "hit";
  enemy.velocity = [0, 0, 0];
  enemy.seq += 1;
  broadcast(client.mapId, "combat:hit", {
    enemyId: enemy.id,
    userId: client.userId,
    damage: profile.damage,
    hp: enemy.hp,
    isDead: enemy.isDead,
    clientAttackId:
      typeof payload?.clientAttackId === "string"
        ? payload.clientAttackId.slice(0, 80)
        : null,
  });
  if (!wasDead && enemy.isDead) {
    void awardEnemyKillReward(client, enemy).then((reward) => {
      if (reward) {
        broadcast(client.mapId, "reward:points", reward);
      }
    });
  }
  broadcastWorldSnapshot(client.mapId, world);
}

function sanitizeChatBody(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function allowChat(client) {
  const now = Date.now();
  client.chatTimestamps = client.chatTimestamps.filter((stamp) => now - stamp < 10_000);
  if (client.chatTimestamps.length >= MAX_CHAT_PER_10S) return false;
  client.chatTimestamps.push(now);
  return true;
}

function allowPresence(client) {
  const now = Date.now();
  client.presenceTimestamps = client.presenceTimestamps.filter((stamp) => now - stamp < 10_000);
  if (client.presenceTimestamps.length >= MAX_PRESENCE_PER_10S) return false;
  client.presenceTimestamps.push(now);
  return true;
}

function isValidMovement(client, nextPosition) {
  const now = Date.now();
  if (!client.lastPresenceAt) return true;
  const elapsedSeconds = Math.max((now - client.lastPresenceAt) / 1000, 0.05);
  const distance = Math.hypot(
    nextPosition[0] - client.position[0],
    nextPosition[1] - client.position[1],
    nextPosition[2] - client.position[2],
  );
  return distance <= MAX_PLAYER_SPEED * elapsedSeconds + 3;
}

function sanitizeNullableText(value, maxLength) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function handleClientEvent(client, event) {
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    sendError(client, "invalid_event", "Invalid realtime event.");
    return;
  }

  if (client.spectator && (event.type === "presence:update" || event.type === "combat:attack")) {
    sendError(client, "spectator_read_only", "Spectator preview cannot control gameplay.");
    return;
  }

  if (event.type === "presence:update") {
    const position = event.payload?.position;
    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every((value) => Number.isFinite(value))
    ) {
      sendError(client, "invalid_presence", "Invalid presence payload.");
      return;
    }
    if (!allowPresence(client)) {
      sendError(client, "presence_rate_limited", "Presence updates are too frequent.");
      return;
    }
    const nextPosition = position.map((value) => Number(value));
    if (!isValidMovement(client, nextPosition)) {
      sendError(client, "movement_rejected", "Movement update exceeded server limits.");
      return;
    }
    client.presenceSeq += 1;
    client.position = nextPosition;
    if (
      Array.isArray(event.payload.velocity) &&
      event.payload.velocity.length === 3 &&
      event.payload.velocity.every((value) => Number.isFinite(value))
    ) {
      client.velocity = event.payload.velocity.map((value) => Number(value));
    } else {
      client.velocity = [0, 0, 0];
    }
    client.lastPresenceAt = Date.now();
    client.characterName =
      typeof event.payload.characterName === "string"
        ? event.payload.characterName.slice(0, 80)
        : client.characterName;
    client.characterFileUrl =
      typeof event.payload.characterFileUrl === "string"
        ? event.payload.characterFileUrl.slice(0, 2000)
        : client.characterFileUrl;
    client.actionState =
      typeof event.payload.actionState === "string"
        ? event.payload.actionState.trim().slice(0, 40) || "idle"
        : client.actionState;
    const nextActionName = sanitizeNullableText(event.payload.activeActionName, 120);
    if (nextActionName !== undefined) {
      client.activeActionName = nextActionName;
    }
    const nextActionUrl = sanitizeNullableText(event.payload.activeActionUrl, 2000);
    if (nextActionUrl !== undefined) {
      client.activeActionUrl = nextActionUrl;
    }
    markPresenceDirty(client);
    return;
  }

  if (event.type === "chat:send") {
    const body = sanitizeChatBody(event.payload?.body);
    if (!body) {
      sendError(client, "invalid_chat", "Chat message is empty.");
      return;
    }
    if (!allowChat(client)) {
      sendError(client, "chat_rate_limited", "You are sending messages too quickly.");
      return;
    }
    const message = {
      id: randomUUID(),
      mapId: client.mapId,
      sessionId: client.id,
      userId: client.userId,
      displayName: client.displayName,
      channel: "map",
      body,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    rememberMessage(message);
    void persistChatMessage(message);
    broadcast(client.mapId, "chat:message", message);
    return;
  }

  if (event.type === "combat:attack") {
    applyCombatAttack(client, event.payload);
    return;
  }

  if (event.type === "ping") {
    sendEvent(client, "pong", {
      sentAt: event.payload?.sentAt,
      receivedAt: Date.now(),
    });
    return;
  }

  sendError(client, "unknown_event", "Unknown realtime event.");
}

function parseClientFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const frameStart = offset;
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    offset += 2;

    if (length === 126) {
      if (offset + 2 > buffer.length) {
        return { messages, remaining: buffer.subarray(frameStart) };
      }
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) {
        return { messages, remaining: buffer.subarray(frameStart) };
      }
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      length = high * 2 ** 32 + low;
      offset += 8;
    }

    if (length > MAX_MESSAGE_BYTES) {
      throw new Error("Frame too large");
    }

    if (!masked) {
      throw new Error("Client frames must be masked");
    }
    if (offset + 4 + length > buffer.length) {
      return { messages, remaining: buffer.subarray(frameStart) };
    }
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[offset + index] ^ mask[index % 4];
    }
    offset += length;

    if (opcode === 0x8) {
      messages.push({ type: "close" });
    } else if (opcode === 0x1) {
      messages.push({ type: "text", data: payload.toString("utf8") });
    }
  }

  return { messages, remaining: buffer.subarray(offset) };
}

function closeClient(client, reason = "closed") {
  if (client.closed) return;
  client.closed = true;
  const room = rooms.get(client.mapId);
  if (room?.delete(client) && !client.spectator) {
    broadcast(client.mapId, "presence:left", { id: client.id, userId: client.userId });
  }
  if (room && room.size === 0) {
    rooms.delete(client.mapId);
    dirtyPresenceByRoom.delete(client.mapId);
    roomWorlds.delete(client.mapId);
    rewardedEnemiesByRoom.delete(client.mapId);
    enemyDamageCooldownsByRoom.delete(client.mapId);
  }
  if (!client.socket.destroyed) {
    client.socket.destroy();
  }
}

async function acceptWebSocket(request, socket, head) {
  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  if (!isOriginAllowed(request)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/rooms/game") {
    socket.destroy();
    return;
  }

  const payload = verifyJoinToken(url.searchParams.get("token"));
  if (!payload) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const room = getRoom(payload.mapId);
  if (room.size >= MAX_CLIENTS_PER_ROOM) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  let worldSnapshot;
  try {
    worldSnapshot = await getRoomWorld(payload.mapId, Boolean(payload.isAdmin));
  } catch {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      "\r\n",
    ].join("\r\n"),
  );

  const client = {
    socket,
    id: randomUUID(),
    mapId: payload.mapId,
    userId: payload.userId,
    displayName: String(payload.displayName).slice(0, 40),
    characterId: typeof payload.characterId === "string" ? payload.characterId.slice(0, 120) : null,
    characterName: payload.characterName ?? null,
    characterFileUrl: payload.characterFileUrl ?? null,
    characterActions: sanitizeCharacterActions(payload.characterActions),
    spectator: payload.spectator === true && payload.isAdmin === true,
    presenceSeq: 0,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    actionState: "idle",
    activeActionName: null,
    activeActionUrl: null,
    chatTimestamps: [],
    presenceTimestamps: [],
    lastPresenceAt: 0,
    lastAttackAt: 0,
    lastSeenAt: Date.now(),
    frameBuffer: Buffer.alloc(0),
    closed: false,
  };
  const otherPlayers = Array.from(room).map(toPresence).filter(Boolean);
  room.add(client);

  sendEvent(client, "room:joined", {
    self: client.spectator ? null : toPresence(client),
    players: otherPlayers,
    messages: getRecentMessages(client.mapId),
  });
  sendEvent(client, "world:snapshot", {
    ...worldSnapshot,
    serverTimeMs: Date.now(),
  });
  markPresenceDirty(client);

  socket.on("data", (chunk) => {
    try {
      client.lastSeenAt = Date.now();
      client.frameBuffer = Buffer.concat([client.frameBuffer, chunk]);
      if (client.frameBuffer.length > MAX_MESSAGE_BYTES * 2) {
        closeClient(client, "frame_buffer_overflow");
        return;
      }
      const parsedFrames = parseClientFrames(client.frameBuffer);
      client.frameBuffer = parsedFrames.remaining;
      for (const frame of parsedFrames.messages) {
        if (frame.type === "close") {
          closeClient(client, "client_close");
          return;
        }
        if (frame.type === "text") {
          handleClientEvent(client, JSON.parse(frame.data));
        }
      }
    } catch {
      sendError(client, "invalid_frame", "Realtime frame could not be processed.");
      closeClient(client, "invalid_frame");
    }
  });
  socket.on("close", () => closeClient(client, "socket_close"));
  socket.on("error", () => closeClient(client, "socket_error"));
}

function createWebSocketAccept(key) {
  return createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.on("upgrade", acceptWebSocket);

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const client of room) {
      if (now - client.lastSeenAt > STALE_CLIENT_MS) {
        closeClient(client, "stale_connection");
      }
    }
  }
}, 5_000).unref();

setInterval(flushPresenceUpdates, PRESENCE_BROADCAST_INTERVAL_MS).unref();
setInterval(
  () => simulateWorlds(WORLD_BROADCAST_INTERVAL_MS / 1000),
  WORLD_BROADCAST_INTERVAL_MS,
).unref();

server.listen(PORT, () => {
  console.log(`Control3D realtime listening on ws://localhost:${PORT}/rooms/game`);
});
