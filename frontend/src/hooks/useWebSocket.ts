"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { usePresenceStore } from "@/store/presence";
import { useNotificationStore } from "@/store/notification";
import { useOfficeStore } from "@/store/office";

type WSEvent = Record<string, unknown> & { type: string };
type Handler = (e: WSEvent) => void;

// ─── Singleton WebSocket Manager ────────────────────────────────────────────
// Lives for the entire browser session — React effects only register/remove
// event handlers, they never open/close the socket directly.

const handlers = new Map<string, Set<Handler>>();

class WSManager {
  private _ws: WebSocket | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _token: string | null = null;
  private _wsId: string | null = null;
  private _intentionalClose = false;

  private _alive() {
    return (
      this._ws !== null &&
      (this._ws.readyState === WebSocket.OPEN ||
       this._ws.readyState === WebSocket.CONNECTING)
    );
  }

  connect(token: string, workspaceId: string) {
    // Same connection already alive — do nothing
    if (this._token === token && this._wsId === workspaceId && this._alive()) return;

    this._token = token;
    this._wsId = workspaceId;
    this._intentionalClose = false;
    this._open();
  }

  private _open() {
    if (this._alive()) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }

    // default to same-origin (wss?://<current host>) so WS works behind a tunnel
    // via the Next /ws rewrite; override with NEXT_PUBLIC_WS_URL if set.
    const wsBase = process.env.NEXT_PUBLIC_WS_URL
      || (typeof window !== "undefined"
            ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
            : "ws://localhost:8000");
    const url = `${wsBase}/ws/${this._wsId}?token=${this._token}`;
    const ws = new WebSocket(url);
    this._ws = ws;

    ws.onopen = () => {
      if (this._ws !== ws) return;
      this._emit({ type: "ws.connected" });
    };

    ws.onmessage = (e) => {
      if (this._ws !== ws) return;
      try { this._emit(JSON.parse(e.data)); } catch { /* noop */ }
    };

    ws.onclose = () => {
      if (this._ws !== ws) return;
      this._ws = null;
      this._emit({ type: "ws.disconnected" });
      if (!this._intentionalClose) {
        this._timer = setTimeout(() => this._open(), 3000);
      }
    };

    ws.onerror = () => {
      if (this._ws === ws) ws.close();
    };
  }

  disconnect() {
    this._intentionalClose = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
      this._ws = null;
    }
    this._token = null;
    this._wsId = null;
  }

  send(data: object) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  private _emit(event: WSEvent) {
    handlers.get(event.type)?.forEach((h) => h(event));
    handlers.get("*")?.forEach((h) => h(event));
  }

  on(type: string, handler: Handler) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
  }

  off(type: string, handler: Handler) {
    handlers.get(type)?.delete(handler);
  }
}

export const wsManager = new WSManager();

// ─── React Hook ─────────────────────────────────────────────────────────────
// Responsibility:
//  1. Call wsManager.connect() when token + workspace are available
//  2. Wire built-in event handlers (presence, notifications, agent status)
//  3. Expose send() and on() for other hooks/components

export function useWebSocket() {
  const { access_token } = useAuthStore();
  const { current: workspace } = useWorkspaceStore();
  const presence = usePresenceStore();
  const notify = useNotificationStore();

  // Connect / reconnect when credentials change
  useEffect(() => {
    if (!access_token || !workspace) return;
    wsManager.connect(access_token, workspace.id);
    // No cleanup — the manager stays alive; logout handles disconnect
  }, [access_token, workspace]);

  // Built-in event handlers — registered once, stable references
  useEffect(() => {
    const onList = (e: WSEvent) => presence.setOnline((e.users as string[]) ?? []);
    const onJoin = (e: WSEvent) => presence.addUser(e.user_id as string);
    const onLeave = (e: WSEvent) => presence.removeUser(e.user_id as string);
    const onTyping = (e: WSEvent) => presence.setTyping(e.user_id as string, e.conversation_id as string);
    const onTypingStop = (e: WSEvent) => presence.clearTyping(e.user_id as string);
    const onAgentStatus = (e: WSEvent) => {
      const store = useOfficeStore.getState();
      const agent = store.agents.find((a) => a.id === e.agent_id);
      if (agent) agent.status = e.status as any;
    };
    const onNotification = (e: WSEvent) =>
      notify.push({ level: (e.level as any) ?? "info", message: e.message as string, title: e.title as string | undefined });

    wsManager.on("presence.list",    onList);
    wsManager.on("presence.join",    onJoin);
    wsManager.on("presence.leave",   onLeave);
    wsManager.on("chat.typing",      onTyping);
    wsManager.on("chat.typing_stop", onTypingStop);
    wsManager.on("agent.status",     onAgentStatus);
    wsManager.on("notification",     onNotification);

    return () => {
      wsManager.off("presence.list",    onList);
      wsManager.off("presence.join",    onJoin);
      wsManager.off("presence.leave",   onLeave);
      wsManager.off("chat.typing",      onTyping);
      wsManager.off("chat.typing_stop", onTypingStop);
      wsManager.off("agent.status",     onAgentStatus);
      wsManager.off("notification",     onNotification);
    };
  }, [presence, notify]);

  const send = useCallback((data: object) => wsManager.send(data), []);
  const on   = useCallback((type: string, handler: Handler) => {
    wsManager.on(type, handler);
    return () => wsManager.off(type, handler);
  }, []);

  return { send, on };
}
