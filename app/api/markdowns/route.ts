import { NextResponse } from "next/server";
import db from "@/lib/db";
import { extractSections } from "@/lib/markdown";

export async function GET() {
  const rows = db
    .prepare("SELECT id, name, content, created_at FROM markdowns ORDER BY created_at DESC")
    .all() as unknown as { id: string; name: string; content: string; created_at: string }[];

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
    };
  });

  return NextResponse.json(markdowns);
}
