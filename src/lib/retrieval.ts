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

/**
 * Reranker Jina (opcional)
 * - Remove o campo não suportado (top_n/top_k) para evitar 422 "Extra inputs are not permitted".
 * - Normaliza a resposta, que pode vir em `data` ou `results`.
 * - Ordena por score desc e devolve apenas os índices (topK é aplicado no cliente).
 */
async function jinaRerank(query: string, docs: string[], topK: number) {
  const key = process.env.JINA_API_KEY;
  if (!key) return null;

  const payload = {
    model: "jina-reranker-v2-base-multilingual",
    query,
    documents: docs,
    // ❌ NÃO enviar top_n/top_k. A API acusa 422 quando recebe campos extras.
  };

  const res = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jina Rerank ${res.status}: ${t}`);
  }

  const json: any = await res.json();

  // A API pode devolver em `data` ou `results`
  const rows: Array<any> = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.results)
    ? json.results
    : [];

  if (!rows.length) return null;

  // Normaliza e ordena por score desc; devolve só os índices
  const ranked = rows
    .map((r: any, i: number) => ({
      index: typeof r.index === "number" ? r.index : i,
      score:
        typeof r.relevance_score === "number"
          ? r.relevance_score
          : typeof r.score === "number"
          ? r.score
          : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(topK, docs.length));

  // O chamador usa apenas `index`; manter a assinatura enxuta
  return ranked as { index: number; score: number }[] | null;
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

  // 3) candidatos BM25 (índice textual do Mongo)
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

  // 4) Fusão por RRF (soma dos scores parciais)
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

  // 5) Ordena por pontuação combinada
  let fused = Array.from(map.values()).sort(
    (a, b) => b.fusedScore - a.fusedScore
  );

  // 6) Diversificação por documento
  const seenDocs = new Set<string>();
  let diversified: RetrievedItem[] = [];
  for (const item of fused) {
    const keyDoc = item.docId;
    if (!seenDocs.has(keyDoc) || diversified.length < k / 2) {
      diversified.push(item);
      seenDocs.add(keyDoc);
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

  // 7) (Opcional) Rerank com Jina
  if (process.env.JINA_API_KEY && diversified.length > 2) {
    try {
      const texts = diversified.map((d) => d.text);
      const reranked = await jinaRerank(
        query,
        texts,
        Math.min(k, texts.length)
      );
      if (reranked && reranked.length) {
        const ordered = reranked.map((r) => diversified[r.index]);
        diversified = ordered;
      }
    } catch (e) {
      console.warn("Jina reranker falhou, mantendo ordem RRF:", e);
    }
  }

  // 8) Anotar nomes dos documentos
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
