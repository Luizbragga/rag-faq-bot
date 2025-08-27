// src/lib/embeddings.ts
/**
 * Embeddings determinísticos por provedor.
 * Nunca faz fallback automático para OpenAI.
 *
 * Configure no Projeto (Vercel → Project → Settings → Environment Variables):
 *  - EMBEDDINGS_PROVIDER=jina   (ou cohere | openai)
 *  - JINA_API_KEY=...           (se usar jina)
 *  - COHERE_API_KEY=...         (se usar cohere)
 *  - OPENAI_API_KEY=...         (se usar openai)
 */

type Vec = number[];

const PROVIDER = (process.env.EMBEDDINGS_PROVIDER || "jina").toLowerCase();
const JINA_KEY = process.env.JINA_API_KEY;
const COHERE_KEY = process.env.COHERE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// -------------------- Jina --------------------
async function jinaEmbed(inputs: string[]): Promise<Vec[]> {
  if (!JINA_KEY) {
    throw new Error(
      "JINA_API_KEY não configurado. Defina JINA_API_KEY e redeploy."
    );
  }

  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${JINA_KEY}`,
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: inputs,
      encoding_format: "float",
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jina error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

// -------------------- Cohere --------------------
async function cohereEmbed(inputs: string[]): Promise<Vec[]> {
  if (!COHERE_KEY) {
    throw new Error(
      "COHERE_API_KEY não configurado. Defina COHERE_API_KEY e redeploy."
    );
  }

  const res = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${COHERE_KEY}`,
    },
    body: JSON.stringify({
      model: "embed-multilingual-v3.0",
      texts: inputs,
      input_type: "search_document",
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Cohere error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { embeddings: number[][] };
  return json.embeddings;
}

// -------------------- OpenAI (opcional) --------------------
async function openaiEmbed(inputs: string[]): Promise<Vec[]> {
  if (!OPENAI_KEY) {
    throw new Error(
      "OPENAI_API_KEY não configurado. Defina OPENAI_API_KEY e redeploy."
    );
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: inputs,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

// -------------------- API pública --------------------
export async function getEmbeddings(texts: string[]): Promise<Vec[]> {
  switch (PROVIDER) {
    case "jina":
      return await jinaEmbed(texts);
    case "cohere":
      return await cohereEmbed(texts);
    case "openai":
      return await openaiEmbed(texts);
    default:
      throw new Error(
        `EMBEDDINGS_PROVIDER inválido: "${PROVIDER}". Use "jina", "cohere" ou "openai".`
      );
  }
}

export async function getEmbedding(text: string): Promise<Vec> {
  const arr = await getEmbeddings([text]);
  return arr[0];
}
