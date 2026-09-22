import type { AppConfig } from "../../config/env.js";
import type { EmbeddingProvider } from "./EmbeddingProvider.js";
import { LocalEmbeddingProvider } from "./LocalEmbeddingProvider.js";

export type { EmbeddingProvider } from "./EmbeddingProvider.js";

/** Bump when the embedding model or preprocessing changes, to trigger re-embedding (spec §31). */
export const CURRENT_EMBEDDING_VERSION = 1;

export function getEmbeddingProvider(config: AppConfig): EmbeddingProvider {
  switch (config.EMBEDDING_PROVIDER) {
    case "local":
      return new LocalEmbeddingProvider();
    default:
      throw new Error(
        `Unknown EMBEDDING_PROVIDER "${config.EMBEDDING_PROVIDER}". Only "local" is implemented so far.`,
      );
  }
}
