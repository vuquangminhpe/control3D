"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  realtimeJoinIntentSchema,
  realtimeServerEventSchema,
  type RealtimeCombatAttack,
  type RealtimePresencePlayer,
  type RealtimeWorldSnapshot,
} from "@control3d/shared/schemas/realtime";
import { useGameStore } from "@/store/gameStore";
import type { GameChatMessage } from "./GameChatPanel";

type UseRealtimeGameRoomInput = {
  active: boolean;
  mapId: string | null | undefined;
  playerPosition: [number, number, number];
  playerVelocity: [number, number, number];
  characterId: string | null;
  characterName: string | null;
  characterFileUrl: string | null;
  actionState: string;
  activeActionName: string | null;
  activeActionUrl: string | null;
};

type PresencePayload = {
  position: [number, number, number];
  velocity: [number, number, number];
  characterName: string | null;
  characterFileUrl: string | null;
  actionState: string;
  activeActionName: string | null;
  activeActionUrl: string | null;
};

function upsertPlayer(
  players: RealtimePresencePlayer[],
  nextPlayer: RealtimePresencePlayer,
) {
  const index = players.findIndex((player) => player.id === nextPlayer.id);
  if (index < 0) return [...players, nextPlayer];
  if ((nextPlayer.seq ?? 0) <= (players[index].seq ?? 0)) return players;
  const nextPlayers = [...players];
  nextPlayers[index] = nextPlayer;
  return nextPlayers;
}

function vectorChanged(
  current: [number, number, number],
  previous: [number, number, number],
  epsilon: number,
) {
  return (
    Math.abs(current[0] - previous[0]) > epsilon ||
    Math.abs(current[1] - previous[1]) > epsilon ||
    Math.abs(current[2] - previous[2]) > epsilon
  );
}

function presenceChanged(current: PresencePayload, previous: PresencePayload) {
  return (
    vectorChanged(current.position, previous.position, 0.025) ||
    vectorChanged(current.velocity, previous.velocity, 0.05) ||
    current.characterName !== previous.characterName ||
    current.characterFileUrl !== previous.characterFileUrl ||
    current.actionState !== previous.actionState ||
    current.activeActionName !== previous.activeActionName ||
    current.activeActionUrl !== previous.activeActionUrl
  );
}

