import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";

interface ImportedQuestion {
  question: string;
  answer: string;
  difficulty?: "easy" | "medium" | "hard";
  section_title?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { markdownId: string } }
) {
  try {
    const { markdownId } = params;
    const body = await req.json();
    const questions: ImportedQuestion[] = Array.isArray(body) ? body : body.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Expected a non-empty array of questions" }, { status: 400 });
    }

    const markdown = db
      .prepare("SELECT id FROM markdowns WHERE id = ?")
      .get(markdownId) as { id: string } | undefined;

    if (!markdown) return NextResponse.json({ error: "Markdown not found" }, { status: 404 });

    let inserted = 0;
    for (const q of questions) {
      if (!q.question?.trim() || !q.answer?.trim()) continue;
      const difficulty: string = ["easy", "medium", "hard"].includes(q.difficulty ?? "")
        ? (q.difficulty as string)
        : "medium";
      const sectionTitle = q.section_title?.trim() || "Imported";

      db.prepare(
        `INSERT INTO quiz_questions (id, markdown_id, section_id, section_title, question, answer, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), markdownId, "imported", sectionTitle, q.question.trim(), q.answer.trim(), difficulty);
      inserted++;
    }

    return NextResponse.json({ inserted });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
