"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { usePresenceStore } from "@/store/presence";
import { useNotificationStore } from "@/store/notification";
import { useOfficeStore } from "@/store/office";

type WSEvent = Record<string, unknown> & { type: string };
type Handler = (e: WSEvent) => void;

let socketRef: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Map<string, Set<Handler>>();

function emit(event: WSEvent) {
  const set = handlers.get(event.type);
  if (set) set.forEach((h) => h(event));
  const all = handlers.get("*");
  if (all) all.forEach((h) => h(event));
}

export function useWebSocket() {
  const { access_token } = useAuthStore();
  const { current: workspace } = useWorkspaceStore();
  const presence = usePresenceStore();
  const notify = useNotificationStore();
  const { agents } = useOfficeStore();
  const connectedRef = useRef(false);

  const connect = useCallback(() => {
    if (!access_token || !workspace) return;
    if (socketRef?.readyState === WebSocket.OPEN) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    const url = `${wsUrl}/ws/${workspace.id}?token=${access_token}`;

    socketRef = new WebSocket(url);

    socketRef.onopen = () => {
      connectedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    socketRef.onmessage = (e) => {
      try {
        const data: WSEvent = JSON.parse(e.data);
        emit(data);

        // Handle built-in events
        switch (data.type) {
          case "presence.list":
            presence.setOnline((data.users as string[]) ?? []);
            break;
          case "presence.join":
            presence.addUser(data.user_id as string);
            break;
          case "presence.leave":
            presence.removeUser(data.user_id as string);
            break;
          case "chat.typing":
            presence.setTyping(data.user_id as string, data.conversation_id as string);
            break;
          case "chat.typing_stop":
            presence.clearTyping(data.user_id as string);
            break;
          case "agent.status": {
            const officeStore = useOfficeStore.getState();
            officeStore.agents.find((a) => a.id === data.agent_id);
            break;
          }
          case "notification":
            notify.push({
              level: (data.level as any) ?? "info",
              message: data.message as string,
              title: data.title as string | undefined,
            });
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    socketRef.onclose = () => {
      connectedRef.current = false;
      reconnectTimer = setTimeout(connect, 3000);
    };

    socketRef.onerror = () => {
      socketRef?.close();
    };
  }, [access_token, workspace]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef?.close();
      socketRef = null;
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (socketRef?.readyState === WebSocket.OPEN) {
      socketRef.send(JSON.stringify(data));
    }
  }, []);

  const on = useCallback((type: string, handler: Handler) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
    return () => handlers.get(type)?.delete(handler);
  }, []);

  return { send, on };
}
