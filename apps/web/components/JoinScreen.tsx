"use client";

import { useState } from "react";

interface JoinScreenProps {
  onCreate: (displayName: string) => void;
  onJoin: (displayName: string, roomCode: string) => void;
  onOpenRules: () => void;
  serverError: string | null;
}

export default function JoinScreen({ onCreate, onJoin, onOpenRules, serverError }: JoinScreenProps) {
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [nameError, setNameError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

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
    if (name) onCreate(name);
  }

  function handleJoin() {
    const name = requireName();
    if (name && joinCode.trim()) onJoin(name, joinCode.trim());
  }

  return (
    <main className="egg-crate-texture min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border-4 border-gold-500 bg-navy-950/80 p-8 shadow-[0_0_60px_rgba(244,196,48,0.25)]">
        <h1 className="font-display text-5xl text-center text-gold-500 tracking-wide drop-shadow-[0_0_20px_rgba(244,196,48,0.5)]">
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
          />
          {nameError && <p className="mt-1 text-sm text-red-400">Name can&apos;t be blank.</p>}
        </div>

        <button
          onClick={handleCreate}
          className="w-full rounded bg-gold-500 px-4 py-2 font-heading text-lg text-navy-950 hover:bg-gold-400 transition-colors"
        >
          Create room
        </button>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded bg-navy-900 px-3 py-2 outline-none uppercase border-2 border-navy-700 focus:border-gold-500"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button
            onClick={handleJoin}
            className="rounded bg-navy-700 px-4 py-2 font-heading text-lg hover:bg-navy-600 transition-colors"
          >
            Join
          </button>
        </div>

        {serverError && <p className="text-red-400 text-sm text-center">{serverError}</p>}

        <button onClick={onOpenRules} className="w-full text-center text-sm text-slate-400 hover:text-gold-400 underline">
          How to play
        </button>
      </div>
    </main>
  );
}
