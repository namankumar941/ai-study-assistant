import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = db.prepare("SELECT * FROM markdowns WHERE id = ?").get(params.id) as unknown as
    | { id: string; name: string; content: string; created_at: string }
    | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  db.prepare("DELETE FROM markdowns WHERE id = ?").run(params.id);
  return NextResponse.json({ ok: true });
}
