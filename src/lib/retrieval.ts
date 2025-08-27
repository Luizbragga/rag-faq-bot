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
  page?: number | null; // ⬅️ novo: número da página (quando vier de PDF)
  denseScore?: number;
  bm25Score?: number;
  fusedScore: number;
};

type RetrieveOpts = {
  tenantId: string;
  query: string;
  k?: number; // quantos resultados finais
  denseLimit?: number; // quantos candidatos densos pegar do banco
  bm25Limit?: number; // quantos candidatos BM25 pegar
};

export async function hybridRetrieve({
  tenantId,
  query,
  k = 6,
  denseLimit = 200,
  bm25Limit = 20,
}: RetrieveOpts): Promise<RetrievedItem[]> {
  // 1) embedding da query
  const q = await getEmbedding(query);

  // 2) candidatos densos (com embedding armazenado)
  const denseCandidates = await ChunkModel.find(
    { tenantId, embedding: { $exists: true, $type: "array" } },
    { embedding: 1, text: 1, docId: 1, page: 1 } // ⬅️ incluir page
  )
    .limit(denseLimit)
    .lean();

  const denseRanked = denseCandidates
    .map((c: any) => ({
      _id: String(c._id),
      docId: String(c.docId),
      text: c.text,
      page: typeof c.page === "number" ? c.page : null, // ⬅️ propagar page
      denseScore: dot(q as number[], c.embedding as number[]),
      fusedScore: 0, // será definido pelo RRF
    }))
    .sort((a, b) => b.denseScore! - a.denseScore!)
    .slice(0, 12)
    .map((c, i) => ({ ...c, fusedScore: 1 / (60 + i) })); // RRF parcial

  // 3) candidatos BM25 (índice textual do Mongo)
  const bm25Candidates = await ChunkModel.find(
    { tenantId, $text: { $search: query } },
    { text: 1, docId: 1, page: 1, score: { $meta: "textScore" } as any } // ⬅️ incluir page
  )
    .sort({ score: { $meta: "textScore" } as any })
    .limit(bm25Limit)
    .lean();

  const bm25Ranked = bm25Candidates.map((c: any, i: number) => ({
    _id: String(c._id),
    docId: String(c.docId),
    text: c.text,
    page: typeof c.page === "number" ? c.page : null, // ⬅️ propagar page
    bm25Score: c.score as number,
    fusedScore: 1 / (60 + i), // RRF parcial
  }));

  // 4) Fusão por RRF
  const map = new Map<string, RetrievedItem>();
  const add = (x: RetrievedItem) => {
    const prev = map.get(x._id);
    if (prev) {
      map.set(x._id, {
        ...prev,
        page: prev.page ?? x.page, // mantém se já tiver
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

  // 5) Ordena por pontuação combinada e corta em K
  let fused = Array.from(map.values()).sort(
    (a, b) => b.fusedScore - a.fusedScore
  );

  // 6) (opcional) diversificação por documento
  const seenDocs = new Set<string>();
  let diversified: RetrievedItem[] = [];
  for (const item of fused) {
    const key = item.docId;
    if (!seenDocs.has(key) || diversified.length < k / 2) {
      diversified.push(item);
      seenDocs.add(key);
    }
    if (diversified.length >= k) break;
  }
  if (diversified.length < k) {
    for (const item of fused) {
      if (!diversified.find((x) => x._id === item._id)) {
        diversified.push(item);
        if (diversified.length >= k) break;
      }
    }
  }

  // 7) anotar nome do documento (para citações)
  const ids = Array.from(
    new Set(diversified.map((x) => new Types.ObjectId(x.docId)))
  );
  if (ids.length) {
    const docs = await DocumentModel.find({ _id: { $in: ids } })
      .select("_id name")
      .lean();
    const nameById = new Map<string, string>(
      docs.map((d: any) => [String(d._id), d.name])
    );
    diversified = diversified.map((x) => ({
      ...x,
      docName: nameById.get(x.docId),
    }));
  }

  return diversified.slice(0, k);
}
