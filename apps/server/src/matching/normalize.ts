/**
 * Conservative singular-normalization for one word. This is a heuristic, not
 * a real lemmatizer — it only exists to fold "dogs" -> "dog" for the exact/
 * normalized comparison tier. Anything it gets wrong is still caught by the
 * fuzzy/vector/LLM tiers above it.
 */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Normalizes a player/dataset answer for exact-match comparison:
 * unicode-fold, trim, lowercase, strip punctuation, collapse whitespace,
 * and conservatively singularize each word.
 *
 * "  Dog! " / "DOG" / "dogs" all normalize to "dog".
 */
export function normalizeAnswer(input: string, { singular = true }: { singular?: boolean } = {}): string {
  const folded = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();

  if (!singular) return folded;
  if (folded.length === 0) return folded;

  return folded
    .split(" ")
    .map(singularize)
    .join(" ");
}
