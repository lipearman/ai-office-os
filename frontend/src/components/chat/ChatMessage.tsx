import { format } from "date-fns";
import type { ChatMessage as Msg } from "@/store/chat";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Msg;
  agentName?: string;
  agentEmoji?: string;
}

export function ChatMessage({ message, agentName = "Agent", agentEmoji = "🤖" }: ChatMessageProps) {
  if (message.role === "system") return null;

  const isUser = message.role === "user";
  const time = format(new Date(message.created_at), "HH:mm");

  return (
    <div className={cn("flex items-end gap-2 px-4 py-1", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          isUser ? "bg-primary-600/40 text-primary-200" : "bg-white/10 text-white"
        )}
      >
        {isUser ? "U" : agentEmoji}
      </div>

      {/* Bubble */}
      <div className={cn("flex max-w-[72%] flex-col gap-1", isUser && "items-end")}>
        {!isUser && (
          <span className="px-1 text-xs text-white/40">{agentName}</span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-br-sm bg-primary-600 text-white"
              : "rounded-bl-sm bg-white/8 text-white/90",
            message.streaming && "after:ml-0.5 after:inline-block after:h-4 after:w-0.5 after:animate-pulse after:bg-white/60 after:align-middle after:content-['']"
          )}
        >
          {message.content || (message.streaming ? " " : "")}
        </div>
        <span className="px-1 text-[10px] text-white/25">{time}</span>
      </div>
    </div>
  );
}