export function useRealtimeGameRoom({
  active,
  mapId,
  playerPosition,
  playerVelocity,
  characterId,
  characterName,
  characterFileUrl,
  actionState,
  activeActionName,
  activeActionUrl,
}: UseRealtimeGameRoomInput) {
  const socketRef = useRef<WebSocket | null>(null);
  const positionRef = useRef(playerPosition);
  const velocityRef = useRef(playerVelocity);
  const presenceMetaRef = useRef({
    characterName,
    characterFileUrl,
    actionState,
    activeActionName,
    activeActionUrl,
  });
  const remotePlayersRef = useRef<RealtimePresencePlayer[]>([]);
  const remotePlayersFrameRef = useRef<number | null>(null);
  const selfUserIdRef = useRef<string | null>(null);
  const worldSnapshotRef = useRef<RealtimeWorldSnapshot | null>(null);
  const lastSentPresenceRef = useRef<{
    payload: PresencePayload;
    sentAt: number;
  } | null>(null);
  const [connected, setConnected] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<RealtimePresencePlayer[]>([]);
  const [worldSnapshot, setWorldSnapshot] = useState<RealtimeWorldSnapshot | null>(null);
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [selfDisplayName, setSelfDisplayName] = useState("Player");

  useEffect(() => {
    positionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    velocityRef.current = playerVelocity;
  }, [playerVelocity]);

  useEffect(() => {
    presenceMetaRef.current = {
      characterName,
      characterFileUrl,
      actionState,
      activeActionName,
      activeActionUrl,
    };
  }, [actionState, activeActionName, activeActionUrl, characterFileUrl, characterName]);

  const commitRemotePlayersSoon = useCallback(() => {
    if (remotePlayersFrameRef.current !== null) return;
    remotePlayersFrameRef.current = window.requestAnimationFrame(() => {
      remotePlayersFrameRef.current = null;
      setRemotePlayers([...remotePlayersRef.current]);
    });
  }, []);

  const replaceRemotePlayers = useCallback((players: RealtimePresencePlayer[]) => {
    remotePlayersRef.current = players;
    setRemotePlayers(players);
  }, []);

  const updateRemotePlayer = useCallback(
    (nextPlayer: RealtimePresencePlayer) => {
      remotePlayersRef.current = upsertPlayer(remotePlayersRef.current, nextPlayer);
      commitRemotePlayersSoon();
    },
    [commitRemotePlayersSoon],
  );

  const removeRemotePlayer = useCallback(
    (playerId: string) => {
      remotePlayersRef.current = remotePlayersRef.current.filter(
        (player) => player.id !== playerId,
      );
      commitRemotePlayersSoon();
    },
    [commitRemotePlayersSoon],
  );

  useEffect(() => {
    if (!active || !mapId || mapId === "empty-map") {
      socketRef.current?.close();
      socketRef.current = null;
      selfUserIdRef.current = null;
      useGameStore.getState().clearServerPointSnapshot();
      setConnected(false);
      replaceRemotePlayers([]);
      worldSnapshotRef.current = null;
      setWorldSnapshot(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    let heartbeat: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let socket: WebSocket | null = null;
    const roomMapId = mapId;

    const clearHeartbeat = () => {
      if (heartbeat) {
        window.clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      const delayMs = Math.min(10_000, 500 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delayMs);
    };

    async function connect() {
      try {
        const response = await fetch(
          `/api/maps/${encodeURIComponent(roomMapId)}/join-intent`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ characterId }),
          },
        );
        const payload = await response.json().catch(() => null);
        const parsed = realtimeJoinIntentSchema.safeParse(payload?.data);
        if (!response.ok || !payload?.success || !parsed.success || cancelled) {
          throw new Error(payload?.error ?? "Unable to join realtime room");
        }

        const wsUrl = new URL("/rooms/game", parsed.data.realtimeUrl);
        wsUrl.searchParams.set("token", parsed.data.joinToken);
        const nextSocket = new WebSocket(wsUrl);
        socket = nextSocket;
        socketRef.current = nextSocket;
        useGameStore.getState().clearServerPointSnapshot();

        nextSocket.onopen = () => {
          reconnectAttempts = 0;
          setConnected(true);
          lastSentPresenceRef.current = null;
          const sendPresence = () => {
            if (!nextSocket || nextSocket.readyState !== WebSocket.OPEN) return;
            const payload: PresencePayload = {
              position: positionRef.current,
              velocity: velocityRef.current,
              characterName: presenceMetaRef.current.characterName,
              characterFileUrl: presenceMetaRef.current.characterFileUrl,
              actionState: presenceMetaRef.current.actionState,
              activeActionName: presenceMetaRef.current.activeActionName,
              activeActionUrl: presenceMetaRef.current.activeActionUrl,
            };
            const previous = lastSentPresenceRef.current;
            const now = Date.now();
            const shouldSend =
              !previous ||
              now - previous.sentAt > 1_000 ||
              presenceChanged(payload, previous.payload);
            if (!shouldSend) return;

            lastSentPresenceRef.current = { payload, sentAt: now };
            nextSocket.send(
              JSON.stringify({
                type: "presence:update",
                payload,
              }),
            );
          };
          sendPresence();
          clearHeartbeat();
          heartbeat = window.setInterval(sendPresence, 100);
        };

        nextSocket.onmessage = (event) => {
          let raw: unknown;
          try {
            raw = JSON.parse(event.data);
          } catch {
            return;
          }
          const parsedEvent = realtimeServerEventSchema.safeParse(raw);
          if (!parsedEvent.success) return;
          const serverEvent = parsedEvent.data;

          if (serverEvent.type === "room:joined") {
            selfUserIdRef.current = serverEvent.payload.self.userId;
            setSelfDisplayName(serverEvent.payload.self.displayName);
            replaceRemotePlayers(serverEvent.payload.players);
            setMessages(serverEvent.payload.messages);
            return;
          }
          if (serverEvent.type === "presence:update") {
            updateRemotePlayer(serverEvent.payload);
            return;
          }
          if (serverEvent.type === "presence:left") {
            removeRemotePlayer(serverEvent.payload.id);
            return;
          }
          if (serverEvent.type === "chat:message") {
            setMessages((current) => [...current.slice(-59), serverEvent.payload]);
            return;
          }
          if (serverEvent.type === "combat:hit") {
            const enemy = worldSnapshotRef.current?.enemies.find(
              (entry) => entry.id === serverEvent.payload.enemyId,
            );
            if (enemy) {
              useGameStore.getState().addDamageNumber(
                serverEvent.payload.damage,
                [enemy.position[0], enemy.position[1] + 2.1, enemy.position[2]],
                false,
              );
            }
            return;
          }
          if (serverEvent.type === "world:snapshot") {
            worldSnapshotRef.current = serverEvent.payload;
            setWorldSnapshot(serverEvent.payload);
            return;
          }
          if (serverEvent.type === "reward:points") {
            if (serverEvent.payload.userId === selfUserIdRef.current) {
              useGameStore.getState().applyServerPointReward(serverEvent.payload);
            }
            return;
          }
          if (serverEvent.type === "player:damage") {
            if (serverEvent.payload.userId === selfUserIdRef.current) {
              useGameStore.getState().applyServerPlayerDamage(serverEvent.payload);
            }
          }
        };

        nextSocket.onclose = () => {
          setConnected(false);
          clearHeartbeat();
          if (socketRef.current === nextSocket) {
            socketRef.current = null;
            scheduleReconnect();
          }
        };
        nextSocket.onerror = () => {
          setConnected(false);
        };
      } catch {
        if (!cancelled) {
          setConnected(false);
          scheduleReconnect();
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      clearHeartbeat();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (remotePlayersFrameRef.current !== null) {
        window.cancelAnimationFrame(remotePlayersFrameRef.current);
        remotePlayersFrameRef.current = null;
      }
      socket?.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      lastSentPresenceRef.current = null;
      selfUserIdRef.current = null;
      worldSnapshotRef.current = null;
      setWorldSnapshot(null);
      setConnected(false);
    };
  }, [active, characterId, mapId, removeRemotePlayer, replaceRemotePlayers, updateRemotePlayer]);

  const sendMessage = useCallback(async (body: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime room is not connected.");
    }
    socket.send(
      JSON.stringify({
        type: "chat:send",
        payload: { channel: "map", body },
      }),
    );
  }, []);

  const sendCombatAttack = useCallback(async (attack: RealtimeCombatAttack) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime room is not connected.");
    }
    socket.send(
      JSON.stringify({
        type: "combat:attack",
        payload: attack,
      }),
    );
  }, []);

  return {
    connected,
    remotePlayers,
    worldSnapshot,
    messages,
    selfDisplayName,
    sendMessage,
    sendCombatAttack,
  };
}
