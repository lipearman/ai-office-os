"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

// Mounts the WebSocket connection for the whole app session
export function WSProvider({ children }: { children: React.ReactNode }) {
  useWebSocket(); // side-effect only — establishes + maintains connection
  return <>{children}</>;
}
