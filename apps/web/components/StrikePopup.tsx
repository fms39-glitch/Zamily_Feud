"use client";

import Image from "next/image";

interface StrikePopupProps {
  visible: boolean;
}

/** Full-screen strike flash: the authentic red X, with a screen-shake on the backdrop. */
export default function StrikePopup({ visible }: StrikePopupProps) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-900/30 animate-screen-shake">
      <div className="absolute inset-0 border-[12px] border-red-600" />
      <Image
        src="/assets/Wrong.svg"
        alt="Strike"
        width={200}
        height={264}
        className="h-64 w-auto animate-strike-pop drop-shadow-[0_0_40px_rgba(220,38,38,0.9)]"
      />
    </div>
  );
}
