"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#0e0b16]">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold text-red-400">Something went wrong</p>
        <button onClick={() => reset()} className="rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
          Try again
        </button>
      </div>
    </div>
  );
}
