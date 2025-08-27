// src/app/api/chat/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { hybridRetrieve, RetrievedItem } from "@/lib/retrieval";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function callChat(messages: ChatMsg[]): Promise<string> {
  const payload: any = {
    messages,
    temperature: 0.2,
    max_tokens: 700,
  };

  let url = "";
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 1) GROQ (recomendado)
  if (process.env.GROQ_API_KEY) {
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers.Authorization = `Bearer ${process.env.GROQ_API_KEY}`;
    payload.model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  }
  // 2) OpenRouter (opcional)
  else if (process.env.OPENROUTER_API_KEY) {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE || "";
    headers["X-Title"] = "RAG FAQ Demo";
    payload.model =
      process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
  }
  // 3) OpenAI (fallback)
  else {
    url = "https://api.openai.com/v1/chat/completions";
    headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY ?? ""}`;
    payload.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as any;
  const text =
    json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
  return text;
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

  const user = `
Pergunta: ${question}

Contexto (trechos relevantes):
${bullets}

Instruções:
- Responda SOMENTE com base no contexto acima.
- Seja direto e objetivo.
- Se não houver informação suficiente, diga claramente que não encontrou evidências.
  `.trim();

  const system =
    "Você é um assistente que responde perguntas com base em passagens fornecidas (RAG). Não invente.";

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ] as ChatMsg[];
}

export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = await req.json().catch(() => ({} as any));
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

    // RAG
    const ctx = await hybridRetrieve({ tenantId, query: question, k: 6 });

    // Chamada ao LLM (Groq/OpenRouter/OpenAI)
    const messages = buildPrompt(question, ctx);
    const answer = await callChat(messages);

    const citations = ctx.map((c) => ({
      id: c._id,
      name: c.docName ?? c.docId,
      snippet: c.text,
      page: c.page ?? undefined,
    }));

    return NextResponse.json({ ok: true, answer, citations });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
