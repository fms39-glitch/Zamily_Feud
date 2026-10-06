"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ANSWER_ALTERNATIVES } from "@zamily-feud/shared";

/** The slice of the Web Speech API we use (not in TypeScript's DOM lib; Chrome/Edge/Safari expose it, Firefox doesn't). */
export interface RecognitionAlternative {
  transcript: string;
}
export interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
export interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;

export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked — allow it in your browser's address bar.",
  "service-not-allowed": "Microphone access is blocked — allow it in your browser's address bar.",
  "no-speech": "Didn't catch that — tap the mic and try again.",
  "audio-capture": "No microphone found.",
  network: "Voice recognition needs an internet connection.",
};

export interface SpeechAnswerHandlers {
  /** Live partial transcript while the player is still talking. */
  onInterim: (text: string) => void;
  /** Final transcript plus speech-to-text's runner-up guesses (best first). */
  onFinal: (text: string, alternatives: string[]) => void;
}

/**
 * Spoken answers via the browser's built-in speech recognition: free, no key,
 * one short utterance per tap. Chrome and Edge send the audio to their own
 * cloud recognizer, so it needs internet and a secure page (https or localhost).
 */
export function useSpeechAnswer({ onInterim, onFinal }: SpeechAnswerHandlers) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null && window.isSecureContext);
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    // Don't let the AI host's voice coming out of the speakers get transcribed as the answer.
    window.speechSynthesis?.cancel();

    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = MAX_ANSWER_ALTERNATIVES + 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const best = result[0]?.transcript.trim() ?? "";
        if (!result.isFinal) {
          handlers.current.onInterim(best);
          continue;
        }
        const alternatives: string[] = [];
        for (let k = 1; k < result.length; k++) alternatives.push(result[k].transcript.trim());
        handlers.current.onFinal(best, alternatives.filter(Boolean));
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") setError(SPEECH_ERROR_MESSAGES[e.error] ?? "Voice input stopped — try again or type it.");
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    setError(null);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
