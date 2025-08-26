export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";

export async function GET() {
  try {
    const openai = getOpenAI();
    // chamada leve só para validar a chave/SDK
    await openai.models.list();
    return NextResponse.json({ ok: true, openai: "ok" });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, openai: "fail", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
