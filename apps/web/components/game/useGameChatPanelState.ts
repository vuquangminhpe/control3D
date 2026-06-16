"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  chatPanelUiStateSchema,
  type ChatPanelMode,
  type ChatPanelUiState,
} from "@control3d/shared/schemas/chat";

const DEFAULT_STORAGE_KEY = "control3d:game-chat-panel";
const DEFAULT_CHAT_PANEL_UI_STATE = chatPanelUiStateSchema.parse({});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeChatPanelState(input: unknown): ChatPanelUiState {
  const parsed = chatPanelUiStateSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_CHAT_PANEL_UI_STATE;
}

export function useGameChatPanelState(storageKey = DEFAULT_STORAGE_KEY) {
  const [uiState, setUiState] = useState<ChatPanelUiState>(
    DEFAULT_CHAT_PANEL_UI_STATE,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      setUiState(
        rawValue
          ? normalizeChatPanelState(JSON.parse(rawValue))
          : DEFAULT_CHAT_PANEL_UI_STATE,
      );
    } catch {
      setUiState(DEFAULT_CHAT_PANEL_UI_STATE);
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(uiState));
  }, [hydrated, storageKey, uiState]);

  const actions = useMemo(
    () => ({
      setMode: (mode: ChatPanelMode) =>
        setUiState((current) => ({ ...current, mode })),
      setDraft: (draft: string) =>
        setUiState((current) => ({ ...current, draft: draft.slice(0, 300) })),
      setSize: (width: number, height: number) =>
        setUiState((current) => ({
          ...current,
          width: clamp(Math.round(width), 300, 560),
          height: clamp(Math.round(height), 220, 720),
        })),
      toggleCollapsed: () =>
        setUiState((current) => ({
          ...current,
          mode: current.mode === "collapsed" ? "compact" : "collapsed",
        })),
      toggleExpanded: () =>
        setUiState((current) => ({
          ...current,
          mode: current.mode === "expanded" ? "compact" : "expanded",
        })),
    }),
    [],
  );

  const reset = useCallback(() => {
    setUiState(DEFAULT_CHAT_PANEL_UI_STATE);
  }, []);

  return { uiState, actions, reset };
}
