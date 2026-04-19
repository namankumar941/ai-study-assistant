"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import VoiceButton from "./VoiceButton";

interface Question {
  id: string;
  section_id: string;
  section_title: string;
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  needs_revisit: number;
  last_score: number | null;
}

interface Evaluation {
  score: number;
  strengths: string[];
  improvements: string[];
  summary: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-700/40 text-green-300 border-green-700",
  medium: "bg-yellow-700/40 text-yellow-300 border-yellow-700",
  hard: "bg-red-700/40 text-red-300 border-red-700",
};

function DifficultyBadge({ d }: { d: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[d] ?? DIFFICULTY_COLORS.medium}`}>
      {d}
    </span>
  );
}

function RevisitBadge() {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-700/40 text-orange-300 border-orange-700 flex items-center gap-1">
      <span>⚑</span> Revisit
    </span>
  );
}

// ─── Quiz Mode Card ──────────────────────────────────────────────────────────

interface QuizCardProps {
  q: Question;
  onRevisitChange: (id: string, revisit: boolean) => void;
  onSubmit: (id: string) => void;
}

function QuizCard({ q, onRevisitChange, onSubmit }: QuizCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [markedRevisit, setMarkedRevisit] = useState(!!q.needs_revisit);

  async function evaluate() {
    if (!userAnswer.trim()) return;
    setEvaluating(true);
    try {
      const res = await fetch("/api/quiz/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          correctAnswer: q.answer,
          userAnswer,
          questionId: q.id,
        }),
      });
      const data = await res.json();
      setEvaluation(data);
      setShowAnswer(true);
      onSubmit(q.id);
      // Auto-flag revisit if score < 6
      if (data.score < 6 && !markedRevisit) {
        setMarkedRevisit(true);
        onRevisitChange(q.id, true);
      }
    } finally {
      setEvaluating(false);
    }
  }

  async function toggleRevisit() {
    const next = !markedRevisit;
    setMarkedRevisit(next);
    onRevisitChange(q.id, next);
    await fetch("/api/quiz/revisit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, revisit: next }),
    });
  }

  const scoreColor =
    !evaluation ? "" :
    evaluation.score >= 8 ? "text-green-400" :
    evaluation.score >= 5 ? "text-yellow-400" :
    "text-red-400";

  return (
    <div className={`bg-slate-800 rounded-2xl border overflow-hidden ${markedRevisit ? "border-orange-600/50" : "border-slate-700"}`}>
      <div className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-indigo-700/60 text-indigo-200 text-xs font-bold px-2 py-1 rounded-full">
            {q.section_title}
          </span>
          <DifficultyBadge d={q.difficulty} />
          {markedRevisit && <RevisitBadge />}
        </div>

        <h3 className="text-white font-medium mt-3 leading-relaxed">{q.question}</h3>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2 items-start">
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="flex-1 bg-slate-900 text-slate-100 rounded-xl p-3 text-sm resize-none border border-slate-600 focus:outline-none focus:border-indigo-500"
              rows={3}
            />
            <VoiceButton
              onTranscript={(t) => setUserAnswer((prev) => prev + (prev ? " " : "") + t)}
              size="sm"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={evaluate}
              disabled={evaluating || !userAnswer.trim()}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium min-w-0"
            >
              {evaluating ? "Evaluating..." : "Submit Answer"}
            </button>
            <button
              onClick={() => setShowAnswer(!showAnswer)}
              className="px-4 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl text-sm"
            >
              {showAnswer ? "Hide" : "Reveal"}
            </button>
            <button
              onClick={toggleRevisit}
              className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                markedRevisit
                  ? "bg-orange-700/40 border-orange-600 text-orange-300 hover:bg-orange-700/60"
                  : "border-slate-600 text-slate-400 hover:text-orange-300 hover:border-orange-600"
              }`}
              title={markedRevisit ? "Remove revisit flag" : "Mark for revisit"}
            >
              ⚑
            </button>
          </div>
        </div>

        {evaluation && (
          <div className="mt-4 bg-slate-900 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold ${scoreColor}`}>{evaluation.score}/10</span>
              <p className="text-slate-300 text-sm">{evaluation.summary}</p>
            </div>
            {evaluation.strengths?.length > 0 && (
              <div>
                <p className="text-green-400 text-xs font-semibold mb-1">What you got right:</p>
                <ul className="space-y-1">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="text-slate-300 text-xs flex gap-2">
                      <span className="text-green-400">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evaluation.improvements?.length > 0 && (
              <div>
                <p className="text-amber-400 text-xs font-semibold mb-1">Areas to improve:</p>
                <ul className="space-y-1">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i} className="text-slate-300 text-xs flex gap-2">
                      <span className="text-amber-400">→</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {showAnswer && (
          <div className="mt-4 bg-green-950/30 border border-green-800/30 rounded-xl p-4">
            <p className="text-green-400 text-xs font-semibold mb-2">Model Answer:</p>
            <p className="text-slate-200 text-sm leading-relaxed">{q.answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── All Questions Section ───────────────────────────────────────────────────

const EXAMPLE_JSON = `[
  {
    "question": "What is the difference between TCP and UDP?",
    "answer": "TCP is connection-oriented, provides reliable delivery with error checking, flow control, and ordered packet delivery. UDP is connectionless, faster but unreliable — no guarantee of delivery or order.",
    "difficulty": "easy",
    "section_title": "Networking Basics"
  },
  {
    "question": "Explain the CAP theorem and its implications.",
    "answer": "CAP theorem states that a distributed system can only guarantee two of: Consistency, Availability, Partition tolerance. In practice, network partitions are unavoidable, so the real choice is between consistency (CP) and availability (AP).",
    "difficulty": "hard",
    "section_title": "Distributed Systems"
  }
]`;

interface AllQuestionsProps {
  markdownId: string;
  questions: Question[];
  onQuestionsUpdate: () => void;
}

function AllQuestions({ markdownId, questions, onQuestionsUpdate }: AllQuestionsProps) {
  const [localQuestions, setLocalQuestions] = useState<Question[]>(questions);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
  const [filterRevisit, setFilterRevisit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sync when parent reloads questions (e.g. after import or job finish)
  useEffect(() => {
    setLocalQuestions(questions);
  }, [questions]);

  async function handleImport() {
    setImportError("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError("Invalid JSON. Please check the format.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/quiz/import/${markdownId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Import failed");
      } else {
        setShowImport(false);
        setImportText("");
        onQuestionsUpdate();
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleToggleRevisit(id: string, current: number) {
    const next = current ? 0 : 1;
    setLocalQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, needs_revisit: next } : q))
    );
    await fetch("/api/quiz/revisit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: id, revisit: next === 1 }),
    });
  }

  async function handleDelete(ids: string[]) {
    const label = ids.length === 1 ? "this question" : `${ids.length} questions`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    const idSet = new Set(ids);
    setLocalQuestions((prev) => prev.filter((q) => !idSet.has(q.id)));
    setSelectedIds((prev) => {
      const s = new Set(prev);
      ids.forEach((id) => s.delete(id));
      return s;
    });
    await fetch("/api/quiz/question", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function toggleSelectAll(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (allSelected) ids.forEach((id) => s.delete(id));
      else ids.forEach((id) => s.add(id));
      return s;
    });
  }

  const filtered = localQuestions.filter((q) => {
    if (filterDifficulty !== "all" && q.difficulty !== filterDifficulty) return false;
    if (filterRevisit && !q.needs_revisit) return false;
    return true;
  });

  // Group by section_title
  const grouped: Record<string, Question[]> = {};
  for (const q of filtered) {
    const key = q.section_title;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(q);
  }

  const allFilteredIds = filtered.map((q) => q.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-bold text-xl">All Questions</h2>
          <p className="text-slate-400 text-sm">{localQuestions.length} questions stored</p>
        </div>
        <button
          onClick={() => setShowImport(!showImport)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium"
        >
          + Import JSON
        </button>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Import Questions from JSON</h3>
            <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <p className="text-slate-300 font-semibold text-sm">Expected JSON format:</p>
            <pre className="overflow-x-auto text-slate-400 leading-relaxed">{EXAMPLE_JSON}</pre>
            <p className="text-slate-500 mt-2">
              Fields: <code className="text-slate-300">question</code> (required), <code className="text-slate-300">answer</code> (required),{" "}
              <code className="text-slate-300">difficulty</code> (easy/medium/hard, default: medium),{" "}
              <code className="text-slate-300">section_title</code> (optional label)
            </p>
          </div>

          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(""); }}
            placeholder='Paste your JSON array here...'
            className="w-full bg-slate-900 text-slate-100 rounded-xl p-3 text-sm resize-none border border-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            rows={8}
          />

          {importError && (
            <p className="text-red-400 text-sm">{importError}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium"
            >
              {importing ? "Importing..." : "Import"}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText(""); setImportError(""); }}
              className="px-5 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {localQuestions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border border-slate-700">
            {["all", "easy", "medium", "hard"].map((d) => (
              <button
                key={d}
                onClick={() => setFilterDifficulty(d)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filterDifficulty === d
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilterRevisit(!filterRevisit)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filterRevisit
                ? "bg-orange-700/40 border-orange-600 text-orange-300"
                : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            ⚑ Revisit only
          </button>
          {/* Select all visible */}
          {filtered.length > 0 && (
            <button
              onClick={() => toggleSelectAll(allFilteredIds)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              {allFilteredIds.every((id) => selectedIds.has(id)) ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl">
          <span className="text-slate-300 text-sm flex-1">{selectedIds.size} selected</span>
          <button
            onClick={() => handleDelete(Array.from(selectedIds))}
            className="px-3 py-1.5 bg-red-700/40 hover:bg-red-700/70 border border-red-700 text-red-300 rounded-lg text-xs font-medium transition-colors"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-slate-500 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Empty state */}
      {localQuestions.length === 0 && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center space-y-3">
            <p className="text-4xl">📝</p>
            <p className="text-slate-300 font-medium">No questions yet</p>
            <p className="text-slate-500 text-sm">
              Complete sections in the Study tab to auto-generate questions,<br/>or import your own JSON above.
            </p>
          </div>
        </div>
      )}

      {/* Question groups */}
      {Object.entries(grouped).map(([section, qs]) => (
        <div key={section} className="space-y-2">
          <h3 className="text-slate-300 font-semibold text-sm border-b border-slate-700 pb-2">
            {section} <span className="text-slate-500 font-normal">({qs.length})</span>
          </h3>
          <div className="space-y-2">
            {qs.map((q) => (
              <div
                key={q.id}
                className={`bg-slate-800 border rounded-xl overflow-hidden transition-colors ${
                  selectedIds.has(q.id)
                    ? "border-indigo-500/70"
                    : q.needs_revisit
                    ? "border-orange-600/50"
                    : "border-slate-700"
                }`}
              >
                <div className="px-3 py-3 flex items-center gap-2">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    className="w-4 h-4 rounded accent-indigo-500 flex-shrink-0 cursor-pointer"
                  />

                  {/* Expand area */}
                  <div
                    className="flex-1 flex items-center gap-3 cursor-pointer min-w-0"
                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                  >
                    <span className="flex-1 text-slate-200 text-sm leading-snug">{q.question}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DifficultyBadge d={q.difficulty} />
                      {!!q.needs_revisit && <RevisitBadge />}
                      {q.last_score !== null && q.last_score !== undefined && (
                        <span className={`text-xs font-bold ${
                          q.last_score >= 8 ? "text-green-400" :
                          q.last_score >= 5 ? "text-yellow-400" : "text-red-400"
                        }`}>
                          {q.last_score}/10
                        </span>
                      )}
                    </div>
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${expandedId === q.id ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      title={q.needs_revisit ? "Unmark revisit" : "Mark for revisit"}
                      onClick={() => handleToggleRevisit(q.id, q.needs_revisit)}
                      className={`p-1.5 rounded-lg transition-colors text-sm ${
                        q.needs_revisit
                          ? "text-orange-400 hover:bg-orange-700/30"
                          : "text-slate-500 hover:text-orange-400 hover:bg-slate-700"
                      }`}
                    >
                      ⚑
                    </button>
                    <button
                      title="Delete question"
                      onClick={() => handleDelete([q.id])}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors text-sm"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {expandedId === q.id && (
                  <div className="px-4 pb-4 border-t border-slate-700 pt-3">
                    <p className="text-green-400 text-xs font-semibold mb-2">Answer:</p>
                    <p className="text-slate-300 text-sm leading-relaxed">{q.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && localQuestions.length > 0 && (
        <p className="text-slate-500 text-sm text-center py-8">No questions match the current filter.</p>
      )}
    </div>
  );
}

// ─── Quiz Mode ───────────────────────────────────────────────────────────────

interface QuizModeProps {
  markdownId: string;
  questions: Question[];
  onQuestionsUpdate: () => void;
}

function QuizMode({ markdownId, questions, onQuestionsUpdate }: QuizModeProps) {
  const BATCH = 2;
  const storageKey = `quiz_shown_${markdownId}`;
  const currentKey = `quiz_current_${markdownId}`;

  function getShown(): string[] {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    } catch {
      return [];
    }
  }

  function saveShown(ids: string[]) {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  }

  function pickNext(qs: Question[]): Question[] {
    if (qs.length === 0) return [];
    let shown = getShown();
    let available = qs.filter((q) => !shown.includes(q.id));

    // All shown — start new cycle
    if (available.length === 0) {
      shown = [];
      saveShown([]);
      available = [...qs];
    }

    const seen = new Set<string>();
    const unique = available.filter((q) => (seen.has(q.id) ? false : seen.add(q.id) && true));
    const shuffled = unique.sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, BATCH);
    localStorage.setItem(currentKey, JSON.stringify(batch.map((q) => q.id)));
    return batch;
  }

  function restoreOrPickNext(qs: Question[]): Question[] {
    try {
      const savedIds: string[] = JSON.parse(localStorage.getItem(currentKey) ?? "[]");
      if (savedIds.length > 0) {
        const qMap = new Map(qs.map((q) => [q.id, q]));
        const restored = savedIds.map((id) => qMap.get(id)).filter(Boolean) as Question[];
        if (restored.length > 0) return restored;
      }
    } catch { /* ignore */ }
    return pickNext(qs);
  }

  const [current, setCurrent] = useState<Question[]>(() => restoreOrPickNext(questions));
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [cycleInfo, setCycleInfo] = useState({ shown: getShown().length, total: questions.length });

  const allSubmitted = current.length > 0 && current.every((q) => submittedIds.has(q.id));

  function advance() {
    const shown = getShown();
    const newShown = Array.from(new Set([...shown, ...current.map((q) => q.id)]));
    saveShown(newShown);
    const next = pickNext(questions);
    setCurrent(next);
    setSubmittedIds(new Set());
    setCycleInfo({ shown: newShown.length, total: questions.length });
    onQuestionsUpdate();
  }

  function handleRevisitChange(id: string, revisit: boolean) {
    void fetch("/api/quiz/revisit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: id, revisit }),
    });
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <p className="text-6xl">📚</p>
          <p className="text-slate-300 font-medium">No questions available yet</p>
          <p className="text-slate-500 text-sm">Complete sections in the Study tab to auto-generate questions.</p>
        </div>
      </div>
    );
  }

  const progress = Math.min(cycleInfo.shown, cycleInfo.total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-xl">Quiz Mode</h2>
          <p className="text-slate-400 text-sm">
            {progress}/{questions.length} questions seen this cycle
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            {progress < questions.length
              ? `${questions.length - progress} remaining`
              : "Full cycle complete — restarting"}
          </div>
          <button
            onClick={() => { saveShown([]); setCurrent(pickNext(questions)); setCycleInfo({ shown: 0, total: questions.length }); }}
            className="px-3 py-1.5 text-xs border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl"
          >
            Reset cycle
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-700 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${questions.length ? (progress / questions.length) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-6">
        {current.map((q) => (
          <QuizCard key={q.id} q={q} onRevisitChange={handleRevisitChange} onSubmit={(id) => setSubmittedIds((prev) => new Set(Array.from(prev).concat(id)))} />
        ))}
      </div>

      <button
        onClick={advance}
        disabled={!allSubmitted}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-semibold"
      >
        {allSubmitted ? `Next ${BATCH} Questions →` : `Submit all questions to continue`}
      </button>
    </div>
  );
}

// ─── Main QuizSection ────────────────────────────────────────────────────────

interface Props {
  markdownId: string;
  view: "quiz" | "all";
  progress?: Record<string, boolean>;
}


type FailedJob = { id: string; section_id: string; section_title: string };

function failedJobsKey(markdownId: string) {
  return `quiz-failed-jobs-${markdownId}`;
}

function loadPersistedFailedJobs(markdownId: string): FailedJob[] {
  try {
    return JSON.parse(localStorage.getItem(failedJobsKey(markdownId)) ?? "[]");
  } catch {
    return [];
  }
}

export default function QuizSection({ markdownId, view, progress }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<{ id: string; section_title: string }[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>(() => loadPersistedFailedJobs(markdownId));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasRunningRef = useRef(false);
  const dismissedJobIdsRef = useRef<Set<string>>(new Set<string>());

  useEffect(() => {
    localStorage.setItem(failedJobsKey(markdownId), JSON.stringify(failedJobs));
  }, [failedJobs, markdownId]);

  const dismissedStorageKey = `quiz-dismissed-jobs-${markdownId}`;
  useEffect(() => {
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(dismissedStorageKey) ?? "[]");
      saved.forEach((id) => dismissedJobIdsRef.current.add(id));
    } catch { /* ignore */ }
  }, [dismissedStorageKey]);

  const persistDismissed = useCallback((id: string) => {
    dismissedJobIdsRef.current.add(id);
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(dismissedStorageKey) ?? "[]");
      if (!saved.includes(id)) {
        localStorage.setItem(dismissedStorageKey, JSON.stringify(saved.concat(id)));
      }
    } catch { /* ignore */ }
  }, [dismissedStorageKey]);

  const handleDismissFailedJob = useCallback((id: string) => {
    persistDismissed(id);
    setFailedJobs((prev) => prev.filter((j) => j.id !== id));
  }, [persistDismissed]);

  const handleRetryFailedJob = useCallback(async (job: FailedJob) => {
    persistDismissed(job.id);
    setFailedJobs((prev) => prev.filter((j) => j.id !== job.id));
    await fetch("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdownId, sectionId: job.section_id }),
    });
  }, [markdownId, persistDismissed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${markdownId}`);
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } finally {
      setLoading(false);
    }
  }, [markdownId]);


  const checkJobs = useCallback(async () => {
    const res = await fetch(`/api/quiz/jobs/${markdownId}`);
    const data = await res.json();
    const jobs: { status: string; id: string; section_id: string; section_title: string }[] = data.jobs ?? [];
    const running = jobs.filter((j) => j.status === "running");
    const failed = jobs.filter((j) => j.status === "failed" && !dismissedJobIdsRef.current.has(j.id));

    setActiveJobs(running);

    if (wasRunningRef.current && running.length === 0) {
      await load();
      if (failed.length > 0) {
        setFailedJobs((prev) => {
          const existingSectionIds = new Set(prev.map((j) => j.section_id));
          const newFailed = failed.filter((j) => !existingSectionIds.has(j.section_id));
          return [...prev, ...newFailed].slice(0, 5);
        });
      }
    }
    wasRunningRef.current = running.length > 0;

    return running.length > 0;
  }, [markdownId, load]);

  useEffect(() => {
    load();
  }, [load]);

  // Start polling when component mounts; stop when no active jobs
  useEffect(() => {
    let stopped = false;

    async function poll() {
      if (stopped) return;
      const hasActive = await checkJobs();
      if (!stopped) {
        pollRef.current = setTimeout(poll, hasActive ? 3000 : 8000);
      }
    }

    poll();

    return () => {
      stopped = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [checkJobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-400 text-sm">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active generation banner */}
      {view === "all" && activeJobs.length > 0 && (
        <div className="flex items-center gap-3 bg-indigo-950/60 border border-indigo-700/50 rounded-xl px-4 py-2.5 text-sm text-indigo-300">
          <span className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full flex-shrink-0" />
          <span>
            Generating questions for{" "}
            <span className="font-semibold">
              {activeJobs.map((j) => `"${j.section_title}"`).join(", ")}
            </span>
            … will appear here when done.
          </span>
        </div>
      )}


      {view === "all" ? (
        <>
          {failedJobs.map((job) => (
            <div key={job.id} className="flex items-start gap-3 bg-red-950/60 border border-red-700/50 rounded-xl px-4 py-3 text-sm text-red-300">
              <span className="flex-shrink-0 mt-0.5">⚠</span>
              <span className="flex-1">
                Question generation failed for{" "}
                <span className="font-semibold">&quot;{job.section_title}&quot;</span>.
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleRetryFailedJob(job)}
                  className="px-2.5 py-1 bg-red-700/50 hover:bg-red-700/80 text-red-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => handleDismissFailedJob(job.id)}
                  className="p-1 hover:bg-red-800/50 text-red-400 hover:text-red-200 rounded-md transition-colors"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <AllQuestions markdownId={markdownId} questions={questions} onQuestionsUpdate={load} />
        </>
      ) : (
        <QuizMode
          markdownId={markdownId}
          questions={progress ? questions.filter((q) => progress[q.section_id]) : questions}
          onQuestionsUpdate={load}
        />
      )}
    </div>
  );
}
