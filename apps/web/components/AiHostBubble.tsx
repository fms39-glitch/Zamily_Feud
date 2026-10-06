"use client";

import { useEffect, useRef, useState } from "react";
import type { HostCommentary } from "@zamily-feud/shared";

interface AiHostBubbleProps {
  line: HostCommentary | null;
}

const VOICE_PREF_KEY = "zamily-feud:host-voice";

function readVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

/** The AI host's latest line: a speech bubble, optionally read aloud with the browser's built-in voice. */
export default function AiHostBubble({ line }: AiHostBubbleProps) {
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const spokenId = useRef<string | null>(null);

  useEffect(() => setVoiceOn(readVoicePref()), []);

  useEffect(() => {
    if (!line || spokenId.current === line.id) return;
    spokenId.current = line.id;
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // A new line interrupts the old one — the host never talks over themselves.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.rate = 1.08;
    utterance.pitch = 1.05;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [line, voiceOn]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
    try {
      localStorage.setItem(VOICE_PREF_KEY, next ? "on" : "off");
    } catch {
      // Preference just won't persist.
    }
  }

  return (
    <div className="flex w-full max-w-3xl items-start gap-3">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-gold-500 bg-navy-800 ${
          speaking ? "animate-buzzer-ready" : ""
        }`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-gold-400">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
        </svg>
      </div>

      <div className="relative min-h-[3.5rem] flex-1 rounded-2xl rounded-tl-sm border border-gold-500/60 bg-navy-900/90 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-sm tracking-widest text-gold-400">AI HOST</span>
          <button
            onClick={toggleVoice}
            className="rounded px-2 text-xs text-slate-400 hover:text-gold-400"
            aria-label={voiceOn ? "Mute the host's voice" : "Unmute the host's voice"}
          >
            {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        </div>
        {line ? (
          <p key={line.id} className="animate-banner-in text-base text-white sm:text-lg">
            {line.text}
          </p>
        ) : (
          <p className="text-slate-400 italic">Warming up the mic…</p>
        )}
      </div>
    </div>
  );
}
