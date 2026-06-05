"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
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

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-16 flex-col items-center border-r border-white/5 bg-white/2 py-4 lg:w-56 lg:items-start lg:px-3">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600">
          <span className="text-lg">🏢</span>
        </div>
        <span className="hidden text-sm font-semibold text-white lg:block">AI Office OS</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 w-full">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-primary-600/20 text-primary-400"
                : "text-white/50 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon size={18} className="shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="w-full border-t border-white/5 pt-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600/30 text-xs font-semibold text-primary-300">
            {user?.full_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-xs font-medium text-white">{user?.full_name}</p>
            <p className="truncate text-xs text-white/40">{user?.email}</p>
          </div>
          <button onClick={logout} className="hidden text-white/30 hover:text-red-400 lg:block" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
