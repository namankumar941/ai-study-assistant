"use client";
import { useState, useRef, useEffect } from "react";
import VoiceButton, { speak } from "./VoiceButton";
import { Message } from "@/lib/llm";

interface Props {
  context: string;
  contextLabel: string;
  onClose: () => void;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export default function VoiceQA({ context, contextLabel, onClose }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function askQuestion(question: string) {
    if (!question.trim() || loading) return;

    const newTurns: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(newTurns);
    setLoading(true);

    try {
      const messages: Message[] = newTurns.map((t) => ({ role: t.role, content: t.content }));

      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, context, mode: "qa" }),
      });

      const data = await res.json();
      const answer: string = data.response || data.error || "Failed to get response";

      setTurns([...newTurns, { role: "assistant", content: answer }]);
      speak(answer);
    } catch {
      setTurns([...newTurns, { role: "assistant", content: "Error connecting to LLM." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-slate-800 border-l border-slate-700 flex flex-col z-50 shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div>
          <h3 className="text-white font-semibold text-sm">Voice Q&A</h3>
          <p className="text-slate-400 text-xs truncate max-w-xs">{contextLabel}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
      </div>

      <div className="bg-slate-900/50 p-3 border-b border-slate-700">
        <p className="text-slate-400 text-xs font-mono leading-relaxed line-clamp-4">{context}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 && (
          <p className="text-slate-500 text-sm text-center mt-8">
            Ask a question about the selected text using voice or text below.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl p-3 text-sm leading-relaxed ${
                turn.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-700 text-slate-100"
              }`}
            >
              {turn.content}
              {turn.role === "assistant" && (
                <button
                  onClick={() => speak(turn.content)}
                  className="ml-2 text-slate-400 hover:text-white text-xs"
                  title="Read aloud"
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 rounded-xl p-3 text-slate-400 text-sm">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-slate-700 flex gap-2 items-end">
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              askQuestion(textInput);
              setTextInput("");
            }
          }}
          placeholder="Type your question or use voice..."
          className="flex-1 bg-slate-900 text-slate-100 rounded-lg p-2 text-sm resize-none border border-slate-600 focus:outline-none focus:border-indigo-500"
          rows={2}
        />
        <div className="flex flex-col gap-2">
          <VoiceButton
            onTranscript={(t) => { askQuestion(t); }}
            disabled={loading}
            size="sm"
          />
          <button
            onClick={() => { askQuestion(textInput); setTextInput(""); }}
            disabled={loading || !textInput.trim()}
            className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-full flex items-center justify-center text-white text-sm"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
