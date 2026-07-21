import { NextResponse } from "next/server";
import db from "@/lib/db";
import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "study.db");

export async function POST() {
  if (process.env.NEXT_PUBLIC_DB_BACKUP_ENABLED !== "true") {
    return NextResponse.json({ error: "Backup disabled" }, { status: 403 });
  }

  const backupName = process.env.DB_BACKUP_NAME || "study.db.bak";
  const backupPath = path.join(DB_DIR, backupName);

  try {
    db.exec("PRAGMA wal_checkpoint(FULL)");
    fs.copyFileSync(DB_PATH, backupPath);
    const { size } = fs.statSync(backupPath);
    return NextResponse.json({
      success: true,
      name: backupName,
      size,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
