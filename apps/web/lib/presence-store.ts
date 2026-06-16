export type PresencePlayer = {
  id: string;
  userId: string;
  displayName: string;
  mapId: string;
  seq: number;
  serverTimeMs: number;
  position: [number, number, number];
  velocity: [number, number, number];
  characterName: string | null;
  characterFileUrl: string | null;
  actionState: string;
  activeActionName: string | null;
  activeActionUrl: string | null;
  updatedAt: string;
};

type PresenceState = {
  players: Map<string, PresencePlayer>;
  seqByPlayer: Map<string, number>;
};

const globalPresenceState = globalThis as typeof globalThis & {
  control3dPresenceState?: PresenceState;
};

function getPresenceState() {
  if (!globalPresenceState.control3dPresenceState) {
    globalPresenceState.control3dPresenceState = {
      players: new Map(),
      seqByPlayer: new Map(),
    };
  }
  return globalPresenceState.control3dPresenceState;
}

function presenceKey(mapId: string, userId: string) {
  return `${mapId}:${userId}`;
}

export function upsertPresencePlayer(
  input: Omit<PresencePlayer, "id" | "seq" | "serverTimeMs" | "updatedAt">,
) {
  const state = getPresenceState();
  const id = presenceKey(input.mapId, input.userId);
  const seq = (state.seqByPlayer.get(id) ?? 0) + 1;
  state.seqByPlayer.set(id, seq);
  const player: PresencePlayer = {
    ...input,
    id,
    seq,
    serverTimeMs: Date.now(),
    updatedAt: new Date().toISOString(),
  };
  state.players.set(id, player);
  return player;
}

export function listPresencePlayers(mapId: string, excludeUserId?: string) {
  const state = getPresenceState();
  const staleBefore = Date.now() - 8000;

  for (const [key, player] of state.players) {
    if (new Date(player.updatedAt).getTime() < staleBefore) {
      state.players.delete(key);
      state.seqByPlayer.delete(key);
    }
  }

  return Array.from(state.players.values()).filter(
    (player) =>
      player.mapId === mapId &&
      (!excludeUserId || player.userId !== excludeUserId),
  );
}
