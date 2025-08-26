export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import "@/models/Document";
import { ChunkModel } from "@/models/Chunk";
import "@/models/QALog";

export async function GET() {
  try {
    await connectToDB();
    // garante índices (ex.: text index do campo text)
    await ChunkModel.syncIndexes();

    const indexes = await ChunkModel.collection.indexes();
    return NextResponse.json({ ok: true, chunkIndexes: indexes });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
