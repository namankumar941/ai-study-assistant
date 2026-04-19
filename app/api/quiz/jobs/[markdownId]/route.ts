import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

interface JobRow {
  id: string;
  section_id: string;
  section_title: string;
  status: string;
  generated: number;
  created_at: string;
}

export async function GET(_req: NextRequest, { params }: { params: { markdownId: string } }) {
  const jobs = db
    .prepare(
      `SELECT id, section_id, section_title, status, generated, created_at
       FROM quiz_generation_jobs
       WHERE markdown_id = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(params.markdownId) as unknown as JobRow[];

  const active = jobs.filter((j) => j.status === "running");
  return NextResponse.json({ jobs, hasActive: active.length > 0 });
}
