export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { DocumentModel } from "@/models/Document";
import { ChunkModel } from "@/models/Chunk";
import { chunkTextByParagraphs } from "@/lib/chunking";
import { isDemo, maxDocs } from "@/lib/demo";

type Body = {
  tenantId?: string;
  text?: string;
  name?: string;
};

/** -------------------------------------------
 * POST /api/ingest/text
 * Cria um documento de texto (seed) e gera chunks.
 * ------------------------------------------*/
export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantId = (
      body.tenantId ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();
    const text = (body.text || "").toString().trim();
    const name = (
      body.name || `seed-${new Date().toISOString().slice(0, 19)}`
    ).toString();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Missing 'text' in JSON body" },
        { status: 400 }
      );
    }

    // Limite da DEMO
    if (isDemo()) {
      const total = await DocumentModel.countDocuments({ tenantId });
      if (total >= maxDocs()) {
        return NextResponse.json(
          { ok: false, error: `Limite de ${maxDocs()} documentos na demo.` },
          { status: 403 }
        );
      }
    }

    // Cria o Document compatível com seu enum/type
    const doc = await DocumentModel.create({
      tenantId,
      name,
      type: "url",
      status: "ready",
      pageCount: null,
    });

    // Chunking
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
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

/** -------------------------------------------
 * GET /api/ingest/text?tenantId=demo[&name=seed-manual]
 * Lista documentos (e quantos chunks cada um tem).
 * ------------------------------------------*/
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

/** -------------------------------------------
 * DELETE /api/ingest/text?tenantId=demo&docId=XYZ
 * DELETE /api/ingest/text?tenantId=demo&name=seed-manual[&keepLatest=true]
 *
 * - Com docId: remove apenas esse documento.
 * - Com name: remove todos com esse nome.
 *   Se passarmos keepLatest=true, mantém o MAIS RECENTE e apaga os demais.
 * ------------------------------------------*/
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

    // Apaga por docId (modo direto)
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

    // Apaga por name (pode haver duplicados)
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

    // Se quiser manter apenas o mais recente
    if (keepLatest && docs.length > 1) {
      toDelete = docs.slice(1); // mantém docs[0]
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
