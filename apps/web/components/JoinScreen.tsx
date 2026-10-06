"use client";

import { useState } from "react";
import { HOST_PERSONAS } from "@zamily-feud/shared";
import type { AgeCategory, HostMode } from "@zamily-feud/shared";

const HOST_OPTIONS: { mode: HostMode; title: string; sub: string }[] = [
  { mode: "HUMAN", title: "I'll host", sub: "You run the board" },
  { mode: "AI", title: "AI host", sub: "Everyone plays, AI runs it" },
];

interface JoinScreenProps {
  onCreate: (displayName: string, hostMode: HostMode, hostPersona: AgeCategory) => void;
  onJoin: (displayName: string, roomCode: string) => void;
  onOpenRules: () => void;
  serverError: string | null;
}

export default function JoinScreen({ onCreate, onJoin, onOpenRules, serverError }: JoinScreenProps) {
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [nameError, setNameError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [hostMode, setHostMode] = useState<HostMode>("HUMAN");
  const [persona, setPersona] = useState<AgeCategory>("FAMILY_FRIENDLY");

  function requireName(): string | null {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError(true);
      setShakeKey((k) => k + 1);
      return null;
    }
    setNameError(false);
    return trimmed;
  }

  function handleCreate() {
    const name = requireName();
    if (name) onCreate(name, hostMode, persona);
  }

  function handleJoin() {
    const name = requireName();
    if (name && joinCode.trim()) onJoin(name, joinCode.trim());
  }

  return (
    <main className="egg-crate-texture relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="stage-lights animate-spotlight-drift" aria-hidden />
      <div className="marquee-frame relative z-10 w-full max-w-sm animate-rise-in rounded-[2rem]">
        <div className="glass w-full space-y-6 rounded-[2rem] border-2 border-gold-500 p-8 shadow-[0_0_60px_rgba(244,196,48,0.25)]">
          <p className="-mb-4 text-center font-heading text-sm tracking-[0.4em] text-slate-300">SURVEY SAYS…</p>
          <h1 className="text-metal-gold text-center font-display text-5xl tracking-wide drop-shadow-[0_0_20px_rgba(244,196,48,0.35)]">
            ZAMILY FEUD
          </h1>

          <div key={shakeKey} className={nameError ? "animate-screen-shake" : ""}>
            <input
              className={`w-full rounded bg-navy-900 px-3 py-2 outline-none border-2 transition-colors ${
                nameError ? "border-red-500" : "border-navy-700 focus:border-gold-500"
              }`}
              placeholder="Your name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (nameError) setNameError(false);
              }}
              suppressHydrationWarning
            />
            {nameError && <p className="mt-1 text-sm text-red-400">Name can&apos;t be blank.</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-slate-400">Who hosts?</p>
            <div className="grid grid-cols-2 gap-2">
              {HOST_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setHostMode(opt.mode)}
                  aria-pressed={hostMode === opt.mode}
                  className={`rounded border-2 px-2 py-2 text-left transition-colors ${
                    hostMode === opt.mode ? "border-gold-500 bg-navy-800" : "border-navy-700 bg-navy-900 hover:border-navy-600"
                  }`}
                  suppressHydrationWarning
                >
                  <span className="block font-heading text-lg leading-none">{opt.title}</span>
                  <span className="text-[11px] text-slate-400">{opt.sub}</span>
                </button>
              ))}
            </div>
            {hostMode === "AI" && (
              <label className="flex items-center justify-between gap-2 text-sm text-slate-300">
                Humor style
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as AgeCategory)}
                  className="rounded border-2 border-navy-700 bg-navy-900 px-2 py-1 outline-none focus:border-gold-500"
                >
                  {HOST_PERSONAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <button
            onClick={handleCreate}
            className="w-full rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 font-heading text-navy-950 shadow-[0_4px_0_#8a6a05] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#8a6a05] px-4 py-2.5 text-xl tracking-wide"
            suppressHydrationWarning
          >
            Create room
          </button>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded bg-navy-900 px-3 py-2 outline-none uppercase border-2 border-navy-700 focus:border-gold-500"
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              suppressHydrationWarning
            />
            <button
              onClick={handleJoin}
              className="rounded-xl bg-gradient-to-b from-navy-600 to-navy-800 font-heading shadow-[0_4px_0_#050b1f] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#050b1f] px-5 py-2 text-lg"
              suppressHydrationWarning
            >
              Join
            </button>
          </div>

          {serverError && <p className="text-red-400 text-sm text-center">{serverError}</p>}

          <button
            onClick={onOpenRules}
            className="w-full text-center text-sm text-slate-400 hover:text-gold-400 underline"
            suppressHydrationWarning
          >
            How to play
          </button>
        </div>
      </div>
    </main>
  );
}
