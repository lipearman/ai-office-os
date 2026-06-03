"use client";

import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Uploads an image. Tries backend /api/v1/uploads first; if that fails,
 * falls back to a local object URL (blob:) so the user still sees it
 * immediately during this session.
 */
export function useImageUpload() {
  const upload = useCallback(async (file: File): Promise<string> => {
    // Try backend upload
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/v1/uploads`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          return data.url.startsWith("http") ? data.url : `${API_URL}${data.url}`;
        }
      }
    } catch {
      // ignore — fall through to blob
    }
    // Fallback: local blob URL (does not persist across reloads)
    return URL.createObjectURL(file);
  }, []);

  return { upload };
}

/** Read image to get natural dimensions */
export function readImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}
