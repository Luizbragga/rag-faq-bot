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
// --- add this helper near buildPrompt ---
function guessLang(s: string): "en" | "pt" {
  const t = (s || "").toLowerCase();

  // sinais fortes de PT (acentos)
  if (/[áàâãéêíóôõúüç]/.test(t)) return "pt";

  // palavras-chave em EN/PT
  if (/\b(what|when|how|where|who|which|support|schedule|hours)\b/.test(t))
    return "en";
  if (
    /\b(que|quando|como|onde|quem|qual|quais|horario|horário|suporte)\b/.test(t)
  )
    return "pt";

  // fallback baseado em palavras funcionais comuns
  if (/\b(the|is|are|do|does|did|can|should|could|would)\b/.test(t))
    return "en";

  // último recurso: PT
  return "pt";
}

function buildPrompt(question: string, ctx: RetrievedItem[]) {
  const lang = guessLang(question); // "en" | "pt"

  const bullets = ctx
    .map(
      (c, i) =>
        `(${i + 1}) ${c.text.trim()} — source: ${c.docName ?? c.docId}${
          c.page != null ? ` (p. ${c.page})` : ""
        }`
    )
    .join("\n");

  const langLabel = lang === "en" ? "English" : "Portuguese (pt-BR)";

  const system = `
You are a Retrieval-Augmented assistant. Answer ONLY using the provided context. Do NOT invent.
Language: ${langLabel}. Reply fully in ${langLabel}.
Style:
- Answer directly; no fillers like “Based on the provided context”, apologies, or hedging.
- If the question and context are not a perfect match but there is relevant info, answer with what *is* in the context and clarify the scope (e.g., “Human support hours are …”).
- Only say you couldn't find enough evidence if there is truly nothing relevant in the context.
`.trim();

  const user = `
Question:
${question}

Context:
${bullets}

Rules:
- Be concise and clear; use bullet points only if they help.
- Use *only* the context above.
- If there isn't enough evidence at all, state it clearly; otherwise, answer directly without meta commentary.
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
