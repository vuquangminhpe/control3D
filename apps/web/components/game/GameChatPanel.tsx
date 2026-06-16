"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { chatSendSchema } from "@control3d/shared/schemas/chat";
import { useGameChatPanelState } from "./useGameChatPanelState";

export type GameChatMessage = {
  id: string;
  userId?: string;
  displayName: string;
  body: string;
  channel?: "map" | "party" | "system";
  isDeleted?: boolean;
  createdAt: string;
};

type GameChatPanelProps = {
  messages?: GameChatMessage[];
  connected?: boolean;
  displayName?: string;
  storageKey?: string;
  onSendMessage?: (body: string) => Promise<void> | void;
  onReportMessage?: (messageId: string) => Promise<void> | void;
};

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function GameChatPanel({
  messages,
  connected = false,
  displayName = "You",
  storageKey,
  onSendMessage,
  onReportMessage,
}: GameChatPanelProps) {
  const { uiState, actions } = useGameChatPanelState(storageKey);
  const [localMessages, setLocalMessages] = useState<GameChatMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const visibleMessages = messages ?? localMessages;
  const isCollapsed = uiState.mode === "collapsed";
  const isExpanded = uiState.mode === "expanded";
  const statusText = connected ? "Online" : onSendMessage ? "Disconnected" : "Local preview";
  const canSend =
    (!onSendMessage || connected) && !sending && Boolean(uiState.draft.trim());
  const unreadCount = isCollapsed
    ? Math.max(0, visibleMessages.length - lastSeenCount)
    : 0;

  const panelStyle = useMemo(
    () =>
      ({
        "--chat-panel-width": `${uiState.width}px`,
        "--chat-panel-height": `${uiState.height}px`,
      }) as CSSProperties,
    [uiState.height, uiState.width],
  );

  useEffect(() => {
    if (!isCollapsed) {
      setLastSeenCount(visibleMessages.length);
    }
  }, [isCollapsed, visibleMessages.length]);

  useEffect(() => {
    if (isCollapsed) return;
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isCollapsed, visibleMessages.length]);

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCollapsed) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = uiState.width;
    const startHeight = uiState.height;

    const handleMove = (moveEvent: PointerEvent) => {
      actions.setSize(
        startWidth - (moveEvent.clientX - startX),
        startHeight - (moveEvent.clientY - startY),
      );
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const sendMessage = async () => {
    const parsed = chatSendSchema.safeParse({
      channel: "map",
      body: uiState.draft,
    });

    if (!parsed.success) {
      setError("Message must be 1-300 characters.");
      return;
    }

    setSending(true);
    setError("");

    try {
      if (onSendMessage) {
        await onSendMessage(parsed.data.body);
      } else {
        setLocalMessages((current) => [
          ...current,
          {
            id: `local-chat-${Date.now()}`,
            displayName,
            body: parsed.data.body,
            channel: "map",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      actions.setDraft("");
    } catch {
      setError("Could not send message.");
    } finally {
      setSending(false);
    }
  };

  if (isCollapsed) {
    return (
      <aside
        className="game-chat-panel collapsed"
        style={panelStyle}
        aria-label="Game chat"
      >
        <button
          className="game-chat-collapsed-button"
          type="button"
          onClick={() => actions.setMode("compact")}
          title="Open chat"
        >
          <span>Chat</span>
          {unreadCount ? <strong>{Math.min(unreadCount, 99)}</strong> : null}
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`game-chat-panel ${uiState.mode}`}
      style={panelStyle}
      aria-label="Game chat"
    >
      <button
        className="game-chat-resize"
        type="button"
        onPointerDown={handleResizeStart}
        title="Resize chat"
        aria-label="Resize chat"
      />
      <header className="game-chat-header">
        <div>
          <strong>Map chat</strong>
          <span>{statusText}</span>
        </div>
        <div className="game-chat-actions">
          <button
            type="button"
            onClick={() => actions.toggleExpanded()}
            title={isExpanded ? "Compact chat" : "Expand chat"}
          >
            {isExpanded ? "_" : "+"}
          </button>
          <button
            type="button"
            onClick={() => actions.setMode("collapsed")}
            title="Collapse chat"
          >
            -
          </button>
        </div>
      </header>

      <div className="game-chat-messages" ref={scrollRef}>
        {visibleMessages.length ? (
          visibleMessages.map((message) => (
            <article
              className={`game-chat-message ${message.channel ?? "map"}`}
              key={message.id}
            >
              <span className="game-chat-avatar">
                {getInitials(message.displayName) || "U"}
              </span>
              <div className="game-chat-message-body">
                <div className="game-chat-message-meta">
                  <strong>{message.displayName}</strong>
                  <time>{formatChatTime(message.createdAt)}</time>
                  {message.channel === "system" ? <em>System</em> : null}
                </div>
                <p>{message.isDeleted ? "Message removed." : message.body}</p>
              </div>
              {onReportMessage && !message.isDeleted ? (
                <button
                  className="game-chat-report"
                  type="button"
                  onClick={() => void onReportMessage(message.id)}
                  title="Report message"
                >
                  !
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p className="game-chat-empty">No messages yet.</p>
        )}
      </div>

      <footer className="game-chat-compose">
        {error ? <span className="game-chat-error">{error}</span> : null}
        <textarea
          value={uiState.draft}
          maxLength={300}
          onChange={(event) => actions.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Type a message"
          disabled={Boolean(onSendMessage) && !connected}
          rows={isExpanded ? 3 : 2}
        />
        <div>
          <span>{uiState.draft.length}/300</span>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend}
          >
            Send
          </button>
        </div>
      </footer>
    </aside>
  );
}
