"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { useOfficeStore } from "@/store/office";
import { useChatStore } from "@/store/chat";
import {
  LayoutDashboard, Users, Bot, Workflow, BookOpen,
  Settings, LogOut, Building2, Wrench, Brain, BarChart3,
  MessagesSquare, Shield, ChevronDown, Check,
  Search, Bell, LayoutGrid, User, Cpu,
} from "lucide-react";

const navItems = [
  { href: "/dashboard",    icon: LayoutDashboard, label: "Dashboard" },
  { href: "/office",       icon: Building2,       label: "Office" },
  { href: "/agents",       icon: Bot,             label: "Agents" },
  { href: "/meeting",      icon: MessagesSquare,  label: "AI Meeting" },
  { href: "/tools",        icon: Wrench,          label: "Tools" },
  { href: "/workflows",    icon: Workflow,        label: "Workflows" },
  { href: "/knowledge",    icon: BookOpen,        label: "Knowledge" },
  { href: "/memory",       icon: Brain,           label: "Memory" },
  { href: "/observability",icon: BarChart3,       label: "Observability" },
  { href: "/security",     icon: Shield,          label: "Security" },
  { href: "/team",         icon: Users,           label: "Team" },
  { href: "/settings",     icon: Settings,        label: "Settings" },
];

const DIVIDER_BEFORE = "/settings";

function useOutsideClick(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}

export function TopBar() {
  const pathname    = usePathname();
  const { user, logout } = useAuthStore();
  const { current } = useWorkspaceStore();
  const { agents }  = useOfficeStore();
  const { conversations } = useChatStore();

  const [navOpen,  setNavOpen]  = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const navRef  = useRef<HTMLDivElement>(null!);
  const userRef = useRef<HTMLDivElement>(null!);

  useOutsideClick(navRef,  () => setNavOpen(false));
  useOutsideClick(userRef, () => setUserOpen(false));

  const active     = navItems.find((n) => pathname.startsWith(n.href)) ?? navItems[0];
  const ActiveIcon = active.icon;

  // agents that are not offline
  const onlineCount = agents.filter(
    (a) => (a.status ?? "").toUpperCase() !== "OFFLINE"
  ).length;

  // active (unresolved) conversations → notification badge
  const notifCount = conversations.filter(
    (c) => c.status.toUpperCase() === "ACTIVE"
  ).length;

  const initials = user?.full_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    ?? user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header
      className="z-30 flex h-14 shrink-0 items-center gap-2 px-3 lg:px-4"
      style={{
        background: "linear-gradient(90deg, #13103d 0%, #1a1040 60%, #0f1835 100%)",
        borderBottom: "1px solid rgba(139,92,246,0.22)",
        boxShadow: "0 2px 20px -4px rgba(124,58,237,0.25)",
      }}
    >
      {/* ── Logo ── */}
      <Link href="/dashboard" className="flex items-center gap-2.5 mr-1 shrink-0">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg,#ff2d75 0%,#7c3aed 100%)" }}
        >
          AO
        </div>
        <span
          className="hidden text-[13px] font-extrabold tracking-[0.18em] text-white sm:block"
          style={{ textShadow: "0 0 18px rgba(255,45,117,0.55)" }}
        >
          AI OFFICE
        </span>
      </Link>

      {/* ── Search ── */}
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        title="Search"
      >
        <Search size={16} />
      </button>

      {/* ── Nav dropdown ── */}
      <div className="relative shrink-0" ref={navRef}>
        <button
          onClick={() => setNavOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition",
            navOpen
              ? "border-purple-500/40 bg-purple-700/25 text-white"
              : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
          )}
        >
          <ActiveIcon size={15} className="text-purple-400" />
          <span>{active.label}</span>
          <ChevronDown
            size={14}
            className={cn("text-white/40 transition-transform", navOpen && "rotate-180")}
          />
        </button>

        {navOpen && (
          <div className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-purple-500/20 p-1.5 shadow-2xl backdrop-blur-xl"
            style={{ background: "rgba(26,16,64,0.97)" }}>
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname.startsWith(href);
              return (
                <div key={href}>
                  {href === DIVIDER_BEFORE && <div className="my-1.5 h-px bg-white/10" />}
                  <Link
                    href={href}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-purple-700/30 text-white"
                        : "text-white/55 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    <Icon size={15} className={isActive ? "text-purple-400" : "text-white/40"} />
                    <span className="flex-1">{label}</span>
                    {isActive && <Check size={14} className="text-purple-400" />}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Online agents badge ── */}
      <div
        className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs md:flex"
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            onlineCount > 0
              ? "bg-green-400 shadow-[0_0_8px_#4ade80]"
              : "bg-gray-500"
          )}
        />
        <span className="font-bold" style={{ color: onlineCount > 0 ? "#4ade80" : "#6b7280" }}>
          {onlineCount} agents
        </span>
        <span className="text-white/35 font-medium tracking-widest text-[10px]">ONLINE</span>
      </div>

      {/* ── Workspace name (small) ── */}
      {current && (
        <div className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-3 py-1.5 text-[11px] text-white/45 xl:flex">
          <Cpu size={11} className="text-purple-400" />
          <span className="max-w-[120px] truncate">{current.name}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Right icons ── */}
      <div className="flex items-center gap-0.5">

        {/* Layout grid */}
        <Link
          href="/workflows"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          title="Workflows"
        >
          <LayoutGrid size={16} />
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition",
            pathname.startsWith("/settings")
              ? "bg-purple-700/30 text-purple-300"
              : "text-white/50 hover:bg-white/10 hover:text-white"
          )}
          title="Settings"
        >
          <Settings size={16} />
        </Link>

        {/* Bell + notification badge */}
        <Link
          href="/meeting"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          title="Conversations"
        >
          <Bell size={16} />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white shadow-lg">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </Link>

        {/* User avatar + dropdown */}
        <div className="relative ml-1" ref={userRef}>
          <button
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-xl px-1.5 py-1 transition hover:bg-white/10"
          >
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                className="h-7 w-7 rounded-full object-cover ring-1 ring-purple-500/50"
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-1 ring-purple-500/40"
                style={{ background: "linear-gradient(135deg,#ff2d75,#7c3aed)" }}
              >
                {initials}
              </div>
            )}
            <ChevronDown
              size={13}
              className={cn("text-white/40 transition-transform", userOpen && "rotate-180")}
            />
          </button>

          {userOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-purple-500/20 shadow-2xl backdrop-blur-xl"
              style={{ background: "rgba(26,16,64,0.97)" }}
            >
              {/* user info */}
              <div className="border-b border-white/8 px-4 py-3">
                <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
                <p className="truncate text-[11px] text-white/40">{user?.email}</p>
              </div>

              <div className="p-1.5">
                <Link
                  href="/settings"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/8 hover:text-white"
                >
                  <User size={14} className="text-white/40" />
                  Profile & Settings
                </Link>

                <button
                  onClick={() => { setUserOpen(false); logout(); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-red-500/10 hover:text-red-400"
                >
                  <LogOut size={14} className="text-white/40" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
