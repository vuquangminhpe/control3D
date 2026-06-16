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

/** @type {Map<string, Set<ClientConnection>>} */
const rooms = new Map();
/** @type {Map<string, Set<ClientConnection>>} */
const dirtyPresenceByRoom = new Map();
/** @type {Map<string, RealtimeChatMessage[]>} */
const roomMessages = new Map();

/**
 * @typedef {{
 *   socket: import("node:net").Socket;
 *   id: string;
 *   mapId: string;
 *   userId: string;
 *   displayName: string;
 *   characterName: string | null;
 *   characterFileUrl: string | null;
 *   presenceSeq: number;
 *   position: [number, number, number];
 *   velocity: [number, number, number];
 *   actionState: string;
 *   activeActionName: string | null;
 *   activeActionUrl: string | null;
 *   chatTimestamps: number[];
 *   presenceTimestamps: number[];
 *   lastPresenceAt: number;
 *   lastSeenAt: number;
 *   frameBuffer: Buffer;
 *   closed: boolean;
 * }} ClientConnection
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

function toPresence(client) {
  return {
    id: client.id,
    userId: client.userId,
    displayName: client.displayName,
    mapId: client.mapId,
    seq: client.presenceSeq,
    serverTimeMs: Date.now(),
    position: client.position,
    velocity: client.velocity,
    characterName: client.characterName,
    characterFileUrl: client.characterFileUrl,
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
      if (client.closed || !room.has(client)) continue;
      broadcast(mapId, "presence:update", toPresence(client), client);
    }

    dirtyPresenceByRoom.delete(mapId);
  }
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
  if (room?.delete(client)) {
    broadcast(client.mapId, "presence:left", { id: client.id, userId: client.userId });
  }
  if (room && room.size === 0) {
    rooms.delete(client.mapId);
    dirtyPresenceByRoom.delete(client.mapId);
  }
  if (!client.socket.destroyed) {
    client.socket.destroy();
  }
}

function acceptWebSocket(request, socket, head) {
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
    characterName: payload.characterName ?? null,
    characterFileUrl: payload.characterFileUrl ?? null,
    presenceSeq: 0,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    actionState: "idle",
    activeActionName: null,
    activeActionUrl: null,
    chatTimestamps: [],
    presenceTimestamps: [],
    lastPresenceAt: 0,
    lastSeenAt: Date.now(),
    frameBuffer: Buffer.alloc(0),
    closed: false,
  };
  const otherPlayers = Array.from(room).map(toPresence);
  room.add(client);

  sendEvent(client, "room:joined", {
    self: toPresence(client),
    players: otherPlayers,
    messages: getRecentMessages(client.mapId),
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

server.listen(PORT, () => {
  console.log(`Control3D realtime listening on ws://localhost:${PORT}/rooms/game`);
});
