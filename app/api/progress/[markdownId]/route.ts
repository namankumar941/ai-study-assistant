import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

interface ProgressRow {
  markdown_id: string;
  section_id: string;
  completed: number;
}

export async function GET(_req: NextRequest, { params }: { params: { markdownId: string } }) {
  const rows = db
    .prepare("SELECT section_id, completed FROM progress WHERE markdown_id = ?")
    .all(params.markdownId) as unknown as ProgressRow[];

  const progress: Record<string, boolean> = {};
  for (const row of rows) {
    progress[row.section_id] = row.completed === 1;
  }

  return NextResponse.json(progress);
}

export async function POST(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { sectionId, completed } = await req.json();

  db.prepare(
    `INSERT INTO progress (markdown_id, section_id, completed)
     VALUES (?, ?, ?)
     ON CONFLICT(markdown_id, section_id) DO UPDATE SET completed = excluded.completed`
  ).run(params.markdownId, sectionId, completed ? 1 : 0);

  return NextResponse.json({ ok: true });
}
