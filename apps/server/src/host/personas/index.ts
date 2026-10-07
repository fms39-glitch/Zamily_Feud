import type { AgeCategory } from "@zamily-feud/shared";
import type { Persona } from "./persona.js";
import { FAMILY_FRIENDLY_PERSONA } from "./familyFriendly.js";
import { SASSY_PERSONA } from "./sassy.js";
import { MILLENNIAL_PERSONA } from "./millennial.js";
import { GEN_Z_PERSONA } from "./genZ.js";

export type { Persona } from "./persona.js";
export { renderPersona } from "./persona.js";

/** One file per persona; add a new one here and in HOST_PERSONAS (shared). */
export const PERSONAS: Record<AgeCategory, Persona> = {
  FAMILY_FRIENDLY: FAMILY_FRIENDLY_PERSONA,
  SASSY: SASSY_PERSONA,
  MILLENNIAL: MILLENNIAL_PERSONA,
  GEN_Z: GEN_Z_PERSONA,
};
