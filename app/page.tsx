"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";

interface MarkdownFile {
  id: string;
  name: string;
  created_at: string;
  totalSections: number;
  completedSections: number;
}

export default function HomePage() {
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/markdowns");
    const data = await res.json();
    setFiles(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteFile(id: string) {
    if (!confirm("Delete this file and all its data?")) return;
    await fetch(`/api/markdowns/${id}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h1 className="text-white font-bold text-xl">ai-study-assistant</h1>
              <p className="text-slate-400 text-xs">Your AI-powered markdown study companion</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            LLM Ready
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 space-y-10">
        {/* Upload */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">Upload Markdown File</h2>
          <FileUpload key={files.length} />
        </section>

        {/* File List */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">
            Your Files{" "}
            <span className="text-slate-500 text-sm font-normal">({files.length})</span>
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-slate-800 rounded-2xl h-24 animate-pulse" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">🗂️</p>
              <p>No files uploaded yet. Upload a markdown file to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((file) => {
                const pct =
                  file.totalSections === 0
                    ? 0
                    : Math.round((file.completedSections / file.totalSections) * 100);

                return (
                  <div
                    key={file.id}
                    className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex items-center gap-5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-white font-semibold truncate">{file.name}</h3>
                        {pct === 100 && (
                          <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                            Complete
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mb-3">
                        Uploaded {new Date(file.created_at).toLocaleDateString()}
                      </p>
                      {file.totalSections > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>{file.completedSections}/{file.totalSections} sections</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5">
                            <div
                              className="bg-green-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/study/${file.id}`}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium"
                      >
                        Study
                      </Link>
                      <Link
                        href={`/study/${file.id}?tab=quiz`}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm"
                      >
                        Quiz
                      </Link>
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="px-3 py-2 text-slate-500 hover:text-red-400 rounded-xl text-sm"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
