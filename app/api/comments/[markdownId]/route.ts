import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";

interface Comment {
  id: string;
  markdown_id: string;
  section_id: string;
  text: string;
  pos_x: number;
  pos_y: number;
  created_at: string;
}

export async function GET(_req: NextRequest, { params }: { params: { markdownId: string } }) {
  const rows = db
    .prepare("SELECT * FROM comments WHERE markdown_id = ? ORDER BY created_at ASC")
    .all(params.markdownId) as unknown as Comment[];
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { text, posX = 120, posY = 120 } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const id = uuidv4();
  db.prepare(
    "INSERT INTO comments (id, markdown_id, section_id, text, pos_x, pos_y) VALUES (?, ?, '', ?, ?, ?)"
  ).run(id, params.markdownId, text, posX, posY);

  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(id) as unknown as Comment;
  return NextResponse.json(comment);
}

// Update text and/or position of an existing comment
export async function PUT(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { commentId, text, posX, posY } = await req.json();

  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];

  if (text !== undefined) { parts.push("text = ?"); values.push(text); }
  if (posX !== undefined) { parts.push("pos_x = ?"); values.push(posX); }
  if (posY !== undefined) { parts.push("pos_y = ?"); values.push(posY); }

  if (parts.length === 0) return NextResponse.json({ ok: true });

  values.push(commentId, params.markdownId);
  db.prepare(`UPDATE comments SET ${parts.join(", ")} WHERE id = ? AND markdown_id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { markdownId: string } }) {
  const { commentId } = await req.json();
  db.prepare("DELETE FROM comments WHERE id = ? AND markdown_id = ?").run(commentId, params.markdownId);
  return NextResponse.json({ ok: true });
}
