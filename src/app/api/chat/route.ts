export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { hybridRetrieve, RetrievedItem } from "@/lib/retrieval";

// Mensagens no formato OpenAI/Groq
type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/** ---------------- LLM: Groq (recomendado) ---------------- */
async function callLLM(messages: ChatMsg[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não encontrado nas variáveis de ambiente do projeto. Defina GROQ_API_KEY e faça redeploy."
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
    throw new Error(`groq error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as any;
  const text =
    json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";

  return text;
}

/** --------- Prompt com deduplicação por documento ---------- */
/** --------- Prompt com deduplicação por documento ---------- */
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
    "Você é um assistente que responde SOMENTE com base no contexto fornecido (RAG). Não invente.";
  const user = `
Question: ${question}

Context:
${bullets}

Guidelines:
- Answer exclusively in the SAME language as the user's question (Portuguese or English).
- Do NOT mix languages or add inline translations; keep a single language throughout the answer.
- Be clear, concise, and focus only on information present in the context.
- If there isn't enough evidence in the context, say you couldn't find it.
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ] as ChatMsg[];
}

/** ------------------------ Handler ------------------------ */
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

    // Recupera contexto (já diversificado e limitado por doc no retrieval)
    const ctx = await hybridRetrieve({ tenantId, query: question, k: 6 });

    // Monta prompt deduplicado por doc e chama Groq
    const messages = buildPrompt(question, ctx);
    const answer = await callLLM(messages);

    // Citações: também deduplicadas por documento
    const uniqueByDoc = new Map<string, RetrievedItem>();
    for (const c of ctx) {
      if (!uniqueByDoc.has(c.docId)) uniqueByDoc.set(c.docId, c);
    }
    const citations = Array.from(uniqueByDoc.values()).map((c) => ({
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
