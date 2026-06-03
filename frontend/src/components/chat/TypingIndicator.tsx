export function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className="flex items-end gap-2 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">
        🤖
      </div>
      <div className="flex flex-col gap-1">
        {name && <span className="text-xs text-white/40">{name}</span>}
        <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white/8 px-4 py-3">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-2 w-2 rounded-full bg-white/40"
              style={{
                animation: "typingDot 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
