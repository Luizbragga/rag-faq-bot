// src/app/api/chat/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { hybridRetrieve, RetrievedItem } from "@/lib/retrieval";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function callGroq(messages: ChatMsg[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não configurado. Defina a variável na Vercel e faça redeploy."
    );
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const payload = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 700,
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as any;
  const text =
    json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";

  return { text, provider: "groq" as const, model };
}

function buildPrompt(question: string, ctx: RetrievedItem[]) {
  const bullets = ctx
    .map(
      (c, i) =>
        `(${i + 1}) ${c.text.trim()} — fonte: ${c.docName ?? c.docId}${
          c.page != null ? ` (p. ${c.page})` : ""
        }`
    )
    .join("\n");

  const system =
    "Você é um assistente RAG. Responda SOMENTE com base no contexto abaixo. " +
    "Se faltar evidência, diga que não encontrou. Seja sucinto.";

  const user = `
Pergunta: ${question}

Contexto:
${bullets}

Regras de estilo:
- Responda em no máximo 3 bullets curtos e diretos.
- Se houver número de página, cite-o no final de cada bullet.
- Não invente nada fora do contexto.
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ] as ChatMsg[];
}

export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = (await req.json().catch(() => ({}))) as any;
    const question = (body.question || body.q || "").toString().trim();
    const tenantId = (
      body.tenantId ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();

    if (!question) {
      return NextResponse.json(
        { ok: false, error: "Missing 'question' in body" },
        { status: 400 }
      );
    }

    const ctx = await hybridRetrieve({ tenantId, query: question, k: 6 });

    const messages = buildPrompt(question, ctx);
    const { text: answer, provider, model } = await callGroq(messages);

    const citations = ctx.map((c) => ({
      id: c._id,
      name: c.docName ?? c.docId,
      snippet: c.text,
      page: c.page ?? undefined,
    }));

    return NextResponse.json({ ok: true, answer, citations, provider, model });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
