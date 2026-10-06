/** Each team's color identity, used everywhere a team appears (scores, chat, banners, lobby). */
export const TEAM_THEME: Record<string, { tone: "team1" | "team2"; text: string; border: string; glow: string; chip: string }> = {
  "team-1": {
    tone: "team1",
    text: "text-sky-300",
    border: "border-sky-400",
    glow: "shadow-[0_0_30px_rgba(56,189,248,0.55)]",
    chip: "bg-sky-500/20 text-sky-200 border-sky-400/60",
  },
  "team-2": {
    tone: "team2",
    text: "text-rose-300",
    border: "border-rose-400",
    glow: "shadow-[0_0_30px_rgba(251,113,133,0.55)]",
    chip: "bg-rose-500/20 text-rose-200 border-rose-400/60",
  },
};

export function teamTheme(teamId: string | null | undefined) {
  return (teamId && TEAM_THEME[teamId]) || TEAM_THEME["team-1"];
}

/** The tile finish for a revealed answer by rank: medals for the top three. */
export function medalClass(rank: number): string {
  return rank === 1 ? "tile-gold" : rank === 2 ? "tile-silver" : rank === 3 ? "tile-bronze" : "tile-revealed";
}
