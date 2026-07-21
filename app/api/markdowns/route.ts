import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";
import { extractSections } from "@/lib/markdown";

export async function GET() {
  const rows = db
    .prepare("SELECT id, name, content, status, created_at FROM markdowns ORDER BY created_at DESC")
    .all() as unknown as { id: string; name: string; content: string; status: string; created_at: string }[];

  const markdowns = rows.map(({ content, ...row }) => {
    const totalSections = extractSections(content).length;
    const completedSections = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM progress WHERE markdown_id = ? AND completed = 1"
        )
        .get(row.id) as unknown as { cnt: number }
    ).cnt;

    return {
      ...row,
      totalSections,
      completedSections,
      status: row.status ?? "ready",
    };
  });

  return NextResponse.json(markdowns);
}

export async function POST(req: NextRequest) {
  try {
    const { name, content } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const id = uuidv4();
    db.prepare("INSERT INTO markdowns (id, name, content) VALUES (?, ?, ?)").run(id, name.trim(), content ?? "");
    return NextResponse.json({ id, name: name.trim() });
  } catch {
    return NextResponse.json({ error: "Failed to create file" }, { status: 500 });
  }
}
