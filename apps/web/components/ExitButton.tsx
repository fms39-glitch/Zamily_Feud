"use client";

import { useEffect, useState } from "react";

interface ExitButtonProps {
  onConfirm: () => void;
  /** Extra warning in the confirm dialog, e.g. that a human host leaving ends the game for everyone. */
  warning?: string;
}

/** "Exit" with an are-you-sure dialog, so nobody leaves a game by accident. */
export default function ExitButton({ onConfirm, warning }: ExitButtonProps) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        className="rounded-lg border border-red-500/50 bg-navy-950/60 px-3 py-1 font-heading text-sm tracking-widest text-red-300 transition hover:border-red-400 hover:text-red-200"
      >
        EXIT
      </button>

      {asking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setAsking(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-title"
        >
          <div
            className="egg-crate-texture w-full max-w-sm animate-slam-in rounded-2xl border-4 border-gold-500 p-6 text-center shadow-[0_0_50px_rgba(244,196,48,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="exit-title" className="font-display text-3xl tracking-wide text-gold-500">
              Leaving already?
            </h2>
            <p className="mt-2 text-slate-300">Are you sure you want to exit? Once the game has started, you can&apos;t jump back in.</p>
            {warning && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-200">{warning}</p>}
            <div className="mt-6 flex gap-3">
              <button
                autoFocus
                onClick={() => setAsking(false)}
                className="flex-1 rounded-xl bg-gradient-to-b from-gold-400 to-gold-600 py-2 font-heading text-lg text-navy-950 shadow-[0_4px_0_#8a6a05] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#8a6a05]"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  setAsking(false);
                  onConfirm();
                }}
                className="flex-1 rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-2 font-heading text-lg text-white shadow-[0_4px_0_#5c1010] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#5c1010]"
              >
                Yes, exit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
