"use client";

/**
 * Game-show sound effects, synthesized live with the Web Audio API — no audio
 * files to download or license. Muted state is a per-device preference.
 */

const PREF_KEY = "zamily-feud:sfx";
let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isSfxMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(PREF_KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setSfxMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(PREF_KEY, value ? "off" : "on");
  } catch {
    // Preference just won't persist.
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isSfxMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  /** Seconds from now. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Slide to this frequency over the note. */
  slideTo?: number;
}

function play(notes: Note[]): void {
  const ac = audio();
  if (!ac) return;
  const master = ac.createGain();
  master.gain.value = 0.18;
  master.connect(ac.destination);
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const t0 = ac.currentTime + n.at;
    osc.type = n.type ?? "triangle";
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + n.dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(n.gain ?? 1, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.05);
  }
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

export const sfx = {
  /** A regular correct answer: the classic two-tone "ding". */
  ding: () => play([{ freq: E6, at: 0, dur: 0.5, type: "sine" }, { freq: C6, at: 0.12, dur: 0.7, type: "sine" }]),
  /** Number one answer: a rising brass-style fanfare. */
  fanfare: () =>
    play([
      { freq: C5, at: 0, dur: 0.18, type: "sawtooth", gain: 0.6 },
      { freq: E5, at: 0.14, dur: 0.18, type: "sawtooth", gain: 0.6 },
      { freq: G5, at: 0.28, dur: 0.18, type: "sawtooth", gain: 0.6 },
      { freq: C6, at: 0.42, dur: 0.9, type: "sawtooth", gain: 0.7 },
      { freq: E6, at: 0.42, dur: 0.9, type: "triangle", gain: 0.5 },
      { freq: G6, at: 0.42, dur: 0.9, type: "sine", gain: 0.4 },
    ]),
  /** Number two answer: a sparkling upward shimmer. */
  shimmer: () => play([E6, G6, C6 * 2, E6 * 2].map((freq, i) => ({ freq, at: i * 0.07, dur: 0.6, type: "sine" as const, gain: 0.6 }))),
  /** Number three answer: three firework pops. */
  pops: () =>
    play(
      [0, 0.28, 0.56].flatMap((at, i) => [
        { freq: 180 + i * 40, at, dur: 0.12, type: "square" as const, gain: 0.5, slideTo: 60 },
        { freq: G5 + i * 120, at: at + 0.04, dur: 0.35, type: "sine" as const, gain: 0.5 },
      ]),
    ),
  /** Wrong answer / strike: the low double buzz. */
  buzzer: () =>
    play([
      { freq: 110, at: 0, dur: 0.35, type: "sawtooth", gain: 0.9 },
      { freq: 104, at: 0, dur: 0.35, type: "square", gain: 0.5 },
      { freq: 110, at: 0.42, dur: 0.45, type: "sawtooth", gain: 0.9 },
      { freq: 104, at: 0.42, dur: 0.45, type: "square", gain: 0.5 },
    ]),
  /** Someone buzzed in. */
  buzzIn: () => play([{ freq: 880, at: 0, dur: 0.12, type: "square", gain: 0.6 }, { freq: 1320, at: 0.08, dur: 0.2, type: "square", gain: 0.5 }]),
  /** Steal time: a tense descending sting. */
  steal: () => play([G5, E5, C5, G5 / 1.5].map((freq, i) => ({ freq, at: i * 0.16, dur: 0.3, type: "sawtooth" as const, gain: 0.55 }))),
  /** Round won. */
  roundWin: () => play([C5, E5, G5, C6].map((freq, i) => ({ freq, at: i * 0.1, dur: 0.4, type: "triangle" as const, gain: 0.7 }))),
  /** The buzzer opens after a question intro: a bright "go". */
  go: () => play([{ freq: G5, at: 0, dur: 0.12, type: "square", gain: 0.5 }, { freq: C6, at: 0.1, dur: 0.35, type: "square", gain: 0.55 }]),
  /** Final timer seconds. */
  tick: () => play([{ freq: 1600, at: 0, dur: 0.05, type: "square", gain: 0.25 }]),
};
