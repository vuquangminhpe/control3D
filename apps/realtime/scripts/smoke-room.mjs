import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import net from "node:net";

const port = Number(process.env.CONTROL3D_SMOKE_REALTIME_PORT || 3025);
const origin = `http://localhost:${Number(process.env.CONTROL3D_SMOKE_WEB_PORT || 3020)}`;
const secret = "control3d-smoke-secret-with-enough-length";
const mapId = "map-smoke-production-room";

function createJoinToken(payload) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function createClientFrame(event) {
  const payload = Buffer.from(JSON.stringify(event), "utf8");
  const mask = crypto.randomBytes(4);
  const header =
    payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : Buffer.from([
          0x81,
          0x80 | 126,
          (payload.length >> 8) & 0xff,
          payload.length & 0xff,
        ]);
  const maskedPayload = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    maskedPayload[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, maskedPayload]);
}

function parseServerFrames(state) {
  const events = [];
  let offset = 0;
  const buffer = state.buffer;

  while (offset + 2 <= buffer.length) {
    const frameStart = offset;
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    offset += 2;

    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      length = high * 2 ** 32 + low;
      offset += 8;
    }

    if (offset + length > buffer.length) {
      offset = frameStart;
      break;
    }

    const payload = buffer.subarray(offset, offset + length);
    offset += length;
    if (opcode === 0x1) {
      events.push(JSON.parse(payload.toString("utf8")));
    }
  }

  state.buffer = buffer.subarray(offset);
  return events;
}

function connectClient(name, joinToken) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    const key = crypto.randomBytes(16).toString("base64");
    const state = {
      buffer: Buffer.alloc(0),
      events: [],
      headerDone: false,
    };
    const timeout = setTimeout(
      () => reject(new Error(`${name} handshake timeout`)),
      5_000,
    );

    socket.on("connect", () => {
      socket.write(
        [
          `GET /rooms/game?token=${encodeURIComponent(joinToken)} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          `Origin: ${origin}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "\r\n",
        ].join("\r\n"),
      );
    });

    socket.on("data", (chunk) => {
      state.buffer = Buffer.concat([state.buffer, chunk]);
      if (!state.headerDone) {
        const marker = state.buffer.indexOf("\r\n\r\n");
        if (marker < 0) return;

        const header = state.buffer.subarray(0, marker).toString("utf8");
        if (!header.includes("101 Switching Protocols")) {
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error(`${name} rejected: ${header}`));
          return;
        }

        state.headerDone = true;
        state.buffer = state.buffer.subarray(marker + 4);
        clearTimeout(timeout);
        resolve({
          name,
          socket,
          events: state.events,
          send: (event) => socket.write(createClientFrame(event)),
          waitFor: (predicate, label, timeoutMs = 5_000) =>
            waitForEvent(state, predicate, `${name} ${label}`, timeoutMs),
          close: () => socket.destroy(),
        });
      }

      state.events.push(...parseServerFrames(state));
    });

    socket.on("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForEvent(state, predicate, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const found = state.events.find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Missing realtime event: ${label}`));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Retry until the child server is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Realtime health endpoint did not become ready.");
}

