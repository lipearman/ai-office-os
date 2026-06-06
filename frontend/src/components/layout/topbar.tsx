"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import {
  LayoutDashboard,
  Users,
  Bot,
  Workflow,
  BookOpen,
  Settings,
  LogOut,
  Building2,
  Wrench,
  Brain,
  BarChart3,
  MessagesSquare,
  Shield,
  ChevronDown,
  Check,
  Grid2x2,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/office", icon: Building2, label: "Office" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/meeting", icon: MessagesSquare, label: "AI Meeting" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge" },
  { href: "/memory", icon: Brain, label: "Memory" },
  { href: "/observability", icon: BarChart3, label: "Observability" },
  { href: "/security", icon: Shield, label: "Security" },
  { href: "/team", icon: Users, label: "Team" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

// items below this index are grouped after a divider (account / config)
const DIVIDER_BEFORE = "/settings";

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { current } = useWorkspaceStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = navItems.find((n) => pathname.startsWith(n.href)) ?? navItems[0];
  const ActiveIcon = active.icon;

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-primary-500/20 bg-[#141228]/70 px-3 backdrop-blur-xl shadow-[0_6px_30px_-12px_rgba(34,211,238,0.3)] lg:px-4">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 pr-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 shadow-lg shadow-primary-500/30">
          <span className="text-lg">🏢</span>
        </div>
        <span className="hidden bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-sm font-bold tracking-wide text-transparent sm:block">
          AI Office OS
        </span>
      </Link>

      {/* Nav dropdown (Phaser-style) */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
            open
              ? "border-primary-400/40 bg-primary-600/20 text-white"
              : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          )}
        >
          <ActiveIcon size={16} className="text-primary-400" />
          <span>{active.label}</span>
          <ChevronDown
            size={15}
            className={cn("text-white/50 transition-transform", open && "rotate-180")}
          />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-primary-500/25 bg-[#221d3e]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname.startsWith(href);
              const divider = href === DIVIDER_BEFORE;
              return (
                <div key={href}>
                  {divider && <div className="my-1.5 h-px bg-white/10" />}
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary-600/25 text-white"
                        : "text-white/60 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    <Icon size={16} className={isActive ? "text-primary-400" : "text-white/50"} />
                    <span className="flex-1">{label}</span>
                    {isActive && <Check size={15} className="text-primary-400" />}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Workspace badge */}
      {current && (
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 md:flex">
          <Grid2x2 size={13} className="text-accent-400" />
          <span className="max-w-[140px] truncate">{current.name}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* User */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600/40 to-accent-500/30 text-xs font-semibold text-primary-200 ring-1 ring-white/10">
          {user?.full_name?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-xs font-medium leading-tight text-white">{user?.full_name}</p>
          <p className="truncate text-[11px] leading-tight text-white/40">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="ml-1 text-white/40 transition-colors hover:text-red-400"
          title="Logout"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
