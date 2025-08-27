// src/lib/embeddings.ts
type Vec = number[];

const JINA_KEY = process.env.JINA_API_KEY;
const COHERE_KEY = process.env.COHERE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function jinaEmbed(inputs: string[]): Promise<Vec[]> {
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

async function cohereEmbed(inputs: string[]): Promise<Vec[]> {
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

async function openaiEmbed(inputs: string[]): Promise<Vec[]> {
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

export async function getEmbedding(text: string): Promise<Vec> {
  const arr = await getEmbeddings([text]);
  return arr[0];
}

export async function getEmbeddings(texts: string[]): Promise<Vec[]> {
  if (JINA_KEY) return await jinaEmbed(texts);
  if (COHERE_KEY) return await cohereEmbed(texts);
  if (OPENAI_KEY) return await openaiEmbed(texts);
  throw new Error(
    "Nenhuma chave de embeddings configurada. Defina JINA_API_KEY ou COHERE_API_KEY ou OPENAI_API_KEY."
  );
}
