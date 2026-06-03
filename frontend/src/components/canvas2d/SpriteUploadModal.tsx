"use client";

import { useState, useEffect, useRef } from "react";
import { X, Upload } from "lucide-react";
import type { SpriteConfig } from "./types";
import { useImageUpload, readImageSize } from "./useImageUpload";
import { Button } from "@/components/ui/button";

interface Props {
  agentName: string;
  current: SpriteConfig | null;
  onSave: (sprite: SpriteConfig | null) => void;
  onClose: () => void;
}

export function SpriteUploadModal({ agentName, current, onSave, onClose }: Props) {
  const { upload } = useImageUpload();
  const [url, setUrl] = useState(current?.url ?? "");
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [cols, setCols] = useState(current?.cols ?? 3);
  const [rows, setRows] = useState(4);
  const [uploading, setUploading] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const frameW = imgSize.w && cols ? Math.floor(imgSize.w / cols) : (current?.frameW ?? 0);
  const frameH = imgSize.h && rows ? Math.floor(imgSize.h / rows) : (current?.frameH ?? 0);

  useEffect(() => {
    if (url) readImageSize(url).then(setImgSize);
  }, [url]);

  // Draw preview grid
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !url || !imgSize.w) return;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(280 / img.naturalWidth, 200 / img.naturalHeight, 1);
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Grid
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1;
      const cw = canvas.width / cols;
      const ch = canvas.height / rows;
      for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(c*cw,0); ctx.lineTo(c*cw,canvas.height); ctx.stroke(); }
      for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(0,r*ch); ctx.lineTo(canvas.width,r*ch); ctx.stroke(); }
    };
    img.src = url;
  }, [url, imgSize, cols, rows]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const u = await upload(file);
      setUrl(u);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!url) { onSave(null); onClose(); return; }
    onSave({ url, frameW, frameH, cols });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d1f] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Sprite — {agentName}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        {/* Upload */}
        <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/3 py-6 cursor-pointer hover:border-primary-500/50 transition-colors mb-4">
          <Upload size={24} className="text-white/40" />
          <span className="text-sm text-white/60">{uploading ? "Uploading…" : "อัปโหลด sprite sheet"}</span>
          <span className="text-[10px] text-white/30">PNG/GIF · จัดเรียง down/left/right/up เป็นแถว</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>

        {url && (
          <>
            <div className="flex justify-center mb-3">
              <canvas ref={previewRef} className="rounded-lg border border-white/10" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-xs text-white/50">Columns (walk frames)</label>
                <input type="number" min={1} max={12} value={cols}
                  onChange={(e) => setCols(Math.max(1, +e.target.value))}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-white/50">Rows (directions)</label>
                <input type="number" min={1} max={8} value={rows}
                  onChange={(e) => setRows(Math.max(1, +e.target.value))}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white" />
              </div>
            </div>
            <p className="text-[11px] text-white/40 mb-4">
              Frame: {frameW}×{frameH}px · แถว: down→left→right→up
            </p>
          </>
        )}

        <div className="flex gap-2">
          {current && (
            <Button variant="outline" onClick={() => { onSave(null); onClose(); }} className="flex-1">
              ลบ sprite
            </Button>
          )}
          <Button onClick={handleSave} className="flex-1">บันทึก</Button>
        </div>
      </div>
    </div>
  );
}
