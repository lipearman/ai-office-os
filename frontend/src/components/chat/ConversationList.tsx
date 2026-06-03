"use client";

import { formatDistanceToNow } from "date-fns";
import { useChatStore } from "@/store/chat";
import { cn } from "@/lib/utils";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", ba: "📊", dev: "💻",
  dba: "🗄️", qa: "🔍", rag: "📚",
};

export function ConversationList() {
  const { conversations, activeId, setActive } = useChatStore();
  const visible = conversations.filter((c) => c.status === "active");

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="text-3xl">💬</span>
        <p className="text-xs text-white/30">No conversations yet.<br />Click an agent in the office to chat.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {visible.map((conv) => {
        const lastMsg = [...conv.messages].reverse().find((m) => m.role !== "system");
        const isActive = conv.id === activeId;
        return (
          <button
            key={conv.id}
            onClick={() => setActive(conv.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl p-3 text-left transition-all",
              isActive ? "bg-primary-600/20 border border-primary-500/30" : "hover:bg-white/5 border border-transparent"
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl">
              {AGENT_EMOJI[conv.agent_id] ?? "🤖"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{conv.title ?? "Chat"}</p>
              <p className="truncate text-xs text-white/40">
                {lastMsg?.content ?? "No messages yet"}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-white/25">
              {formatDistanceToNow(new Date(conv.created_at), { addSuffix: true })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
