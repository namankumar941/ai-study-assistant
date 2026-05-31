import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";

interface Highlight {
  id: string;
  markdown_id: string;
  section_id: string;
  selected_text: string;
  color: string;
  created_at: string;
}

export async function GET(_req: NextRequest, { params }: { params: { markdownId: string } }) {
  const rows = db
    .prepare("SELECT * FROM highlights WHERE markdown_id = ? ORDER BY created_at ASC")
    .all(params.markdownId) as unknown as Highlight[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { sectionId = "", selectedText, color = "#fef08a" } = await req.json();
  if (!selectedText?.trim()) return NextResponse.json({ error: "selectedText required" }, { status: 400 });

  const id = uuidv4();
  db.prepare(
    "INSERT INTO highlights (id, markdown_id, section_id, selected_text, color) VALUES (?, ?, ?, ?, ?)"
  ).run(id, params.markdownId, sectionId, selectedText, color);

  const row = db.prepare("SELECT * FROM highlights WHERE id = ?").get(id) as unknown as Highlight;
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { highlightId, color } = await req.json();
  if (!highlightId || !color) return NextResponse.json({ error: "highlightId and color required" }, { status: 400 });

  db.prepare("UPDATE highlights SET color = ? WHERE id = ? AND markdown_id = ?").run(color, highlightId, params.markdownId);
  const row = db.prepare("SELECT * FROM highlights WHERE id = ?").get(highlightId) as unknown as Highlight;
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { highlightId } = await req.json();
  if (!highlightId) return NextResponse.json({ error: "highlightId required" }, { status: 400 });
  db.prepare("DELETE FROM highlights WHERE id = ? AND markdown_id = ?").run(highlightId, params.markdownId);
  return NextResponse.json({ ok: true });
}
