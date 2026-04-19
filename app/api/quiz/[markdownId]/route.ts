import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

interface QuizQuestion {
  id: string;
  markdown_id: string;
  section_id: string;
  section_title: string;
  question: string;
  answer: string;
  difficulty: string;
  needs_revisit: number;
  last_score: number | null;
  created_at: string;
}

export async function GET(_req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { markdownId } = params;

  const markdown = db
    .prepare("SELECT id FROM markdowns WHERE id = ?")
    .get(markdownId) as { id: string } | undefined;

  if (!markdown) return NextResponse.json({ error: "Markdown not found" }, { status: 404 });

  const questions = db
    .prepare(
      `SELECT id, markdown_id, section_id, section_title, question, answer,
              difficulty, needs_revisit, last_score, created_at
       FROM quiz_questions
       WHERE markdown_id = ?
       ORDER BY section_title, difficulty, created_at`
    )
    .all(markdownId) as unknown as QuizQuestion[];

  return NextResponse.json({ questions });
}
