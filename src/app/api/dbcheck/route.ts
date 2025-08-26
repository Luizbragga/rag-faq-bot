export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";

export async function GET() {
  try {
    const conn = await connectToDB();

    // Campos seguros para TS:
    // name = nome do banco; readyState: 1 = conectado
    const info = {
      name: conn.connection.name,
      readyState: conn.connection.readyState,
    };

    return NextResponse.json({ ok: true, db: "ok", info });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, db: "fail", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
