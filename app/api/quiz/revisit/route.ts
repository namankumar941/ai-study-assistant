import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { questionId, revisit } = await req.json();

    db.prepare("UPDATE quiz_questions SET needs_revisit = ? WHERE id = ?").run(
      revisit ? 1 : 0,
      questionId
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update revisit flag" }, { status: 500 });
  }
}
