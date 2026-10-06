"use client";

import { useEffect, useRef, useState } from "react";
import { useSpeechAnswer } from "../hooks/useSpeechAnswer";

interface AnswerInputProps {
  enabled: boolean;
  placeholder?: string;
  /** `alternatives` is non-empty only for an unedited spoken answer. */
  onSubmit: (text: string, alternatives: string[]) => void;
}

/**
 * The contestant's answer box — type it, or tap the mic and say it. A spoken
 * answer lands in the box first so the player can check or fix what was heard
 * before submitting; editing it drops the speech runner-up guesses.
 */
export default function AnswerInput({ enabled, placeholder, onSubmit }: AnswerInputProps) {
  const [value, setValue] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [spoken, setSpoken] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechAnswer({
    onInterim: (text) => setValue(text),
    onFinal: (text, alts) => {
      setValue(text);
      setAlternatives(alts);
      setSpoken(true);
      inputRef.current?.focus();
    },
  });

  const stopListening = speech.stop;
  useEffect(() => {
    if (!enabled) {
      setValue("");
      setAlternatives([]);
      setSpoken(false);
      stopListening();
    }
  }, [enabled, stopListening]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed, alternatives);
    setValue("");
    setAlternatives([]);
    setSpoken(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex w-full gap-2"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setAlternatives([]);
            setSpoken(false);
          }}
          disabled={!enabled}
          placeholder={speech.listening ? "Listening…" : placeholder ?? "Type or say your answer…"}
          maxLength={120}
          autoFocus={enabled}
          className="min-w-0 flex-1 rounded border border-navy-600 bg-navy-900 px-4 py-2 text-white placeholder:text-slate-500 disabled:opacity-40"
        />
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={!enabled}
            aria-label={speech.listening ? "Stop listening" : "Say your answer"}
            aria-pressed={speech.listening}
            className={`rounded px-3 py-2 text-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              speech.listening ? "animate-buzzer-ready bg-red-600 hover:bg-red-500" : "bg-navy-700 hover:bg-navy-600"
            }`}
          >
            🎤
          </button>
        )}
        <button
          type="submit"
          disabled={!enabled || !value.trim()}
          className="rounded bg-gold-500 px-4 py-2 font-heading text-navy-950 hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit
        </button>
      </form>
      {speech.error ? (
        <p className="text-xs text-red-400">{speech.error}</p>
      ) : speech.listening ? (
        <p className="text-xs text-slate-400">Say your answer… it&apos;ll appear above so you can check it before submitting.</p>
      ) : spoken ? (
        <p className="text-xs text-slate-400">Heard right? Press Submit — or tap 🎤 to try again.</p>
      ) : null}
    </div>
  );
}
