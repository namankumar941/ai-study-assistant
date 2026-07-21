"use client";
import { useState } from "react";
import VoiceButton from "./VoiceButton";

interface Props {
  markdownId: string;
  rawContent: string;
  currentSectionTitle?: string;
  onClose: () => void;
  onAdded: (newContent: string) => void;
}

function insertSection(
  existing: string,
  sectionMd: string,
  position: "end" | "after-current",
  currentTitle?: string
): string {
  if (position === "end" || !currentTitle) {
    return existing.trimEnd() + "\n\n" + sectionMd;
  }

  const lines = existing.split("\n");
  const escaped = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetIdx = lines.findIndex((l) => l.match(new RegExp(`^#{1,3}\\s+${escaped}\\s*$`)));
  if (targetIdx === -1) return existing.trimEnd() + "\n\n" + sectionMd;

  const targetLevel = (lines[targetIdx].match(/^(#+)/)?.[1] ?? "##").length;
  let insertIdx = lines.length;
  for (let i = targetIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,3})\s/);
    if (m && m[1].length <= targetLevel) { insertIdx = i; break; }
  }

  const before = lines.slice(0, insertIdx).join("\n").trimEnd();
  const after = lines.slice(insertIdx).join("\n").trimStart();
  return before + "\n\n" + sectionMd + (after ? "\n\n" + after : "");
}

export default function AddSectionPanel({ markdownId, rawContent, currentSectionTitle, onClose, onAdded }: Props) {
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [position, setPosition] = useState<"end" | "after-current">("end");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim()) { setError("Section title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const prefix = "#".repeat(level);
      const sectionMd = content.trim()
        ? `${prefix} ${title.trim()}\n\n${content.trim()}`
        : `${prefix} ${title.trim()}`;

      const newContent = insertSection(rawContent, sectionMd, position, currentSectionTitle);

      const res = await fetch(`/api/markdowns/${markdownId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onAdded(newContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 border-b-0 rounded-t-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Add Section</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Insert position */}
        <div className="flex gap-2">
          <button
            onClick={() => setPosition("end")}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              position === "end" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            }`}
          >
            At end of document
          </button>
          {currentSectionTitle && (
            <button
              onClick={() => setPosition("after-current")}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                position === "after-current" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
              }`}
            >
              After &ldquo;{currentSectionTitle}&rdquo;
            </button>
          )}
        </div>

        {/* Level + Title */}
        <div className="flex gap-2 items-center">
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-shrink-0"
          >
            <option value={1}># H1</option>
            <option value={2}>## H2</option>
            <option value={3}>### H3</option>
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Section heading..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
          />
          <VoiceButton
            size="sm"
            label="Dictate heading"
            onTranscript={(t) => setTitle(title ? title + " " + t : t)}
          />
        </div>

        {/* Content */}
        <div className="flex gap-2 items-start">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content... (markdown supported, optional)"
            rows={5}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 resize-y font-mono leading-relaxed"
          />
          <VoiceButton
            size="sm"
            label="Dictate content"
            onTranscript={(t) => setContent(content ? content + " " + t : t)}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
          >
            {saving ? "Adding..." : "Add Section"}
          </button>
        </div>
      </div>
    </div>
  );
}
