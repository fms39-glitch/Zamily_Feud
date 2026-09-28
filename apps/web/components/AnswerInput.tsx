"use client";

import { useEffect, useState } from "react";

interface AnswerInputProps {
  enabled: boolean;
  placeholder?: string;
  onSubmit: (text: string) => void;
}

/** The contestant's free-text answer box — the only way to actually say an answer. */
export default function AnswerInput({ enabled, placeholder, onSubmit }: AnswerInputProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!enabled) setValue("");
  }, [enabled]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex w-full max-w-md gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!enabled}
        placeholder={placeholder ?? "Type your answer…"}
        maxLength={120}
        autoFocus={enabled}
        className="flex-1 rounded border border-navy-600 bg-navy-900 px-4 py-2 text-white placeholder:text-slate-500 disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={!enabled || !value.trim()}
        className="rounded bg-gold-500 px-4 py-2 font-heading text-navy-950 hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit
      </button>
    </form>
  );
}
