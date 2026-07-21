"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import VoiceButton from "./VoiceButton";

interface SectionEntry {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  content: string;
}

interface Props {
  onClose: () => void;
}

function buildMarkdown(name: string, sections: SectionEntry[]): string {
  const parts: string[] = [];
  if (name.trim()) parts.push(`# ${name.trim()}`);
  for (const s of sections) {
    if (!s.title.trim() && !s.content.trim()) continue;
    const prefix = "#".repeat(s.level);
    if (s.title.trim()) parts.push(`${prefix} ${s.title.trim()}`);
    if (s.content.trim()) parts.push(s.content.trim());
  }
  return parts.join("\n\n");
}

function newSection(): SectionEntry {
  return { id: crypto.randomUUID(), level: 2, title: "", content: "" };
}

export default function CreateFileModal({ onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sections, setSections] = useState<SectionEntry[]>([newSection()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  function updateSection(id: string, updates: Partial<Omit<SectionEntry, "id">>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  const markdown = buildMarkdown(name, sections);

  async function save() {
    if (!name.trim()) { setError("File name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/markdowns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: markdown }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/study/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-10 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-lg">Create New File</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowPreview((p) => !p)}
              className="text-sm text-slate-400 hover:text-white"
            >
              {showPreview ? "Hide preview" : "Preview markdown"}
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* File name */}
          <div>
            <label className="block text-slate-400 text-xs mb-1.5 uppercase tracking-wide font-medium">File name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Study Notes"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Sections */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs uppercase tracking-wide font-medium">Sections</span>
              <button
                onClick={() => setSections((prev) => [...prev, newSection()])}
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                + Add section
              </button>
            </div>

            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                  {/* Level + title row */}
                  <div className="flex items-center gap-2">
                    <select
                      value={section.level}
                      onChange={(e) => updateSection(section.id, { level: Number(e.target.value) as 1 | 2 | 3 })}
                      className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none flex-shrink-0"
                    >
                      <option value={1}># H1</option>
                      <option value={2}>## H2</option>
                      <option value={3}>### H3</option>
                    </select>
                    <input
                      value={section.title}
                      onChange={(e) => updateSection(section.id, { title: e.target.value })}
                      placeholder="Section heading..."
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <VoiceButton
                      size="sm"
                      label="Dictate heading"
                      onTranscript={(t) => updateSection(section.id, { title: section.title ? section.title + " " + t : t })}
                    />
                    {sections.length > 1 && (
                      <button
                        onClick={() => setSections((prev) => prev.filter((s) => s.id !== section.id))}
                        className="text-slate-500 hover:text-red-400 text-lg leading-none flex-shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Content row */}
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={section.content}
                      onChange={(e) => updateSection(section.id, { content: e.target.value })}
                      placeholder="Content... (markdown supported)"
                      rows={4}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 resize-y font-mono leading-relaxed"
                    />
                    <VoiceButton
                      size="sm"
                      label="Dictate content"
                      onTranscript={(t) =>
                        updateSection(section.id, { content: section.content ? section.content + " " + t : t })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Markdown preview */}
          {showPreview && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-2 font-medium uppercase tracking-wide">Markdown output</p>
              <pre className="text-slate-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                {markdown || "(nothing yet)"}
              </pre>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {saving ? "Creating..." : "Create & Study"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
