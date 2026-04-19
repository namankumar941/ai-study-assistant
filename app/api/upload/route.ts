import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.endsWith(".md")) {
      return NextResponse.json({ error: "Only .md files are allowed" }, { status: 400 });
    }

    const content = await file.text();
    const id = uuidv4();
    const name = file.name.replace(/\.md$/, "");

    db.prepare("INSERT INTO markdowns (id, name, content) VALUES (?, ?, ?)").run(id, name, content);

    return NextResponse.json({ id, name });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
