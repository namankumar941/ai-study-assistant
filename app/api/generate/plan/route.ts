import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const { topic } = await req.json();
  if (!topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const response = await callLLM([
    {
      role: "system",
      content: `You are a curriculum designer. Given a study topic, return a structured learning plan as valid JSON only — no markdown, no explanation, no code fences.

Format:
{
  "title": "concise course title",
  "summary": "2-3 sentence overview of what will be covered and why",
  "topics": ["Topic 1", "Topic 2", ...]
}

Rules:
- Generate 5-10 topics that build progressively from foundational to advanced
- Each topic name should be specific and self-contained (3-6 words max)
- Return ONLY the JSON object, nothing else`,
    },
    {
      role: "user",
      content: `I want to study: ${topic}`,
    },
  ]);

  try {
    // strip any accidental markdown fences
    const clean = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const plan = JSON.parse(clean);
    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "Failed to parse plan", raw: response }, { status: 500 });
  }
}
