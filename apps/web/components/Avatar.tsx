"use client";

import { createContext, useContext } from "react";

/** playerId -> picture data URL, provided once at the page level so any component can show anyone's photo. */
export const AvatarContext = createContext<Record<string, string>>({});

const SIZES = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-11 w-11 text-sm", lg: "h-16 w-16 text-xl", xl: "h-24 w-24 text-3xl" } as const;
const RINGS: Record<string, string> = { "team-1": "ring-sky-400", "team-2": "ring-rose-400" };

interface AvatarProps {
  playerId: string | null | undefined;
  name: string;
  teamId?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** A player's picture in their team-colored ring, or their initials when they haven't added one. */
export default function Avatar({ playerId, name, teamId, size = "sm", className = "" }: AvatarProps) {
  const avatars = useContext(AvatarContext);
  const src = playerId ? avatars[playerId] : undefined;
  const ring = (teamId && RINGS[teamId]) || "ring-gold-500";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-navy-600 to-navy-900 font-heading text-white ring-2 ${ring} ${SIZES[size]} ${className}`}
      title={name}
    >
      {src ? (
        // A data URL from memory: next/image can't optimize it, and doesn't need to.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-label={name}>{initials(name)}</span>
      )}
    </span>
  );
}
