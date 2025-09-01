// src/lib/embeddings.ts
type Vec = number[];

// Preferências por provider via env
const JINA_KEY = process.env.JINA_API_KEY;
const COHERE_KEY = process.env.COHERE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const JINA_MODEL = process.env.JINA_EMBEDDINGS_MODEL || "jina-embeddings-v3"; // default recomendado
const COHERE_MODEL =
  process.env.COHERE_EMBEDDINGS_MODEL || "embed-multilingual-v3.0";
const OPENAI_MODEL =
  process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small";

/**
 * Jina embeddings
 * API: https://api.jina.ai/v1/embeddings
 * Campos aceitos: model, input
 * NÃO usar "encoding_format" (é da OpenAI) — causava 422.
 */
async function jinaEmbed(inputs: string[]): Promise<Vec[]> {
  if (!JINA_KEY) throw new Error("JINA_API_KEY não configurado");

  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JINA_KEY}`,
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      input: inputs, // apenas isso!
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jina error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { data?: { embedding?: number[] }[] } & {
    embeddings?: number[][];
    output?: any;
  };

  // Normaliza retorno
  const vecs: Vec[] =
    json?.data?.map((d) => d.embedding as number[]) ?? json?.embeddings ?? [];

  if (!vecs.length) {
    throw new Error("Jina embeddings: resposta sem vetores");
  }

  return vecs;
}

/**
 * Cohere embeddings
 */
async function cohereEmbed(inputs: string[]): Promise<Vec[]> {
  if (!COHERE_KEY) throw new Error("COHERE_API_KEY não configurado");

  const res = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${COHERE_KEY}`,
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      texts: inputs,
      input_type: "search_document",
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Cohere error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { embeddings: number[][] };
  if (!json.embeddings?.length) {
    throw new Error("Cohere embeddings: resposta sem vetores");
  }
  return json.embeddings;
}

/**
 * OpenAI embeddings
 */
async function openaiEmbed(inputs: string[]): Promise<Vec[]> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY não configurado");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vecs = json.data?.map((d) => d.embedding) ?? [];
  if (!vecs.length) {
    throw new Error("OpenAI embeddings: resposta sem vetores");
  }
  return vecs;
}

/**
 * Retorna o embedding de um único texto
 */
export async function getEmbedding(text: string): Promise<Vec> {
  const arr = await getEmbeddings([text]);
  return arr[0];
}

/**
 * Resolve embeddings com ordem de preferência e fallback:
 * 1) Jina (se houver JINA_API_KEY)
 * 2) Cohere (se houver COHERE_API_KEY)
 * 3) OpenAI (se houver OPENAI_API_KEY)
 */
export async function getEmbeddings(texts: string[]): Promise<Vec[]> {
  // 1) Jina
  if (JINA_KEY) {
    try {
      return await jinaEmbed(texts);
    } catch (e) {
      console.warn("[Embeddings] Jina falhou:", e);
      // continua para fallback
    }
  }

  // 2) Cohere
  if (COHERE_KEY) {
    try {
      return await cohereEmbed(texts);
    } catch (e) {
      console.warn("[Embeddings] Cohere falhou:", e);
      // continua para fallback
    }
  }

  // 3) OpenAI
  if (OPENAI_KEY) {
    return await openaiEmbed(texts);
  }

  throw new Error(
    "Nenhum provedor de embeddings está configurado. Defina pelo menos JINA_API_KEY, ou COHERE_API_KEY, ou OPENAI_API_KEY."
  );
}
