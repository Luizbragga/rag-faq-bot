export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { QALogModel } from "@/models/QALog";
import { Types } from "mongoose";

type Body = {
  logId?: string;
  feedback?: "up" | "down";
};

export async function POST(req: Request) {
  try {
    await connectToDB();

    const body = (await req.json().catch(() => ({}))) as Body;

    if (!body.logId || !Types.ObjectId.isValid(body.logId)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'logId'" },
        { status: 400 }
      );
    }

    const fb = body.feedback;
    if (fb !== "up" && fb !== "down") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'feedback' (up|down)" },
        { status: 400 }
      );
    }

    const res = await QALogModel.updateOne(
      { _id: new Types.ObjectId(body.logId) },
      { $set: { feedback: fb } }
    );

    return NextResponse.json({ ok: true, updated: res.modifiedCount === 1 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
