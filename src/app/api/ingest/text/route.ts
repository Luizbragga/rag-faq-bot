export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { DocumentModel } from "@/models/Document";
import { ChunkModel } from "@/models/Chunk";
import { chunkTextByParagraphs } from "@/lib/chunking";
import { isDemo, maxDocs } from "@/lib/demo";

type Section = { text: string };
type IngestDoc = { name?: string; sections?: Section[] };
type Body =
  | {
      tenantId?: string;
      text?: string;
      name?: string;
    }
  | {
      tenantId?: string;
      docs?: IngestDoc[];
    };

/** ------------------------------------------------------------------
 * POST /api/ingest/text
 * Aceita:
 *   (A) { tenantId, name, text }
 *   (B) { tenantId, docs: [{ name, sections: [{text}, ...] }] }
 * ------------------------------------------------------------------*/
export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantId = (
      (body as any).tenantId ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();

    // Modo (B): vários docs com sections
    const docs = (body as any).docs as IngestDoc[] | undefined;
    if (Array.isArray(docs) && docs.length) {
      if (isDemo()) {
        const total = await DocumentModel.countDocuments({ tenantId });
        if (total + docs.length > maxDocs()) {
          return NextResponse.json(
            {
              ok: false,
              error: `Limite de ${maxDocs()} documentos na demo (existem ${total}, tentaria criar ${
                docs.length
              }).`,
            },
            { status: 403 }
          );
        }
      }

      let totalChunks = 0;
      const createdDocIds: string[] = [];

      for (const d of docs) {
        const name = d.name || `seed-${new Date().toISOString().slice(0, 19)}`;

        const doc = await DocumentModel.create({
          tenantId,
          name,
          type: "url",
          status: "ready",
          pageCount: null,
        });
        createdDocIds.push(String(doc._id));

        const sections = (d.sections || [])
          .map((s) => (s?.text || "").trim())
          .filter(Boolean);

        if (sections.length) {
          await ChunkModel.insertMany(
            sections.map((t) => ({
              tenantId,
              docId: doc._id,
              source: "url" as const,
              text: t,
              page: null,
            }))
          );
          totalChunks += sections.length;
        }
      }

      return NextResponse.json({
        ok: true,
        docIds: createdDocIds,
        chunks: totalChunks,
        mode: "docs",
      });
    }

    // Modo (A): texto único
    const text = ((body as any).text || "").toString().trim();
    const name = (
      (body as any).name || `seed-${new Date().toISOString().slice(0, 19)}`
    ).toString();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing 'text' in JSON body" },
        { status: 400 }
      );
    }

    if (isDemo()) {
      const total = await DocumentModel.countDocuments({ tenantId });
      if (total >= maxDocs()) {
        return NextResponse.json(
          { ok: false, error: `Limite de ${maxDocs()} documentos na demo.` },
          { status: 403 }
        );
      }
    }

    const doc = await DocumentModel.create({
      tenantId,
      name,
      type: "url",
      status: "ready",
      pageCount: null,
    });

    const pieces = chunkTextByParagraphs(text, 1800, 200);

    if (pieces.length) {
      await ChunkModel.insertMany(
        pieces.map((t) => ({
          tenantId,
          docId: doc._id,
          source: "url" as const,
          text: t,
          page: null,
        }))
      );
    }

    return NextResponse.json({
      ok: true,
      docId: String(doc._id),
      chunks: pieces.length,
      mode: "text",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

/** ------------------------------------------------------------------
 * GET /api/ingest/text?tenantId=demo[&name=seed-manual]
 * Lista documentos (e total de chunks de cada um).
 * ------------------------------------------------------------------*/
export async function GET(req: Request) {
  try {
    await connectToDB();

    const { searchParams } = new URL(req.url);
    const tenantId = (
      searchParams.get("tenantId") ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();
    const name = searchParams.get("name")?.toString();

    const query: any = { tenantId };
    if (name) query.name = name;

    const docs = await DocumentModel.find(query)
      .select("_id name type status createdAt")
      .sort({ createdAt: -1 });

    const withCounts = await Promise.all(
      docs.map(async (d) => {
        const chunks = await ChunkModel.countDocuments({
          tenantId,
          docId: d._id,
        });
        return {
          _id: String(d._id),
          name: d.name,
          type: d.type,
          status: d.status,
          createdAt: d.createdAt,
          chunks,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      count: withCounts.length,
      docs: withCounts,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

/** ------------------------------------------------------------------
 * DELETE /api/ingest/text?tenantId=demo&docId=XYZ
 * DELETE /api/ingest/text?tenantId=demo&name=seed-manual[&keepLatest=true]
 * - docId: apaga um documento específico
 * - name: apaga todos com esse nome; se keepLatest=true, mantém o mais recente
 * ------------------------------------------------------------------*/
export async function DELETE(req: Request) {
  try {
    await connectToDB();

    const { searchParams } = new URL(req.url);
    const tenantId = (
      searchParams.get("tenantId") ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();
    const docId = searchParams.get("docId")?.toString();
    const name = searchParams.get("name")?.toString();
    const keepLatest =
      (searchParams.get("keepLatest") || "").toLowerCase() === "true";

    if (!docId && !name) {
      return NextResponse.json(
        { ok: false, error: "Informe ?docId=... ou ?name=..." },
        { status: 400 }
      );
    }

    if (docId) {
      const doc = await DocumentModel.findOne({ _id: docId, tenantId });
      if (!doc)
        return NextResponse.json(
          { ok: false, error: "Documento não encontrado" },
          { status: 404 }
        );

      await ChunkModel.deleteMany({ tenantId, docId: doc._id });
      await DocumentModel.deleteOne({ _id: doc._id });

      return NextResponse.json({
        ok: true,
        deletedDocId: String(doc._id),
        deletedName: doc.name,
      });
    }

    const docs = await DocumentModel.find({ tenantId, name })
      .select("_id name createdAt")
      .sort({ createdAt: -1 });

    if (!docs.length) {
      return NextResponse.json(
        { ok: false, error: "Nenhum documento com esse nome" },
        { status: 404 }
      );
    }

    let toDelete = docs;
    if (keepLatest && docs.length > 1) {
      toDelete = docs.slice(1); // mantém o mais recente (docs[0])
    }

    const ids = toDelete.map((d) => d._id);
    if (ids.length) {
      await ChunkModel.deleteMany({ tenantId, docId: { $in: ids } });
      await DocumentModel.deleteMany({ _id: { $in: ids } });
    }

    return NextResponse.json({
      ok: true,
      mode: docId ? "byDocId" : keepLatest ? "byNameKeepLatest" : "byNameAll",
      affected: ids.length || 1,
      kept: keepLatest && docs.length ? String(docs[0]._id) : null,
      name: name ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
