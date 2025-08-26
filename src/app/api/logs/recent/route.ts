export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { QALogModel } from "@/models/QALog";

export async function GET(req: Request) {
  await connectToDB();

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") || "demo";
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 200);

  const items = await QALogModel.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({
    ok: true,
    count: items.length,
    items,
  });
}
