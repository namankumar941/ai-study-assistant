"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import VoiceButton from "@/components/VoiceButton";

interface Question {
  id: string;
  markdown_id: string;
  markdown_name: string;
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

function DiffBadge({ d }: { d: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[d] ?? DIFFICULTY_COLORS.medium}`}>
      {d}
    </span>
  );
}

// ─── Single Quiz Card ────────────────────────────────────────────────────────

function QuizCard({ q, onNext, total, current }: {
  q: Question;
  onNext: () => void;
  total: number;
  current: number;
}) {
  const [userAnswer, setUserAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [markedRevisit, setMarkedRevisit] = useState(!!q.needs_revisit);
  const [submitted, setSubmitted] = useState(false);

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
      setSubmitted(true);
      if (data.score < 6 && !markedRevisit) {
        setMarkedRevisit(true);
        await fetch("/api/quiz/revisit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: q.id, revisit: true }),
        });
      }
    } finally {
      setEvaluating(false);
    }
  }

  async function toggleRevisit() {
    const next = !markedRevisit;
    setMarkedRevisit(next);
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
    <div className="max-w-2xl mx-auto w-full">
      {/* Progress */}
      <div className="flex items-center justify-between mb-4 text-sm text-slate-400">
        <span>Question {current} of {total}</span>
        <div className="flex-1 mx-4 bg-slate-700 rounded-full h-1.5">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all"
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
      </div>

      <div className={`bg-slate-800 rounded-2xl border overflow-hidden ${markedRevisit ? "border-orange-600/50" : "border-slate-700"}`}>
        <div className="p-6">
          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="bg-indigo-700/60 text-indigo-200 text-xs font-bold px-2 py-1 rounded-full">
              {q.markdown_name}
            </span>
            <span className="text-slate-500 text-xs">›</span>
            <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-full">
              {q.section_title}
            </span>
            <DiffBadge d={q.difficulty} />
            {markedRevisit && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange-700/40 text-orange-300 border-orange-700">
                ⚑ Revisit
              </span>
            )}
          </div>

          <h3 className="text-white font-medium text-lg leading-relaxed">{q.question}</h3>

          <div className="mt-5 space-y-3">
            <div className="flex gap-2 items-start">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="flex-1 bg-slate-900 text-slate-100 rounded-xl p-3 text-sm resize-none border border-slate-600 focus:outline-none focus:border-indigo-500"
                rows={4}
                disabled={submitted}
              />
              <VoiceButton
                onTranscript={(t) => setUserAnswer((prev) => prev + (prev ? " " : "") + t)}
                size="sm"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {!submitted ? (
                <button
                  onClick={evaluate}
                  disabled={evaluating || !userAnswer.trim()}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium"
                >
                  {evaluating ? "Evaluating..." : "Submit Answer"}
                </button>
              ) : (
                <button
                  onClick={onNext}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium"
                >
                  Next Question →
                </button>
              )}
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
                    ? "bg-orange-700/40 border-orange-600 text-orange-300"
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
    </div>
  );
}

// ─── Done Screen ─────────────────────────────────────────────────────────────

function DoneScreen({ onRestart, onHome }: { onRestart: () => void; onHome: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <p className="text-5xl mb-4">🎉</p>
      <h2 className="text-white text-2xl font-bold mb-2">Quiz Complete!</h2>
      <p className="text-slate-400 mb-8">You've answered all the questions in this session.</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={onRestart}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium"
        >
          Quiz Again
        </button>
        <button
          onClick={onHome}
          className="px-6 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl text-sm"
        >
          Back to Courses
        </button>
      </div>
    </div>
  );
}

// ─── Course Cards ────────────────────────────────────────────────────────────

interface Course {
  id: string;
  name: string;
  questions: Question[];
}

function CourseCard({ course, onStartQuiz }: { course: Course; onStartQuiz: (id: string | null) => void }) {
  const revisitCount = course.questions.filter((q) => q.needs_revisit).length;
  const easyCount = course.questions.filter((q) => q.difficulty === "easy").length;
  const medCount = course.questions.filter((q) => q.difficulty === "medium").length;
  const hardCount = course.questions.filter((q) => q.difficulty === "hard").length;

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate mb-2">{course.name}</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {course.questions.length} questions
            </span>
            {easyCount > 0 && (
              <span className="bg-green-700/40 text-green-300 border border-green-700 px-2 py-0.5 rounded-full">
                {easyCount} easy
              </span>
            )}
            {medCount > 0 && (
              <span className="bg-yellow-700/40 text-yellow-300 border border-yellow-700 px-2 py-0.5 rounded-full">
                {medCount} medium
              </span>
            )}
            {hardCount > 0 && (
              <span className="bg-red-700/40 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">
                {hardCount} hard
              </span>
            )}
            {revisitCount > 0 && (
              <span className="bg-orange-700/40 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full">
                ⚑ {revisitCount} revisit
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/study/${course.id}?tab=quiz`}
            className="px-3 py-1.5 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl text-xs"
          >
            Open
          </Link>
          <button
            onClick={() => onStartQuiz(course.id)}
            disabled={course.questions.length === 0}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-medium"
          >
            Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AllQuizPage() {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz session state
  const [quizQueue, setQuizQueue] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [quizActive, setQuizActive] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [activeCourseName, setActiveCourseName] = useState<string>("All Courses");

  useEffect(() => {
    fetch("/api/quiz/all")
      .then((r) => r.json())
      .then((d) => {
        setAllQuestions(d.questions ?? []);
        setLoading(false);
      });
  }, []);

  const courses: Course[] = (() => {
    const map = new Map<string, Course>();
    for (const q of allQuestions) {
      if (!map.has(q.markdown_id)) {
        map.set(q.markdown_id, { id: q.markdown_id, name: q.markdown_name, questions: [] });
      }
      map.get(q.markdown_id)!.questions.push(q);
    }
    return Array.from(map.values());
  })();

  function startQuiz(markdownId: string | null) {
    const pool = markdownId
      ? allQuestions.filter((q) => q.markdown_id === markdownId)
      : allQuestions;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const courseName = markdownId
      ? (courses.find((c) => c.id === markdownId)?.name ?? "")
      : "All Courses";
    setQuizQueue(shuffled);
    setCurrentIdx(0);
    setQuizActive(true);
    setQuizDone(false);
    setActiveCourseName(courseName);
  }

  function handleNext() {
    if (currentIdx + 1 >= quizQueue.length) {
      setQuizDone(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function exitQuiz() {
    setQuizActive(false);
    setQuizDone(false);
    setQuizQueue([]);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-1"
            >
              ← Home
            </Link>
            <span className="text-slate-600">|</span>
            <h1 className="text-white font-bold text-lg">All Quizzes</h1>
            {quizActive && (
              <>
                <span className="text-slate-600">›</span>
                <span className="text-indigo-400 text-sm">{activeCourseName}</span>
              </>
            )}
          </div>

          {!quizActive && allQuestions.length > 0 && (
            <button
              onClick={() => startQuiz(null)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium"
            >
              Quiz All Courses
            </button>
          )}

          {quizActive && (
            <button
              onClick={exitQuiz}
              className="px-4 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl text-sm"
            >
              Exit Quiz
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800 rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : allQuestions.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-lg mb-2">No quiz questions yet.</p>
            <p className="text-sm">Go to a course, mark sections complete, and questions will be generated automatically.</p>
            <Link href="/" className="mt-6 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm">
              Go to Courses
            </Link>
          </div>
        ) : quizDone ? (
          <DoneScreen
            onRestart={() => startQuiz(quizQueue[0]?.markdown_id ?? null)}
            onHome={exitQuiz}
          />
        ) : quizActive ? (
          <QuizCard
            key={quizQueue[currentIdx]?.id}
            q={quizQueue[currentIdx]}
            onNext={handleNext}
            total={quizQueue.length}
            current={currentIdx + 1}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-400 text-sm">
                {courses.length} course{courses.length !== 1 ? "s" : ""} · {allQuestions.length} total questions
              </p>
            </div>
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} onStartQuiz={startQuiz} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
