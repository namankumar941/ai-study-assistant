import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { extractSections, Section } from "@/lib/markdown";

const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CHARS = 35000 * APPROX_CHARS_PER_TOKEN; // ~35k tokens, leaves ~5k for system prompt + JSON output

interface QAPair {
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
}

function getSectionWithDescendants(sections: Section[], sectionId: string): Section[] {
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return [];
  const root = sections[idx];
  const result: Section[] = [root];
  for (let i = idx + 1; i < sections.length; i++) {
    if (sections[i].level <= root.level) break;
    result.push(sections[i]);
  }
  return result;
}

function getDirectChildChunks(sections: Section[], sectionId: string): Section[][] {
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return [];
  const root = sections[idx];
  const childLevel = root.level + 1;
  const chunks: Section[][] = [];
  let current: Section[] = [];

  for (let i = idx + 1; i < sections.length; i++) {
    const s = sections[i];
    if (s.level <= root.level) break;
    if (s.level === childLevel) {
      if (current.length > 0) chunks.push(current);
      current = [s];
    } else {
      current.push(s);
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function sectionsToText(sections: Section[]): string {
  return sections.map((s) => `${"#".repeat(s.level)} ${s.title}\n${s.content}`).join("\n\n");
}

async function generateQuestionsForContent(title: string, content: string): Promise<QAPair[]> {
  const prompt = `Generate comprehensive interview questions and detailed answers for this content.
Create questions across all three difficulty levels:
- easy: conceptual/definition questions
- medium: application/comparison questions
- hard: deep analysis/edge cases/system design questions

Section: ${title}
Content:
${content}

Generate as many relevant questions as possible (aim for at least 2-3 per difficulty level).
Respond ONLY with valid JSON array, no extra text:
[
  {"question": "...", "answer": "...", "difficulty": "easy"},
  {"question": "...", "answer": "...", "difficulty": "medium"},
  {"question": "...", "answer": "...", "difficulty": "hard"}
]`;

  const raw = await callLLM([
    {
      role: "system",
      content: "You are an expert technical interviewer. Generate thorough interview questions with detailed answers.",
    },
    { role: "user", content: prompt },
  ]);

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const pairs = JSON.parse(jsonMatch[0]) as QAPair[];
    return pairs.filter(
      (p) => p.question && p.answer && ["easy", "medium", "hard"].includes(p.difficulty)
    );
  } catch {
    return [];
  }
}

async function runGenerationJob(
  jobId: string,
  markdownId: string,
  sectionId: string,
  _content: string,
  allSections: Section[],
  rootTitle: string
) {
  try {
    const targetSections = getSectionWithDescendants(allSections, sectionId);
    const fullContent = sectionsToText(targetSections);

    let allPairs: Array<QAPair & { chunkTitle: string }> = [];

    if (fullContent.length <= MAX_CHARS) {
      const pairs = await generateQuestionsForContent(rootTitle, fullContent);
      allPairs = pairs.map((p) => ({ ...p, chunkTitle: rootTitle }));
    } else {
      const chunks = getDirectChildChunks(allSections, sectionId);
      if (chunks.length === 0) {
        const pairs = await generateQuestionsForContent(rootTitle, fullContent.slice(0, MAX_CHARS));
        allPairs = pairs.map((p) => ({ ...p, chunkTitle: rootTitle }));
      } else {
        for (const chunk of chunks) {
          const chunkTitle = chunk[0].title;
          const chunkContent = sectionsToText(chunk);
          try {
            const pairs = await generateQuestionsForContent(chunkTitle, chunkContent);
            allPairs.push(...pairs.map((p) => ({ ...p, chunkTitle })));
          } catch (err) {
            console.error("Chunk generation error:", chunkTitle, err);
          }
        }
      }
    }

    // Delete old questions only after successful generation
    db.prepare("DELETE FROM quiz_questions WHERE markdown_id = ? AND section_id = ?").run(
      markdownId,
      sectionId
    );

    for (const pair of allPairs) {
      db.prepare(
        `INSERT INTO quiz_questions (id, markdown_id, section_id, section_title, question, answer, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        markdownId,
        sectionId,
        pair.chunkTitle,
        pair.question,
        pair.answer,
        pair.difficulty
      );
    }

    db.prepare(
      `UPDATE quiz_generation_jobs SET status = 'done', generated = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(allPairs.length, jobId);
  } catch (err) {
    console.error("Background generation error:", err);
    db.prepare(
      `UPDATE quiz_generation_jobs SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(String(err), jobId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { markdownId, sectionId } = await req.json();

    const markdown = db
      .prepare("SELECT content FROM markdowns WHERE id = ?")
      .get(markdownId) as { content: string } | undefined;

    if (!markdown) return NextResponse.json({ error: "Markdown not found" }, { status: 404 });

    const allSections = extractSections(markdown.content);
    const targetSection = allSections.find((s) => s.id === sectionId);
    if (!targetSection) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    // Skip if questions already exist for this section
    const existing = db
      .prepare("SELECT COUNT(*) as cnt FROM quiz_questions WHERE markdown_id = ? AND section_id = ?")
      .get(markdownId, sectionId) as { cnt: number };
    if (existing.cnt > 0) {
      return NextResponse.json({ status: "skipped", reason: "questions already exist" });
    }

    // Cancel any existing running job for this section
    db.prepare(
      `UPDATE quiz_generation_jobs SET status = 'cancelled' WHERE markdown_id = ? AND section_id = ? AND status = 'running'`
    ).run(markdownId, sectionId);

    const jobId = uuidv4();
    db.prepare(
      `INSERT INTO quiz_generation_jobs (id, markdown_id, section_id, section_title, status) VALUES (?, ?, ?, ?, 'running')`
    ).run(jobId, markdownId, sectionId, targetSection.title);

    // Fire and forget — runs on server even after client navigates away
    void runGenerationJob(jobId, markdownId, sectionId, markdown.content, allSections, targetSection.title);

    return NextResponse.json({ jobId, status: "started" });
  } catch (err) {
    console.error("Quiz generate error:", err);
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }
}
