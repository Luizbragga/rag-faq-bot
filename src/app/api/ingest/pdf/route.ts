export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { DocumentModel } from "@/models/Document";
import { ChunkModel } from "@/models/Chunk";
import { chunkTextByParagraphs } from "@/lib/chunking";
import { isDemo, maxDocs } from "@/lib/demo";

export async function POST(req: Request) {
  try {
    await connectToDB();

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const tenantId =
      (form.get("tenantId") as string) || process.env.DEFAULT_TENANT || "demo";

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "Missing 'file' (multipart/form-data)" },
        { status: 400 }
      );
    }

    // Limite da DEMO — checar ANTES de processar PDF/criar Document
    if (isDemo()) {
      const total = await DocumentModel.countDocuments({ tenantId });
      if (total >= maxDocs()) {
        return NextResponse.json(
          { ok: false, error: `Limite de ${maxDocs()} documentos na demo.` },
          { status: 403 }
        );
      }
    }

    // Parse do PDF coletando texto por página
    const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
    const buf = Buffer.from(await file.arrayBuffer());

    const pages: string[] = [];
    const pagerender = (pageData: any) =>
      pageData.getTextContent().then((tc: any) => {
        const text = tc.items.map((i: any) => i.str).join(" ");
        pages.push(text || "");
        return text || "";
      });

    const parsed = await pdfParse(buf, { pagerender });
    const pageCount =
      (parsed.numpages as number) || (pages.length ? pages.length : undefined);

    // Criar Document "processing"
    const doc = await DocumentModel.create({
      tenantId,
      name: file.name,
      type: "pdf",
      status: "processing",
      pageCount,
    });

    // Chunking por página, gravando o número da página
    const bulk: Array<{ text: string; page: number }> = [];
    if (pages.length) {
      for (let p = 0; p < pages.length; p++) {
        const pageText = pages[p] || "";
        const pieces = chunkTextByParagraphs(pageText, 1800, 200);
        for (const t of pieces) bulk.push({ text: t, page: p + 1 });
      }
    } else {
      // Fallback: se por algum motivo não veio por página, faz um bloco único
      const fullText = parsed.text || "";
      const pieces = chunkTextByParagraphs(fullText, 1800, 200);
      for (const t of pieces) bulk.push({ text: t, page: 1 });
    }

    if (bulk.length) {
      await ChunkModel.insertMany(
        bulk.map(({ text, page }) => ({
          tenantId,
          docId: doc._id,
          source: "pdf" as const,
          text,
          page, // <<-- grava a página
        }))
      );
    }

    // Finalizar status
    await DocumentModel.updateOne(
      { _id: doc._id },
      { $set: { status: "ready" } }
    );

    return NextResponse.json({
      ok: true,
      docId: String(doc._id),
      chunks: bulk.length,
      pages: pageCount ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
