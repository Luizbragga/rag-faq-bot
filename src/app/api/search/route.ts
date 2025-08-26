export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { hybridRetrieve } from "@/lib/retrieval";

export async function POST(req: Request) {
  try {
    await connectToDB();
    const body = await req.json().catch(() => ({}));
    const query = (body.query || body.question || "").toString().trim();
    const tenantId = (
      body.tenantId ||
      process.env.DEFAULT_TENANT ||
      "demo"
    ).toString();
    const k = Number(body.k ?? 6);

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Missing 'query' in JSON body" },
        { status: 400 }
      );
    }

    const items = await hybridRetrieve({ tenantId, query, k });
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
