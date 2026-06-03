"use client";

import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useNotificationStore, type NotificationLevel } from "@/store/notification";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationLevel, React.ReactNode> = {
  success: <CheckCircle size={16} />,
  error: <AlertCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

const STYLES: Record<NotificationLevel, string> = {
  success: "border-green-500/30 bg-green-500/10 text-green-300",
  error:   "border-red-500/30   bg-red-500/10   text-red-300",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  info:    "border-blue-500/30  bg-blue-500/10  text-blue-300",
};

export function NotificationStack() {
  const { items, dismiss } = useNotificationStore();

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 w-80">
      {items.map((n) => (
        <div
          key={n.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-xl animate-slide-up",
            STYLES[n.level]
          )}
        >
          <span className="shrink-0 mt-0.5">{ICONS[n.level]}</span>
          <div className="min-w-0 flex-1">
            {n.title && <p className="text-xs font-semibold mb-0.5">{n.title}</p>}
            <p className="text-xs opacity-90">{n.message}</p>
          </div>
          <button onClick={() => dismiss(n.id)} className="shrink-0 opacity-50 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