async function run() {
  const server = spawn(process.execPath, ["src/server.mjs"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      CONTROL3D_REALTIME_PORT: String(port),
      CONTROL3D_REALTIME_SECRET: secret,
      CONTROL3D_ALLOWED_ORIGINS: origin,
      CONTROL3D_WEB_ORIGIN: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth();

    const alice = await connectClient(
      "alice",
      createJoinToken({
        mapId,
        userId: "user-a",
        displayName: "Alice",
        characterId: "character-knight",
        characterName: "Knight",
        characterFileUrl: "/knight.glb",
        characterActions: [
          {
            id: "knight-idle",
            name: "Knight Idle",
            fileUrl: "/animations/knight-idle.fbx",
            enabled: true,
            trigger: "idle",
            keyBinding: null,
            durationMs: null,
          },
        ],
        isAdmin: false,
      }),
    );
    await alice.waitFor(
      (event) =>
        event.type === "room:joined" &&
        event.payload.self.displayName === "Alice",
      "join",
    );
    const aliceWorld = await alice.waitFor(
      (event) => event.type === "world:snapshot",
      "world snapshot",
    );
    assert.equal(aliceWorld.payload.mapId, mapId);
    assert.equal(aliceWorld.payload.enemies.length, 3);
    assert.equal(aliceWorld.payload.enemies[0].height, 1.8);
    assert.equal(aliceWorld.payload.enemies[0].radius, 0.42);
    assert.equal(aliceWorld.payload.enemies[0].hitRadius, 0.75);
    assert.equal(aliceWorld.payload.npcs[0].id, "robot");
    const aliceWorldTick = await alice.waitFor(
      (event) =>
        event.type === "world:snapshot" &&
        event.payload.tick > aliceWorld.payload.tick,
      "world simulation tick",
    );
    assert.equal(aliceWorldTick.payload.enemies[0].actionState, "run");
    assert.ok(aliceWorldTick.payload.enemies[0].seq > 0);

    const bob = await connectClient(
      "bob",
      createJoinToken({
        mapId,
        userId: "user-b",
        displayName: "Bob",
        characterId: "character-mage",
        characterName: "Mage",
        characterFileUrl: "/mage.glb",
        characterActions: [
          {
            id: "mage-run",
            name: "Mage Run",
            fileUrl: "/animations/mage-run.fbx",
            enabled: true,
            trigger: "move",
            keyBinding: "W+A+S+D",
            durationMs: null,
          },
        ],
        isAdmin: false,
      }),
    );
    const bobJoin = await bob.waitFor(
      (event) => event.type === "room:joined",
      "join",
    );
    assert.equal(bobJoin.payload.players.length, 1);
    assert.equal(bobJoin.payload.players[0].displayName, "Alice");
    assert.equal(bobJoin.payload.players[0].characterId, "character-knight");
    assert.equal(bobJoin.payload.players[0].seq, 0);
    assert.ok(bobJoin.payload.players[0].serverTimeMs > 0);
    assert.equal(bobJoin.payload.players[0].characterActions[0].fileUrl, "/animations/knight-idle.fbx");

    const bobPresence = await alice.waitFor(
      (event) =>
        event.type === "presence:update" &&
        event.payload.displayName === "Bob",
      "sees bob",
    );
    assert.equal(bobPresence.payload.characterId, "character-mage");
    assert.equal(bobPresence.payload.characterActions[0].fileUrl, "/animations/mage-run.fbx");

    const spectator = await connectClient(
      "spectator",
      createJoinToken({
        mapId,
        userId: "admin-a",
        displayName: "Admin preview",
        characterId: null,
        characterName: null,
        characterFileUrl: null,
        characterActions: [],
        isAdmin: true,
        spectator: true,
      }),
    );
    const spectatorJoin = await spectator.waitFor(
      (event) => event.type === "room:joined",
      "join",
    );
    assert.equal(spectatorJoin.payload.self, null);
    assert.deepEqual(
      spectatorJoin.payload.players.map((player) => player.displayName).sort(),
      ["Alice", "Bob"],
    );
    spectator.send({
      type: "combat:attack",
      payload: {
        mode: "light",
        origin: [0, 0, 0],
        direction: [1, 0, 0],
      },
    });
    const spectatorReadonly = await spectator.waitFor(
      (event) =>
        event.type === "error" &&
        event.payload.code === "spectator_read_only",
      "read-only error",
    );
    assert.equal(spectatorReadonly.payload.message, "Spectator preview cannot control gameplay.");

    bob.send({
      type: "presence:update",
      payload: {
        position: [2, 0, 2],
        velocity: [1.5, 0, 1.5],
        characterName: "Mage",
        characterFileUrl: "/mage.glb",
        actionState: "run",
        activeActionName: "Mage Run",
        activeActionUrl: "/animations/mage-run.fbx",
      },
    });
    bob.send({
      type: "presence:update",
      payload: {
        position: [3, 0, 3],
        velocity: [2, 0, 2],
        characterName: "Mage",
        characterFileUrl: "/mage.glb",
        actionState: "attack",
        activeActionName: "Mage Attack",
        activeActionUrl: "/animations/mage-attack.fbx",
      },
    });
    const bobMove = await alice.waitFor(
      (event) =>
        event.type === "presence:update" &&
        event.payload.displayName === "Bob" &&
        event.payload.position[0] === 3,
      "sees bob move",
    );
    assert.equal(bobMove.payload.actionState, "attack");
    assert.equal(bobMove.payload.activeActionUrl, "/animations/mage-attack.fbx");
    assert.deepEqual(bobMove.payload.velocity, [2, 0, 2]);
    assert.ok(bobMove.payload.seq >= 2);
    assert.ok(bobMove.payload.serverTimeMs > 0);

    alice.send({
      type: "presence:update",
      payload: {
        position: [3.5, 0, 4.5],
        velocity: [0, 0, 0],
        characterName: "Knight",
        characterFileUrl: "/knight.glb",
        actionState: "attack",
        activeActionName: "Knight Slash",
        activeActionUrl: "/animations/knight-slash.fbx",
      },
    });
    const aliceDamage = await alice.waitFor(
      (event) =>
        event.type === "player:damage" &&
        event.payload.userId === "user-a" &&
        event.payload.amount === 5,
      "receives server enemy damage",
    );
    assert.equal(aliceDamage.payload.hp, 95);
    assert.equal(aliceDamage.payload.maxHp, 100);

    alice.send({
      type: "combat:attack",
      payload: {
        clientAttackId: "smoke-attack-1",
        mode: "light",
        origin: [3.5, 0, 4.5],
        direction: [1, 0, 1],
      },
    });
    const bobHit = await bob.waitFor(
      (event) =>
        event.type === "combat:hit" &&
        event.payload.clientAttackId === "smoke-attack-1",
      "receives server combat hit",
    );
    assert.equal(bobHit.payload.damage, 18);
    assert.equal(bobHit.payload.hp, 22);
    const combatWorld = await bob.waitFor(
      (event) =>
        event.type === "world:snapshot" &&
        event.payload.enemies.some(
          (enemy) => enemy.id === bobHit.payload.enemyId && enemy.hp === 22,
        ),
      "receives combat world snapshot",
    );
    assert.ok(combatWorld.payload.tick > aliceWorldTick.payload.tick);

    await delay(500);
    alice.send({
      type: "combat:attack",
      payload: {
        clientAttackId: "smoke-kill-1",
        mode: "heavy",
        origin: [3.5, 0, 4.5],
        direction: [1, 0, 1],
      },
    });
    const killHit = await bob.waitFor(
      (event) =>
        event.type === "combat:hit" &&
        event.payload.clientAttackId === "smoke-kill-1" &&
        event.payload.isDead,
      "receives server kill hit",
    );
    assert.equal(killHit.payload.hp, 0);
    const reward = await bob.waitFor(
      (event) =>
        event.type === "reward:points" &&
        event.payload.enemyId === killHit.payload.enemyId,
      "receives kill reward",
    );
    assert.equal(reward.payload.amount, 100);
    assert.equal(reward.payload.transactionId, `kill:${mapId}:${killHit.payload.enemyId}`);
    await delay(200);
    assert.equal(
      bob.events.filter(
        (event) =>
          event.type === "reward:points" &&
          event.payload.enemyId === killHit.payload.enemyId,
      ).length,
      1,
    );

    alice.send({
      type: "chat:send",
      payload: { channel: "map", body: "hello from alice" },
    });
    const bobChat = await bob.waitFor(
      (event) =>
        event.type === "chat:message" &&
        event.payload.body === "hello from alice",
      "receives alice chat",
    );
    assert.equal(bobChat.payload.displayName, "Alice");

    spectator.close();
    alice.close();
    bob.close();
    console.log("Realtime room smoke passed.");
  } catch (error) {
    if (stderr) console.error(stderr);
    throw error;
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
