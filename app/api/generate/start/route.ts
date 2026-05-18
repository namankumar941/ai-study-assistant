import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const { title, summary, topics } = await req.json();
  if (!title || !summary || !Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json({ error: "title, summary, and topics required" }, { status: 400 });
  }

  const id = uuidv4();
  const plan = JSON.stringify({ title, summary, topics });

  // Initial skeleton content: title + summary block
  const skeleton = `# ${title}\n\n> ${summary}\n`;

  db.prepare(
    "INSERT INTO markdowns (id, name, content, status, generation_plan) VALUES (?, ?, ?, 'generating', ?)"
  ).run(id, title, skeleton, plan);

  return NextResponse.json({ id });
}
