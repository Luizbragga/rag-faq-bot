// src/app/api/embeddings/backfill/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { ChunkModel } from "@/models/Chunk";
import { getEmbeddings } from "@/lib/embeddings";

const BATCH_SIZE = 32;

export async function POST() {
  try {
    await connectToDB();

    // Pegamos chunks que ainda NÃO têm embedding salva
    const chunks = await ChunkModel.find(
      { embedding: { $exists: false } },
      { _id: 1, text: 1 }
    ).lean();

    let processed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const slice = chunks.slice(i, i + BATCH_SIZE);
      const inputs = slice.map((c: any) => c.text);

      // Embeddings via OpenAI (compatível com Vercel)
      const vectors = await getEmbeddings(inputs);

      // Atualiza cada chunk com sua embedding correspondente
      const ops = slice.map((c: any, idx: number) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { embedding: vectors[idx] } },
        },
      }));

      await ChunkModel.bulkWrite(ops);
      processed += slice.length;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
