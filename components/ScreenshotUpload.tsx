"use client";

import { useRef, useState, useCallback, DragEvent } from "react";

interface Props {
  onText: (text: string) => void;
  onError: (msg: string) => void;
}

// Converts any image the browser can display — including HEIC on iOS Safari —
// into a JPEG Blob via the Canvas API.
//
// iOS screenshots are always PNG, but when a user picks from their Photos
// library the file may arrive as HEIC (image/heic) or with an ambiguous
// MIME type. iOS Safari can *display* HEIC natively, so loading it into an
// <img> element works. Drawing that to a canvas and calling toBlob('image/jpeg')
// produces a proper JPEG regardless of the input format.
async function toJpegBlob(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image could not be displayed — try a different file."));
      el.src = objectUrl;
    });

    const MAX_W = 1800;
    const scale = Math.min(1, MAX_W / img.naturalWidth);
    const w = Math.floor(img.naturalWidth * scale);
    const h = Math.floor(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // flatten transparency onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
        "image/jpeg",
        0.92,
      ),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type Status = "idle" | "converting" | "uploading" | "done" | "error";

export default function ScreenshotUpload({ onText, onError }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback(async (file: File) => {
    // Validate loosely — let the server be the strict gatekeeper.
    // Checking file.type is unreliable on iOS (HEIC files sometimes report
    // as image/jpeg or even empty string).
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|heic|heif|webp|gif|bmp|tiff?)$/i.test(file.name);

    if (!looksLikeImage) {
      onError("That doesn't look like an image. Try a screenshot or photo.");
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      onError("That file is too large. Try a screenshot under 30 MB.");
      return;
    }

    setStatus("converting");

    let jpeg: Blob;
    try {
      // Client-side conversion: handles HEIC on iOS Safari, fixes orientation,
      // and guarantees we always POST a JPEG regardless of source format.
      jpeg = await toJpegBlob(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't prepare that image.";
      onError(msg);
      setStatus("error");
      return;
    }

    setStatus("uploading");

    try {
      const form = new FormData();
      form.append("image", jpeg, "screenshot.jpg");

      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "OCR request failed");
      }

      if (!data.text?.trim()) {
        throw new Error("No text found in that image. Try a clearer screenshot.");
      }

      onText(data.text);
      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't read the text from that image.";
      onError(msg);
      setStatus("error");
    }
  }, [onText, onError]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (files?.[0]) process(files[0]);
  }, [process]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const isWorking = status === "converting" || status === "uploading";

  const statusLabel = {
    idle:       "Have a screenshot? Upload it and we'll extract the text.",
    converting: "Preparing image…",
    uploading:  "Reading the text from your screenshot…",
    done:       "Text extracted — check the box below.",
    error:      "Try again or paste the text manually.",
  }[status];

  const statusIcon = {
    idle:       "📁",
    converting: "🔄",
    uploading:  "🔍",
    done:       "✅",
    error:      "⚠️",
  }[status];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload screenshot"
      onClick={() => !isWorking && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !isWorking && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2",
        "border-dashed px-4 py-5 text-center transition-all select-none",
        isWorking && "cursor-wait",
        dragging ? "border-amber-500 bg-amber-950/20"
          : status === "done" ? "border-green-700 bg-green-950/10"
          : status === "error" ? "border-red-800 bg-red-950/10"
          : "border-gray-700 bg-gray-900/40 hover:border-gray-500",
      ].filter(Boolean).join(" ")}
    >
      {/* Hidden file input — accept="image/*" is the key iOS fix.
          Never restrict to specific MIME types here; iOS reports HEIC files
          inconsistently and the browser may silently block the selection. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={isWorking}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <span className={`text-2xl ${isWorking ? "animate-pulse" : ""}`}>{statusIcon}</span>
      <span className={`text-xs ${
        status === "done" ? "text-green-400"
          : status === "error" ? "text-red-400"
          : "text-gray-400"
      }`}>
        {statusLabel}
      </span>
      {status === "idle" && (
        <span className="text-xs text-gray-600">PNG, JPG, HEIC — any format works</span>
      )}
      {status === "done" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setStatus("idle"); }}
          className="mt-1 text-xs text-gray-500 underline hover:text-gray-300"
        >
          Upload a different one
        </button>
      )}
    </div>
  );
}
