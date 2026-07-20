import { NextResponse } from "next/server";
import db from "@/lib/db";

interface QuizQuestionRow {
  id: string;
  markdown_id: string;
  markdown_name: string;
  section_id: string;
  section_title: string;
  question: string;
  answer: string;
  difficulty: string;
  needs_revisit: number;
  last_score: number | null;
  created_at: string;
}

export async function GET() {
  const questions = db
    .prepare(
      `SELECT q.id, q.markdown_id, m.name AS markdown_name,
              q.section_id, q.section_title, q.question, q.answer,
              q.difficulty, q.needs_revisit, q.last_score, q.created_at
       FROM quiz_questions q
       JOIN markdowns m ON q.markdown_id = m.id
       ORDER BY m.name, q.section_title, q.difficulty, q.created_at`
    )
    .all() as unknown as QuizQuestionRow[];

  return NextResponse.json({ questions });
}
