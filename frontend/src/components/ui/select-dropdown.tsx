"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

export function Select({ value, options, onChange, placeholder }: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const sel = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#1e1b2e] px-3 py-2 text-sm text-white">
        <span>{sel ? sel.label : (placeholder ?? "— เลือก —")}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${open ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#1e1b2e] shadow-xl">
          {options.map((o) => (
            <button key={o.value} type="button" onMouseDown={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${o.value === value ? "bg-indigo-500/20 text-indigo-300" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
