export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { ChunkModel } from "@/models/Chunk";
import { embedBatch } from "@/lib/embeddings";

const BATCH_SIZE = 32; // pode aumentar depois

export async function POST(req: Request) {
  try {
    await connectToDB();
    const url = new URL(req.url);
    const tenantId =
      url.searchParams.get("tenantId") || process.env.DEFAULT_TENANT || "demo";
    const limit = Number(url.searchParams.get("limit") || 256);

    // Busca chunks SEM embedding
    const query: any = {
      tenantId,
      $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
    };

    const chunks = await ChunkModel.find(query)
      .select("_id text")
      .limit(limit)
      .lean();
    if (!chunks.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "Nenhum chunk pendente.",
      });
    }

    let processed = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const slice = chunks.slice(i, i + BATCH_SIZE);
      const inputs = slice.map((c) => c.text);

      // ⬇️ Embeddings LOCAIS (Transformers.js)
      const vectors = await embedBatch(inputs);

      // Atualiza cada chunk com sua embedding
      const ops = slice.map((c, idx) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { embedding: vectors[idx] } },
        },
      }));
      await ChunkModel.bulkWrite(ops);
      processed += slice.length;
    }

    return NextResponse.json({
      ok: true,
      processed,
      provider: "local",
      tenantId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
