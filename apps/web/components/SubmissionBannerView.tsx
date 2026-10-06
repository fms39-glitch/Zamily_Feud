"use client";

import type { SubmissionBanner } from "@zamily-feud/shared";
import { teamTheme } from "../lib/teamTheme";
import Avatar from "./Avatar";

interface SubmissionBannerViewProps {
  submission: SubmissionBanner | null;
  teamName: string;
}

/** Shows the most recent spoken/typed answer to everyone, with a "judging" shimmer until the host rules on it. */
export default function SubmissionBannerView({ submission, teamName }: SubmissionBannerViewProps) {
  if (!submission) return null;
  const theme = teamTheme(submission.teamId);
  const spoken = submission.alternatives.length > 0;
  return (
    <div
      key={submission.submittedAt}
      className={`relative z-10 flex animate-slam-in items-center gap-3 overflow-hidden rounded-2xl border-2 bg-navy-950/85 px-5 py-2 ${theme.border} ${theme.glow}`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-tile-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <Avatar playerId={submission.playerId} name={submission.displayName} teamId={submission.teamId} size="md" />
      <span className={`font-heading text-sm tracking-widest ${theme.text}`}>
        {submission.displayName} · {teamName}
        {spoken ? " 🎙️" : ""}
      </span>
      <span className="font-display text-2xl tracking-wide text-gold-400">&ldquo;{submission.text}&rdquo;</span>
      <span className="font-heading text-xs tracking-[0.3em] text-slate-400">SURVEY SAYS…</span>
    </div>
  );
}
