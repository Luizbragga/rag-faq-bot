export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { QALogModel } from "@/models/QALog";
import { ChunkModel } from "@/models/Chunk";
import { DocumentModel } from "@/models/Document";

type Percentiles = {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
};

function percentile(arr: number[], p: number): number | null {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const idx = Math.floor((p / 100) * (a.length - 1));
  return a[idx] ?? a[a.length - 1] ?? null;
}

function toYMD(d: Date) {
  // YYYY-MM-DD em local time
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    .toISOString()
    .slice(0, 10);
}

export async function GET(req: Request) {
  await connectToDB();

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || "demo";
  const lookback = Math.min(
    Number(url.searchParams.get("lookback") || 500),
    5000
  ); // logs p/ métricas
  const days = Math.min(Number(url.searchParams.get("days") || 7), 30); // série diária

  // 1) Totais
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalAll, total7d] = await Promise.all([
    QALogModel.countDocuments({ tenantId }),
    QALogModel.countDocuments({ tenantId, createdAt: { $gte: d7 } }),
  ]);

  // 2) Últimos N logs (para latência e série diária)
  const recent = await QALogModel.find({ tenantId })
    .select("latencyMs createdAt retrievedIds")
    .sort({ createdAt: -1 })
    .limit(lookback)
    .lean();

  const latencies = recent
    .map((x: any) => Number(x.latencyMs))
    .filter((x) => Number.isFinite(x));
  const pct: Percentiles = {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    avg: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null,
  };

  // 3) Série diária (últimos X dias)
  const daily: Array<{ day: string; count: number }> = [];
  const dayIdx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = toYMD(d);
    dayIdx.set(key, daily.length);
    daily.push({ day: key, count: 0 });
  }
  for (const r of recent) {
    const key = toYMD(new Date(r.createdAt as any));
    const idx = dayIdx.get(key);
    if (idx != null) daily[idx]!.count++;
  }

  // 4) Top documentos citados
  //    - conta docIds a partir dos retrievedIds
  const allChunkIds = recent.flatMap((x: any) => x.retrievedIds || []);
  const uniqueChunkIds = Array.from(new Set(allChunkIds.map(String))).slice(
    0,
    5000
  );

  let topDocs: Array<{ docId: string; docName: string; hits: number }> = [];
  if (uniqueChunkIds.length) {
    const chunks = await ChunkModel.find({ _id: { $in: uniqueChunkIds } })
      .select("_id docId")
      .lean();

    const byDoc = new Map<string, number>();
    const chunk2doc = new Map<string, string>(
      chunks.map((c: any) => [String(c._id), String(c.docId)])
    );

    for (const cid of allChunkIds) {
      const dId = chunk2doc.get(String(cid));
      if (!dId) continue;
      byDoc.set(dId, (byDoc.get(dId) || 0) + 1);
    }

    const pairs = Array.from(byDoc.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const docIds = pairs.map(([id]) => id);

    const docs = await DocumentModel.find({ _id: { $in: docIds } })
      .select("_id name")
      .lean();

    const nameById = new Map<string, string>(
      docs.map((d: any) => [String(d._id), d.name || "Documento"])
    );
    topDocs = pairs.map(([docId, hits]) => ({
      docId,
      docName: nameById.get(docId) || "Documento",
      hits,
    }));
  }

  return NextResponse.json({
    ok: true,
    totals: { qasAll: totalAll, qas7d: total7d },
    latency: pct,
    daily,
    topDocs,
    sampleSize: recent.length,
    tenantId,
  });
}
