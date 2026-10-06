"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { RoomSession } from "@zamily-feud/shared";
import { isSfxMuted, setSfxMuted } from "../lib/sfx";

interface GameHeaderProps {
  room: RoomSession;
  /** Left-side context: "Team 1 · face-off captain", "HOST VIEW", etc. */
  badge: ReactNode;
}

/** Frosted top bar: logo, who you are, the room code (tap to copy), and the sound-effects toggle. */
export default function GameHeader({ room, badge }: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => setSoundOn(!isSfxMuted()), []);

  function copyCode() {
    void navigator.clipboard?.writeText(room.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  function toggleSound() {
    setSfxMuted(soundOn);
    setSoundOn(!soundOn);
  }

  return (
    <header className="glass relative z-20 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-display text-xl tracking-wide text-gold-500 drop-shadow-[0_0_10px_rgba(244,196,48,0.5)]">ZAMILY FEUD</span>
        <span className="hidden truncate font-heading text-sm tracking-wide text-slate-300 sm:inline">{badge}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={copyCode}
          className="rounded-lg border border-gold-500/40 bg-navy-950/60 px-3 py-1 font-heading text-sm tracking-widest text-gold-400 transition hover:border-gold-400"
          title="Copy room code"
        >
          {copied ? "COPIED!" : `ROOM ${room.roomCode}`}
        </button>
        <button
          onClick={toggleSound}
          className="rounded-lg border border-navy-600 bg-navy-950/60 px-2 py-1 text-sm transition hover:border-gold-400"
          aria-label={soundOn ? "Mute sound effects" : "Unmute sound effects"}
          title={soundOn ? "Sound effects on" : "Sound effects off"}
        >
          {soundOn ? "🔔" : "🔕"}
        </button>
      </div>
      <span className="w-full truncate font-heading text-sm tracking-wide text-slate-300 sm:hidden">{badge}</span>
    </header>
  );
}
