"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { TopBar } from "@/components/layout/topbar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { NotificationStack } from "@/components/notifications/NotificationStack";
import { WSProvider } from "@/components/providers/WSProvider";
import { MessageSquare } from "lucide-react";
import { useChatStore } from "@/store/chat";
import { cn } from "@/lib/utils";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const { conversations } = useChatStore();
  const { fetch: fetchWorkspaces, current } = useWorkspaceStore();
  const unread = conversations.filter((c) => c.status === "active").length;

  // Fetch workspaces once on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Listen for chat open requests from RoomPanel
  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent">
      <TopBar />

      <main className="relative flex-1 overflow-auto p-6">
        {children}
      </main>

      {/* Chat toggle button */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all",
          chatOpen
            ? "bg-white/10 text-white/60 hover:bg-white/15"
            : "bg-primary-600 text-white hover:bg-primary-700"
        )}
        title="Messages"
      >
        <MessageSquare size={20} />
        {unread > 0 && !chatOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <NotificationStack />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // the persisted auth store rehydrates AFTER the first client render, so
  // isAuthenticated starts false on every hard reload / deep link. Redirect only
  // when there is also no stored token — with a token present we render nothing
  // and wait for rehydration (an *invalid* token still lands on /login via the
  // API 401 interceptor).
  useEffect(() => {
    if (!isAuthenticated && !localStorage.getItem("access_token")) router.replace("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <WSProvider>
      <DashboardShell>{children}</DashboardShell>
    </WSProvider>
  );
}
