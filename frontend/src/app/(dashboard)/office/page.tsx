"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/store/workspace";
import { useOfficeStore } from "@/store/office";

const OfficeGame = dynamic(
  () => import("@/components/game/OfficeGame"),
  { ssr: false, loading: () => <LoadingScreen /> }
);

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-[#050510]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          <div className="absolute inset-2 rounded-full border border-primary-400/30 border-b-transparent animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
        </div>
        <p className="text-sm font-semibold text-white">Loading AI Office</p>
        <p className="text-xs text-white/40">Initializing game engine...</p>
      </div>
    </div>
  );
}

export default function OfficePage() {
  const { current, workspaces, loading: wsLoading } = useWorkspaceStore();
  const { fetchOffice, fetchAgents, loading, office, agents } = useOfficeStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!current || initialized) return;
    setInitialized(true);
    fetchOffice(current.id);
    fetchAgents(current.id);
  }, [current, initialized, fetchOffice, fetchAgents]);

  useEffect(() => {
    if (!current) return;
    const timer = setInterval(() => fetchAgents(current.id), 15_000);
    return () => clearInterval(timer);
  }, [current, fetchAgents]);

  if (!wsLoading && workspaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🏢</div>
          <p className="text-white font-semibold text-lg mb-2">ยังไม่มี Workspace</p>
        </div>
      </div>
    );
  }

  const isLoading = wsLoading || loading || (!office && !!current);

  return (
    <div className="-m-6 h-screen relative overflow-hidden bg-[#050510]">
      {isLoading ? <LoadingScreen /> : office ? (
        <OfficeGame agents={agents} officeName={office.name} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-white">ยังไม่มี Office</p>
        </div>
      )}
    </div>
  );
}
