"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "./Avatar";

interface AvatarPickerProps {
  playerId: string;
  name: string;
  teamId: string | null;
  hasAvatar: boolean;
  onSet: (image: string | null) => void;
}

const SIZE = 160;

/** Center-crops any image source to a small square JPEG (~10-20 KB), so pictures stay light in memory and over the wire. */
function toThumbnail(source: CanvasImageSource, width: number, height: number, mirror = false): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  const side = Math.min(width, height);
  if (mirror) {
    g.translate(SIZE, 0);
    g.scale(-1, 1);
  }
  g.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** Lobby control to add a picture: upload one, or take a selfie with the camera. */
export default function AvatarPicker({ playerId, name, teamId, hasAvatar, onSet }: AvatarPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (camera && videoRef.current) {
      videoRef.current.srcObject = camera;
      void videoRef.current.play().catch(() => {});
    }
    return () => camera?.getTracks().forEach((t) => t.stop());
  }, [camera]);

  // Escape closes the camera.
  useEffect(() => {
    if (!camera) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCamera();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera]);

  function closeCamera() {
    setCamera(null);
    setVideoReady(false);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onSet(toThumbnail(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setError("That file isn't an image we can read.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  async function openCamera() {
    setError(null);
    try {
      setCamera(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 } }));
    } catch {
      setError("Couldn't open the camera — allow it in your browser, or upload a photo instead.");
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onSet(toThumbnail(v, v.videoWidth, v.videoHeight, true));
    closeCamera();
  }

  return (
    <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-2xl px-4 py-3">
      <Avatar playerId={playerId} name={name} teamId={teamId} size="lg" />
      <div className="flex flex-col gap-1.5">
        <span className="font-heading text-sm tracking-[0.2em] text-slate-300">YOUR PICTURE</span>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-navy-700 px-3 py-1.5 font-heading text-sm hover:bg-navy-600">
            📁 Upload
          </button>
          <button onClick={openCamera} className="rounded-lg bg-navy-700 px-3 py-1.5 font-heading text-sm hover:bg-navy-600">
            📸 Selfie
          </button>
          {hasAvatar && (
            <button onClick={() => onSet(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-red-300">
              Remove
            </button>
          )}
        </div>
        <span className="text-[11px] text-slate-500">Only kept for this game, then deleted.</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {/* Rendered on <body>: inside the picker card (blur/transform) "fixed" would be trapped in the card and covered. */}
      {camera &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Take a selfie">
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border-2 border-gold-500 bg-navy-900 p-5 shadow-[0_0_60px_rgba(244,196,48,0.3)]">
              <span className="font-heading tracking-[0.3em] text-gold-400">SMILE!</span>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                onLoadedMetadata={() => setVideoReady(true)}
                className="aspect-square w-full max-w-[16rem] -scale-x-100 rounded-full bg-navy-950 object-cover ring-4 ring-gold-500"
              />
              <div className="flex gap-3">
                <button
                  onClick={snap}
                  disabled={!videoReady}
                  autoFocus
                  className="rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 px-6 py-2 font-heading text-lg text-navy-950 shadow-[0_4px_0_#8a6a05] active:translate-y-0.5 disabled:opacity-50"
                >
                  {videoReady ? "📸 Snap" : "Starting camera…"}
                </button>
                <button onClick={closeCamera} className="rounded-xl bg-navy-700 px-5 py-2 font-heading text-lg hover:bg-navy-600">
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
