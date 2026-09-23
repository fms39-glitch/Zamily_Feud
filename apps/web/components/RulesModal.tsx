"use client";

interface RulesModalProps {
  onClose: () => void;
}

const RULES = [
  { title: "2 Teams", body: "Head-to-head, up to 5 players per team." },
  { title: "Face-Off", body: "One player from each team buzzes in to answer first and try to take control of the board." },
  { title: "3 Strikes", body: "Three wrong answers in a row hands the opposing team a chance to steal." },
  { title: "Steal", body: "The opposing team confers, then one player gives a single final answer for all the board's points." },
  { title: "Score", body: "Points bank to your team's total on the big board. Highest score after all rounds wins." },
];

export default function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="egg-crate-texture relative w-full max-w-lg rounded-2xl border-4 border-gold-500 p-6 shadow-[0_0_50px_rgba(244,196,48,0.35)]">
        <h2 className="font-display text-3xl text-gold-500 text-center mb-4 tracking-wide">How To Play</h2>
        <ol className="space-y-3">
          {RULES.map((rule, i) => (
            <li key={rule.title} className="flex gap-3 rounded-lg bg-navy-900/70 p-3">
              <span className="font-display text-gold-400 text-xl w-6 shrink-0">{i + 1}</span>
              <div>
                <p className="font-heading text-lg text-white leading-none">{rule.title}</p>
                <p className="text-sm text-slate-300">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-gold-500 py-2 font-heading text-lg text-navy-950 hover:bg-gold-400 transition-colors"
        >
          Got it — let&apos;s play
        </button>
      </div>
    </div>
  );
}
