"use client";

import { useRef, useState } from "react";
import { X, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useOfficeGameStore } from "@/store/officeGame";
import { useImageUpload, readImageSize } from "./useImageUpload";
import type { FurnitureItem } from "./types";
import { Button } from "@/components/ui/button";

interface Props {
  selectedFurniture: FurnitureItem | null;
  onClose: () => void;
}

export function EditorPanel({ selectedFurniture, onClose }: Props) {
  const {
    backgroundUrl, backgroundFit, setBackground,
    addFurniture, updateFurniture, removeFurniture,
  } = useOfficeGameStore();
  const { upload } = useImageUpload();
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingF, setUploadingF] = useState(false);
  const fInputRef = useRef<HTMLInputElement>(null);

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try { setBackground(await upload(file), backgroundFit); }
    finally { setUploadingBg(false); }
  };

  const handleFurnitureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingF(true);
    try {
      const url = await upload(file);
      const size = await readImageSize(url);
      const ratio = size.w && size.h ? size.w / size.h : 1.5;
      const h = 90;
      addFurniture({
        id: `f_${Date.now()}`,
        label: file.name.replace(/\.[^.]+$/, ""),
        imageUrl: url,
        x: 200, y: 200,
        width: Math.round(h * ratio), height: h,
        emoji: "🪑",
      });
    } finally {
      setUploadingF(false);
      if (fInputRef.current) fInputRef.current.value = "";
    }
  };

  const replaceFurnitureImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFurniture) return;
    const url = await upload(file);
    updateFurniture(selectedFurniture.id, { imageUrl: url });
  };

  return (
    <div className="absolute left-4 top-14 bottom-4 w-72 z-20 flex flex-col rounded-2xl border border-white/10 bg-black/85 backdrop-blur-xl overflow-hidden pointer-events-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-sm font-bold text-white">🎨 Office Editor</span>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Background */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">พื้นหลัง (Background)</p>
          <label className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-white/15 bg-white/3 py-4 cursor-pointer hover:border-primary-500/50 transition-colors">
            <ImageIcon size={20} className="text-white/40" />
            <span className="text-xs text-white/60">{uploadingBg ? "กำลังอัปโหลด…" : "อัปโหลดรูปพื้นหลัง"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
          </label>
          {backgroundUrl && (
            <>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {(["cover","contain","fill","tile"] as const).map((fit) => (
                  <button key={fit} onClick={() => setBackground(backgroundUrl, fit)}
                    className={`rounded-md px-1 py-1 text-[10px] capitalize transition-colors ${
                      backgroundFit === fit ? "bg-primary-600 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"
                    }`}>{fit}</button>
                ))}
              </div>
              <button onClick={() => setBackground(null)} className="mt-2 w-full text-xs text-red-400/70 hover:text-red-400">
                ลบพื้นหลัง
              </button>
            </>
          )}
        </section>

        {/* Furniture */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">เฟอร์นิเจอร์ (Furniture)</p>
          <label className="flex items-center justify-center gap-2 rounded-xl bg-primary-600/20 border border-primary-500/30 py-2.5 cursor-pointer hover:bg-primary-600/30 transition-colors">
            <Plus size={15} className="text-primary-300" />
            <span className="text-xs font-medium text-primary-200">{uploadingF ? "กำลังเพิ่ม…" : "เพิ่ม furniture (อัปโหลดรูป)"}</span>
            <input ref={fInputRef} type="file" accept="image/*" className="hidden" onChange={handleFurnitureUpload} />
          </label>
        </section>

        {/* Selected furniture editor */}
        {selectedFurniture && (
          <section className="rounded-xl border border-primary-500/30 bg-primary-600/10 p-3">
            <p className="text-xs font-bold text-white mb-2">เลือก: {selectedFurniture.label}</p>

            <label className="flex items-center justify-center gap-2 rounded-lg bg-white/5 py-2 cursor-pointer hover:bg-white/10 mb-2 transition-colors">
              <Upload size={13} className="text-white/50" />
              <span className="text-[11px] text-white/60">เปลี่ยนรูป</span>
              <input type="file" accept="image/*" className="hidden" onChange={replaceFurnitureImage} />
            </label>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[10px] text-white/40">กว้าง</label>
                <input type="number" value={Math.round(selectedFurniture.width)}
                  onChange={(e) => updateFurniture(selectedFurniture.id, { width: +e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] text-white/40">สูง</label>
                <input type="number" value={Math.round(selectedFurniture.height)}
                  onChange={(e) => updateFurniture(selectedFurniture.id, { height: +e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
              </div>
            </div>

            <input type="text" value={selectedFurniture.label}
              onChange={(e) => updateFurniture(selectedFurniture.id, { label: e.target.value })}
              placeholder="ชื่อ" className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white mb-2" />

            <button onClick={() => removeFurniture(selectedFurniture.id)}
              className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-xs text-red-400 hover:bg-red-500/25 transition-colors">
              <Trash2 size={13} /> ลบ furniture
            </button>
          </section>
        )}

        <p className="text-[10px] text-white/30 leading-relaxed">
          💡 ลาก furniture เพื่อย้าย · คลิกเพื่อเลือก · ตัวละครคลิกที่พื้นเพื่อเดิน
        </p>
      </div>
    </div>
  );
}
