// src/lib/embeddings.ts
// Usa OpenAI Embeddings no server (funciona na Vercel)

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Embedding único (string -> vetor)
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding as unknown as number[];
}

// Embeddings em lote (string[] -> number[][])
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}
