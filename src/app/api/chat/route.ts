export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { hybridRetrieve } from "@/lib/retrieval";
import { makeExtractiveAnswer, snippet } from "@/lib/extractive";
import { QALogModel } from "@/models/QALog";
import { Types } from "mongoose";

export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = await req.json().catch(() => ({}));
    const query = (body.query || body.question || "").toString().trim();
    const tenantId = (
      body.tenantId ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();
    const k = Number(body.k ?? 6);

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Missing 'query' in JSON body" },
        { status: 400 }
      );
    }

    const t0 = Date.now();

    // 1) retrieval (semântico + BM25 + RRF)
    const items = await hybridRetrieve({ tenantId, query, k });

    // 2) montar resposta (extractiva) e citações
    let answer: string;
    let citations: Array<{
      chunkId: string;
      docId: string;
      docName: string;
      preview: string;
      page?: number | null;
    }>;

    if (!items.length) {
      answer = "Não encontrei evidências nos documentos para responder.";
      citations = [];
    } else {
      answer = makeExtractiveAnswer(
        query,
        items.map((i) => i.text)
      );
      citations = items.map((i) => ({
        chunkId: i._id,
        docId: i.docId,
        docName: i.docName ?? "Documento",
        preview: snippet(i.text),
        page: (i as any).page ?? null,
      }));
    }

    // 3) LOG (e capturar id)
    let logId: string | null = null;
    try {
      const retrievedIds = items
        .map((i) => {
          try {
            return new Types.ObjectId(i._id);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Types.ObjectId[];

      const created = await QALogModel.create({
        tenantId,
        question: query,
        retrievedIds,
        model: "extractive-local",
        latencyMs: Date.now() - t0,
        costUsd: 0,
        hadCitation: citations.length > 0,
        // feedback: null (default)
      });

      logId = String(created._id);
    } catch {
      // não falha a requisição se o log der erro
    }

    // 4) resposta
    return NextResponse.json({ ok: true, answer, citations, logId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
