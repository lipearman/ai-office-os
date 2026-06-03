"use client";

import { useEffect, useRef } from "react";
import { X, ChevronLeft, MoreVertical, Zap } from "lucide-react";
import { useChatStore } from "@/store/chat";
import { usePresenceStore } from "@/store/presence";
import { useOfficeStore } from "@/store/office";
import { useWorkspaceStore } from "@/store/workspace";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ConversationList } from "./ConversationList";
import { AgentThinking } from "./AgentThinking";
import { cn } from "@/lib/utils";

const AGENT_EMOJI: Record<string, string> = {
  reception: "🤖", ceo: "👔", pm: "👔", ba: "📊",
  dev: "💻", dba: "🗄️", qa: "🔍", rag: "📚",
};

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { conversations, activeId, sending, setActive, sendMessageStream, fetchConversations, getActive } = useChatStore();
  const { agents } = useOfficeStore();
  const { current: workspace } = useWorkspaceStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = getActive();
  const activeAgent = agents.find((a) => a.id === activeConv?.agent_id);

  useEffect(() => {
    if (workspace && open) fetchConversations(workspace.id);
  }, [workspace, open, fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length, sending]);

  const handleSend = async (content: string) => {
    if (!activeId) return;
    await sendMessageStream(activeId, content);
  };

  return (
    <div className={cn(
      "fixed right-0 top-0 bottom-0 z-50 flex w-[440px] flex-col bg-[#0d0d1f]/96 border-l border-white/8 backdrop-blur-xl shadow-2xl transition-transform duration-300",
      open ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
        {activeId ? (
          <>
            <button onClick={() => setActive(null)} className="text-white/40 hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl">
              {AGENT_EMOJI[activeAgent?.agent_type ?? ""] ?? "🤖"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {activeConv?.title ?? activeAgent?.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {sending ? (
                  <>
                    <Zap size={10} className="text-yellow-400 animate-pulse" />
                    <span className="text-xs text-yellow-400">Thinking...</span>
                  </>
                ) : (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                    <span className="text-xs text-white/40 capitalize">{activeAgent?.status?.toLowerCase() ?? "online"}</span>
                  </>
                )}
              </div>
            </div>
            <button className="text-white/30 hover:text-white transition-colors">
              <MoreVertical size={16} />
            </button>
          </>
        ) : (
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Messages</p>
            <p className="text-xs text-white/40">{conversations.filter((c) => c.status === "active").length} conversations</p>
          </div>
        )}
        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors ml-1">
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {!activeId ? (
          <div className="h-full overflow-y-auto">
            <ConversationList />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto py-2">
              {activeConv?.messages
                .filter((m) => m.role !== "system" && m.role !== "SYSTEM")
                .map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    agentName={activeAgent?.name}
                    agentEmoji={AGENT_EMOJI[activeAgent?.agent_type ?? ""] ?? "🤖"}
                  />
                ))}
              {sending && (
                <AgentThinking
                  agentType={activeAgent?.agent_type}
                  agentName={activeAgent?.name}
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            <ChatInput
              conversationId={activeId}
              onSend={handleSend}
              disabled={sending}
            />
          </div>
        )}
      </div>
    </div>
  );
}
