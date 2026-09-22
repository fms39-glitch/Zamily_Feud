import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/server/src/config -> repo root is four levels up.
export const REPO_ROOT = path.resolve(__dirname, "../../../..");
export const DATASET_SOURCE_PATH = path.join(REPO_ROOT, "database/seed/source/FamilyFeud_Questions.json");
export const DATASET_SOURCE_LABEL = "Family_Feud (MacEvelly)";
