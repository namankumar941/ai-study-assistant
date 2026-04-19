import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array required" }, { status: 400 });
    }
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM quiz_questions WHERE id IN (${placeholders})`).run(...ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete questions" }, { status: 500 });
  }
}
