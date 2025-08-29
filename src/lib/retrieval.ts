import { Types } from "mongoose";
import { ChunkModel } from "@/models/Chunk";
import { DocumentModel } from "@/models/Document";
import { getEmbedding } from "@/lib/embeddings";
import { dot } from "@/lib/similarity";

export type RetrievedItem = {
  _id: string;
  docId: string;
  docName?: string;
  text: string;
  page?: number | null;
  denseScore?: number;
  bm25Score?: number;
  fusedScore: number;
};

type RetrieveOpts = {
  tenantId: string;
  query: string;
  k?: number;
  denseLimit?: number;
  bm25Limit?: number;
};

export async function hybridRetrieve({
  tenantId,
  query,
  k = 6,
  denseLimit = 200,
  bm25Limit = 20,
}: RetrieveOpts): Promise<RetrievedItem[]> {
  // 1) Embedding da consulta
  const q = await getEmbedding(query);

  // 2) DENSE: candidatos com embedding
  const denseCandidates = await ChunkModel.find(
    { tenantId, embedding: { $exists: true, $type: "array" } },
    { embedding: 1, text: 1, docId: 1, page: 1 }
  )
    .limit(denseLimit)
    .lean();

  const denseRanked: RetrievedItem[] = denseCandidates
    .map((c: any) => ({
      _id: String(c._id),
      docId: String(c.docId),
      text: c.text,
      page: typeof c.page === "number" ? c.page : null,
      denseScore: dot(q, c.embedding as number[]),
      fusedScore: 0,
    }))
    .sort((a, b) => (b.denseScore ?? 0) - (a.denseScore ?? 0))
    .slice(0, 12)
    .map((c, i) => ({ ...c, fusedScore: 1 / (60 + i) }));

  // 3) BM25: texto livre ($text)
  const bm25Candidates = await ChunkModel.find(
    { tenantId, $text: { $search: query } },
    { text: 1, docId: 1, page: 1, score: { $meta: "textScore" } as any }
  )
    .sort({ score: { $meta: "textScore" } as any })
    .limit(bm25Limit)
    .lean();

  const bm25Ranked: RetrievedItem[] = bm25Candidates.map(
    (c: any, i: number) => ({
      _id: String(c._id),
      docId: String(c.docId),
      text: c.text,
      page: typeof c.page === "number" ? c.page : null,
      bm25Score: c.score as number,
      fusedScore: 1 / (60 + i),
    })
  );

  // 4) Fusão simples (soma dos scores; preserva melhor de cada trilha)
  const map = new Map<string, RetrievedItem>();
  const add = (x: RetrievedItem) => {
    const prev = map.get(x._id);
    if (prev) {
      map.set(x._id, {
        ...prev,
        page: prev.page ?? x.page,
        denseScore: x.denseScore ?? prev.denseScore,
        bm25Score: x.bm25Score ?? prev.bm25Score,
        fusedScore: prev.fusedScore + x.fusedScore,
      });
    } else {
      map.set(x._id, x);
    }
  };
  denseRanked.forEach(add);
  bm25Ranked.forEach(add);

  let fused = Array.from(map.values()).sort(
    (a, b) => b.fusedScore - a.fusedScore
  );

  // 5) Diversificação por documento (garante docs variados; metade do k)
  const seenDocs = new Set<string>();
  let diversified: RetrievedItem[] = [];
  const half = Math.max(1, Math.floor(k / 2));
  for (const item of fused) {
    const keyDoc = item.docId;
    if (!seenDocs.has(keyDoc) || diversified.length < half) {
      diversified.push(item);
      seenDocs.add(keyDoc);
    }
    if (diversified.length >= Math.max(k, 1)) break;
  }
  if (diversified.length < k) {
    for (const item of fused) {
      if (!diversified.find((x) => x._id === item._id)) {
        diversified.push(item);
        if (diversified.length >= k) break;
      }
    }
  }

  // 6) Limite rígido de N chunks por documento (default 1; configurável)
  const MAX_PER_DOC_ENV = process.env.RAG_MAX_CHUNKS_PER_DOC ?? "1";
  let MAX_PER_DOC = parseInt(MAX_PER_DOC_ENV, 10);
  if (!Number.isFinite(MAX_PER_DOC) || MAX_PER_DOC < 1) MAX_PER_DOC = 1;

  const counts = new Map<string, number>();
  const capped: RetrievedItem[] = [];
  for (const it of diversified) {
    const c = counts.get(it.docId) ?? 0;
    if (c < MAX_PER_DOC) {
      capped.push(it);
      counts.set(it.docId, c + 1);
    }
    if (capped.length >= k) break;
  }
  diversified = capped;

  // 7) Enriquecer com o nome do documento
  const ids = Array.from(
    new Set(diversified.map((x) => new Types.ObjectId(x.docId)))
  );
  if (ids.length) {
    const docs = await DocumentModel.find({ _id: { $in: ids } })
      .select("_id name")
      .lean();
    const nameById = new Map<string, string>(
      (docs as any[]).map((d) => [String(d._id), d.name])
    );
    diversified = diversified.map((x) => ({
      ...x,
      docName: nameById.get(x.docId),
    }));
  }

  return diversified.slice(0, k);
}
