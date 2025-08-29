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

/** --- Reranker Jina (opcional; ativa se JINA_API_KEY existir) --- */
async function jinaRerank(query: string, docs: string[], topK: number) {
  const key = process.env.JINA_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "jina-reranker-v2-base-multilingual",
      query,
      documents: docs,
      top_n: Math.min(topK, docs.length),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.warn("Jina reranker error", res.status, t);
    return null;
  }
  const json = (await res.json()) as {
    results: { index: number; relevance_score: number }[];
  };
  return json.results;
}

export async function hybridRetrieve({
  tenantId,
  query,
  k = 6,
  denseLimit = 200,
  bm25Limit = 20,
}: RetrieveOpts): Promise<RetrievedItem[]> {
  // 1) embedding da query
  const q = await getEmbedding(query);

  // 2) candidatos densos
  const denseCandidates = await ChunkModel.find(
    { tenantId, embedding: { $exists: true, $type: "array" } },
    { embedding: 1, text: 1, docId: 1, page: 1 }
  )
    .limit(denseLimit)
    .lean();

  const denseRanked = denseCandidates
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
    .map((c, i) => ({ ...c, fusedScore: 1 / (60 + i) })); // RRF parcial

  // 3) BM25
  const bm25Candidates = await ChunkModel.find(
    { tenantId, $text: { $search: query } },
    { text: 1, docId: 1, page: 1, score: { $meta: "textScore" } as any }
  )
    .sort({ score: { $meta: "textScore" } as any })
    .limit(bm25Limit)
    .lean();

  const bm25Ranked = bm25Candidates.map((c: any, i: number) => ({
    _id: String(c._id),
    docId: String(c.docId),
    text: c.text,
    page: typeof c.page === "number" ? c.page : null,
    bm25Score: c.score as number,
    fusedScore: 1 / (60 + i), // RRF parcial
  }));

  // 4) Fusão RRF
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

  // 5) Diversificação por documento
  const seenDocs = new Set<string>();
  let diversified: RetrievedItem[] = [];
  for (const item of fused) {
    const keyDoc = item.docId;
    if (!seenDocs.has(keyDoc) || diversified.length < Math.floor(k / 2)) {
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

  // 6) Rerank da Jina (se houver chave) — reduz redundância
  if (process.env.JINA_API_KEY && diversified.length > 2) {
    try {
      const texts = diversified.map((d) => d.text);
      const reranked = await jinaRerank(
        query,
        texts,
        Math.min(k, texts.length)
      );
      if (reranked && reranked.length) {
        // reordena de acordo com os índices retornados
        const ordered = reranked
          .map((r) => diversified[r.index])
          .filter(Boolean);
        diversified = ordered;
      }
    } catch (e) {
      console.warn("Reranker falhou, mantendo ordem:", e);
    }
  }

  // 7) Anotar nomes de documentos
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
