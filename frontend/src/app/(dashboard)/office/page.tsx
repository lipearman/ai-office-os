"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/store/workspace";
import { useOfficeStore } from "@/store/office";

const OfficeView = dynamic(
  () => import("@/components/office3d/OfficeView"),
  { ssr: false, loading: () => <LoadingScreen /> }
);

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center" style={{ background: "#87CEEB" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-2 border-blue-400/40" />
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-semibold text-blue-900">Loading AI Office...</p>
      </div>
    </div>
  );
}

export default function OfficePage() {
  const { current, loading: wsLoading } = useWorkspaceStore();
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
    const t = setInterval(() => fetchAgents(current.id), 15_000);
    return () => clearInterval(t);
  }, [current, fetchAgents]);

  const isLoading = wsLoading || loading || (!office && !!current);

  return (
    <div className="-m-6 h-screen relative overflow-hidden">
      {isLoading ? <LoadingScreen /> : office ? (
        <OfficeView agents={agents} officeName={office.name} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-white">ยังไม่มี Office</p>
        </div>
      )}
    </div>
  );
}
