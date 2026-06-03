"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/store/workspace";
import { useOfficeStore } from "@/store/office";
import { RoomPanel } from "@/components/office/RoomPanel";
import { OfficeToolbar } from "@/components/office/OfficeToolbar";

// Dynamic import — Three.js cannot run on SSR
const OfficeScene = dynamic(
  () => import("@/components/office/OfficeScene").then((m) => m.OfficeScene),
  { ssr: false }
);

export default function OfficePage() {
  const current = useWorkspaceStore((s) => s.current);
  const { fetchOffice, fetchAgents, loading } = useOfficeStore();

  useEffect(() => {
    if (!current) return;
    fetchOffice(current.id);
    fetchAgents(current.id);
  }, [current, fetchOffice, fetchAgents]);

  return (
    <div className="-m-6 h-[calc(100vh-0px)] relative overflow-hidden">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <OfficeScene />
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
            <p className="text-sm text-white/60">Loading office...</p>
          </div>
        </div>
      )}

      {/* UI overlay */}
      {!loading && (
        <>
          <OfficeToolbar />
          <RoomPanel />
        </>
      )}
    </div>
  );
}
