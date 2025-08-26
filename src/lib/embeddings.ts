import "server-only";

// Provider LOCAL (Transformers.js)
let _localPipe: any = null;

// Faz o lazy-load do pipeline só quando necessário
async function getLocalPipeline() {
  if (_localPipe) return _localPipe;
  const { pipeline } = await import("@xenova/transformers");
  // Modelo compacto / muito usado para semantic search
  _localPipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return _localPipe;
}

/**
 * Gera embeddings normalizados (L2) para um lote de textos.
 * Retorna arrays de números (Float32 -> number[]).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const pipe = await getLocalPipeline();
  const out: number[][] = [];

  // Processa 1 a 1 para economizar memória (poderíamos fazer micro-lotes)
  for (const t of texts) {
    const output = await pipe(t, { pooling: "mean", normalize: true });
    // output.data é Float32Array
    out.push(Array.from(output.data as Float32Array));
  }
  return out;
}
