import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, "study.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS markdowns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    markdown_id TEXT NOT NULL,
    section_id TEXT DEFAULT '',
    text TEXT NOT NULL,
    pos_x REAL DEFAULT 120,
    pos_y REAL DEFAULT 120,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (markdown_id) REFERENCES markdowns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS progress (
    markdown_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    PRIMARY KEY (markdown_id, section_id),
    FOREIGN KEY (markdown_id) REFERENCES markdowns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
    id TEXT PRIMARY KEY,
    markdown_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    section_title TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    generated INTEGER DEFAULT 0,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    markdown_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    section_title TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    needs_revisit INTEGER DEFAULT 0,
    last_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (markdown_id) REFERENCES markdowns(id) ON DELETE CASCADE
  );
`);

// Migrate existing DBs — add pos_x/pos_y if missing
try { db.exec("ALTER TABLE comments ADD COLUMN pos_x REAL DEFAULT 120"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE comments ADD COLUMN pos_y REAL DEFAULT 120"); } catch { /* already exists */ }
// Migrate quiz_questions columns
try { db.exec("ALTER TABLE quiz_questions ADD COLUMN difficulty TEXT DEFAULT 'medium'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE quiz_questions ADD COLUMN needs_revisit INTEGER DEFAULT 0"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE quiz_questions ADD COLUMN last_score INTEGER"); } catch { /* already exists */ }

export default db;
