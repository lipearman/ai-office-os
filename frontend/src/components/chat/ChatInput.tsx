"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

interface ChatInputProps {
  conversationId: string;
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ conversationId, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { send } = useWebSocket();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTyping = useCallback(
    (v: string) => {
      setValue(v);

      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
      }

      if (!isTyping) {
        setIsTyping(true);
        send({ type: "chat.typing", conversation_id: conversationId });
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        setIsTyping(false);
        send({ type: "chat.typing_stop", conversation_id: conversationId });
      }, 1500);
    },
    [conversationId, isTyping, send]
  );

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (typingTimer.current) clearTimeout(typingTimer.current);
    send({ type: "chat.typing_stop", conversation_id: conversationId });
    setIsTyping(false);
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/5 bg-black/30 px-4 py-3">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
        <button className="mb-1 shrink-0 text-white/30 hover:text-white/60 transition-colors">
          <Paperclip size={16} />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-50"
          style={{ minHeight: "24px", maxHeight: "140px" }}
        />

        <div className="mb-1 flex items-center gap-1.5 shrink-0">
          <button className="text-white/30 hover:text-white/60 transition-colors">
            <Mic size={16} />
          </button>
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
              value.trim() && !disabled
                ? "bg-primary-600 text-white hover:bg-primary-700 active:scale-95"
                : "bg-white/5 text-white/20"
            )}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-white/20">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
