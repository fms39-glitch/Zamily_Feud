"use client";

import type { SubmissionBanner } from "@zamily-feud/shared";

interface SubmissionBannerViewProps {
  submission: SubmissionBanner | null;
  teamName: string;
}

/** Shows the most recent spoken/typed answer to everyone — the host's reveal/strike buttons are the real verdict. */
export default function SubmissionBannerView({ submission, teamName }: SubmissionBannerViewProps) {
  if (!submission) return null;
  return (
    <div key={submission.submittedAt} className="animate-banner-in rounded-lg border border-gold-500/50 bg-navy-900/80 px-4 py-2 text-center">
      <span className="text-sm text-slate-300">
        {submission.displayName} ({teamName}) said:
      </span>{" "}
      <span className="font-heading text-lg text-gold-400">&ldquo;{submission.text}&rdquo;</span>
    </div>
  );
}
