"use client";

import Avatar from "../Avatar";

export interface Banner {
  id: number;
  /** Show this player's picture with the banner (e.g. who buzzed in). */
  playerId?: string;
  playerName?: string;
  teamId?: string;
  title: string;
  subtitle?: string;
  tone: "gold" | "red" | "team1" | "team2";
}

const TONES: Record<Banner["tone"], string> = {
  gold: "from-gold-600 via-gold-400 to-gold-600 text-navy-950 shadow-[0_0_50px_rgba(244,196,48,0.55)]",
  red: "from-red-800 via-red-500 to-red-800 text-white shadow-[0_0_50px_rgba(239,68,68,0.55)]",
  team1: "from-sky-800 via-sky-500 to-sky-800 text-white shadow-[0_0_50px_rgba(56,189,248,0.5)]",
  team2: "from-rose-800 via-rose-500 to-rose-800 text-white shadow-[0_0_50px_rgba(251,113,133,0.5)]",
};

/** A short slam-in headline across the top of the board: "ANN BUZZED IN!", "STEAL!", "ROUND TO TEAM 1". */
export default function EventBanner({ banner }: { banner: Banner }) {
  return (
    <div key={banner.id} className="pointer-events-none fixed inset-x-0 top-2 z-40 flex justify-center px-4" aria-live="polite">
      <div className={`flex animate-fx-fade items-center gap-4 rounded-xl bg-gradient-to-r px-8 py-3 text-center ${TONES[banner.tone]}`}>
        {banner.playerId && <Avatar playerId={banner.playerId} name={banner.playerName ?? ""} teamId={banner.teamId} size="lg" className="animate-badge-pop" />}
        <div>
          <p className="animate-slam-in font-display text-3xl tracking-wide sm:text-5xl">{banner.title}</p>
          {banner.subtitle && <p className="font-heading text-lg tracking-widest opacity-90">{banner.subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
