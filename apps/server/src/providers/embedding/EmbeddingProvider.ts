export interface EmbeddingProvider {
  readonly modelName: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}
