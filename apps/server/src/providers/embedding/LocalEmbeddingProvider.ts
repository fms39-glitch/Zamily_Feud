import type { EmbeddingProvider } from "./EmbeddingProvider.js";

type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Free, local, no-API-key embedding provider using a small ONNX sentence
 * transformer (Xenova/all-MiniLM-L6-v2, 384 dimensions) via
 * @huggingface/transformers. The model is downloaded and cached on first
 * use, then runs entirely on-device — no network calls per embedding.
 *
 * Swap this for a hosted provider later by implementing EmbeddingProvider
 * and pointing EMBEDDING_PROVIDER at it; nothing else in the app depends on
 * this being local.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = "Xenova/all-MiniLM-L6-v2";
  readonly dimension = 384;

  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = import("@huggingface/transformers").then(({ pipeline }) =>
        pipeline("feature-extraction", this.modelName) as unknown as Promise<FeatureExtractionPipeline>,
      );
    }
    return this.extractorPromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  }
}
