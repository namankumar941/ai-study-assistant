"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Plan {
  title: string;
  summary: string;
  topics: string[];
}

type Phase = "input" | "streaming" | "review" | "refining" | "starting";

async function* readSSE(
  res: Response
): AsyncGenerator<{ token?: string; done?: boolean; error?: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch {}
    }
  }
}

function parsePlanJson(text: string): Plan | null {
  try {
    const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export default function StudyGenerator() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamText]);

  async function generatePlan() {
    if (!input.trim()) return;
    setPhase("streaming");
    setStreamText("");
    setError("");

    try {
      const res = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: input.trim() }),
      });
      if (!res.ok) throw new Error("Failed to generate plan");

      let accumulated = "";
      for await (const evt of readSSE(res)) {
        if (evt.error) throw new Error(evt.error);
        if (evt.token) {
          accumulated += evt.token;
          setStreamText(accumulated);
        }
        if (evt.done) {
          const parsed = parsePlanJson(accumulated);
          if (!parsed) throw new Error("Could not parse the generated plan — please try again");
          setPlan(parsed);
          setPhase("review");
        }
      }
    } catch (e) {
      setError(String(e));
      setPhase("input");
    }
  }

  async function refinePlan() {
    if (!plan || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput("");
    setPhase("refining");
    setStreamText("");

    try {
      const res = await fetch("/api/generate/plan/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, message }),
      });
      if (!res.ok) throw new Error("Failed to refine plan");

      let accumulated = "";
      for await (const evt of readSSE(res)) {
        if (evt.error) throw new Error(evt.error);
        if (evt.token) {
          accumulated += evt.token;
          setStreamText(accumulated);
        }
        if (evt.done) {
          const parsed = parsePlanJson(accumulated);
          if (!parsed) throw new Error("Could not parse updated plan — please try again");
          setPlan(parsed);
          setPhase("review");
          setStreamText("");
          setTimeout(() => chatRef.current?.focus(), 50);
        }
      }
    } catch (e) {
      setError(String(e));
      setPhase("review");
    }
  }

  async function startGeneration() {
    if (!plan) return;
    setPhase("starting");
    try {
      const res = await fetch("/api/generate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      router.push(`/study/${data.id}`);
    } catch (e) {
      setError(String(e));
      setPhase("review");
    }
  }

  function removeTopic(index: number) {
    if (!plan) return;
    setPlan({ ...plan, topics: plan.topics.filter((_, i) => i !== index) });
  }

  function addTopic(after: number) {
    if (!plan) return;
    const name = prompt("Topic name:");
    if (!name?.trim()) return;
    const topics = [...plan.topics];
    topics.splice(after + 1, 0, name.trim());
    setPlan({ ...plan, topics });
  }

  function moveTopic(index: number, dir: -1 | 1) {
    if (!plan) return;
    const topics = [...plan.topics];
    const swap = index + dir;
    if (swap < 0 || swap >= topics.length) return;
    [topics[index], topics[swap]] = [topics[swap], topics[index]];
    setPlan({ ...plan, topics });
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-3">
        <span className="text-xl">✨</span>
        <div>
          <h2 className="text-white font-semibold text-sm">Generate Study Material</h2>
          <p className="text-slate-400 text-xs">
            Tell me what you want to learn — AI will build a full course for you
          </p>
        </div>
      </div>

      <div className="p-5">
        {/* Input phase */}
        {phase === "input" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generatePlan()}
                placeholder='e.g. "React hooks for beginners" or "machine learning fundamentals"'
                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={generatePlan}
                disabled={!input.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium flex-shrink-0"
              >
                Generate Plan →
              </button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}

        {/* Streaming phase — plan being generated */}
        {phase === "streaming" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
              Building your curriculum…
            </div>
            <pre
              ref={streamRef}
              className="bg-slate-900 rounded-xl p-4 text-slate-400 text-xs font-mono whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed"
            >
              {streamText}
              <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
            </pre>
          </div>
        )}

        {/* Review / refining / starting phase */}
        {(phase === "review" || phase === "refining" || phase === "starting") && plan && (
          <div className="space-y-4">
            {/* Course title + summary */}
            <div className="bg-slate-900 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-white font-semibold">{plan.title}</h3>
                <button
                  onClick={() => {
                    setPhase("input");
                    setPlan(null);
                  }}
                  className="text-slate-500 hover:text-slate-300 text-xs flex-shrink-0"
                >
                  ← Edit topic
                </button>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">{plan.summary}</p>
            </div>

            {/* Topics list */}
            <div>
              <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wide">
                {plan.topics.length} topics
              </p>
              <div className="space-y-1.5">
                {plan.topics.map((topic, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-2 group"
                  >
                    <span className="text-slate-600 text-xs w-5 text-right flex-shrink-0">
                      {i + 1}.
                    </span>
                    <span className="text-slate-200 text-sm flex-1">{topic}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveTopic(i, -1)}
                        disabled={i === 0}
                        className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveTopic(i, 1)}
                        disabled={i === plan.topics.length - 1}
                        className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => addTopic(i)}
                        className="p-1 text-slate-500 hover:text-green-400"
                        title="Add topic after"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeTopic(i)}
                        disabled={plan.topics.length <= 1}
                        className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-20"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Refining streaming display */}
            {phase === "refining" && (
              <div className="border-t border-slate-700 pt-3 space-y-2">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <span className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
                  Updating plan…
                </div>
                <pre
                  ref={streamRef}
                  className="bg-slate-900 rounded-xl p-3 text-slate-400 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto"
                >
                  {streamText}
                  <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                </pre>
              </div>
            )}

            {/* Chat refinement input */}
            {phase === "review" && (
              <div className="border-t border-slate-700 pt-3 space-y-2">
                <p className="text-slate-500 text-xs">Chat to refine the plan</p>
                <div className="flex gap-2">
                  <input
                    ref={chatRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && refinePlan()}
                    placeholder='e.g. "add a topic on error handling" or "make it more beginner-friendly"'
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={refinePlan}
                    disabled={!chatInput.trim()}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-sm flex-shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* Start generation button */}
            {(phase === "review" || phase === "starting") && (
              <button
                onClick={startGeneration}
                disabled={phase === "starting" || plan.topics.length < 1}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                {phase === "starting" ? (
                  <>
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Starting generation…
                  </>
                ) : (
                  `Start Generating ${plan.topics.length} Topics →`
                )}
              </button>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
