import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { question, correctAnswer, userAnswer, questionId } = await req.json();

    const prompt = `Evaluate this interview answer:

Question: ${question}

Correct Answer: ${correctAnswer}

User's Answer: ${userAnswer}

Provide a JSON response with:
- score (1-10)
- strengths (array of strings, what they got right)
- improvements (array of strings, what they missed or could improve)
- summary (one sentence overall feedback)

Respond ONLY with valid JSON.`;

    const raw = await callLLM([
      {
        role: "system",
        content: "You are an interview coach. Evaluate answers fairly and constructively.",
      },
      { role: "user", content: prompt },
    ]);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse evaluation" }, { status: 500 });
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Persist score and auto-flag for revisit if score < 6
    if (questionId) {
      const needsRevisit = evaluation.score < 6 ? 1 : undefined;
      if (needsRevisit !== undefined) {
        db.prepare(
          `UPDATE quiz_questions SET last_score = ?, needs_revisit = ? WHERE id = ?`
        ).run(evaluation.score, needsRevisit, questionId);
      } else {
        db.prepare(`UPDATE quiz_questions SET last_score = ? WHERE id = ?`).run(
          evaluation.score,
          questionId
        );
      }
    }

    return NextResponse.json(evaluation);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
  }
}
