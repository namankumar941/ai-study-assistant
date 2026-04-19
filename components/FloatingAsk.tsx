"use client";
import { useState, useRef, useEffect } from "react";
import { speak } from "./VoiceButton";
import { Message } from "@/lib/llm";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  selectedText: string;
  selectedSectionId: string;
}

export default function FloatingAsk({ selectedText }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  function handleOpen() {
    const sel = window.getSelection()?.toString().trim() || selectedText || "";
    setContext(sel);
    setOpen(true);
    setMinimized(false);
  }

  function handleClose() {
    setOpen(false);
    setMinimized(false);
  }

  function handleMinimize() {
    setMinimized(true);
  }

  function handleRestore() {
    setMinimized(false);
  }

  function newChat() {
    setTurns([]);
    setDraft("");
    setContext(window.getSelection()?.toString().trim() || "");
  }

  function startListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported in this browser"); return; }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<SpeechRecognitionResult>)
        .map((r) => r[0].transcript)
        .join("");
      setDraft(transcript);
    };
    recognition.onend = () => setListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => { console.error(e.error); setListening(false); };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function sendMessage() {
    if (!draft.trim() || loading) return;
    const question = draft.trim();
    setDraft("");

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

  const hasHistory = turns.length > 0;

  return (
    <>
      {/* Floating Ask button */}
      <button
        onClick={open ? (minimized ? handleRestore : handleMinimize) : handleOpen}
        title={open ? (minimized ? "Expand chat" : "Minimize chat") : "Ask a question"}
        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-medium text-sm transition-all ${
          open ? "bg-indigo-700 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"
        }`}
      >
        <span className="text-base">🎤</span>
        <span>{open && minimized ? "Ask (minimized)" : "Ask"}</span>
        {/* Dot indicator when minimized with active conversation */}
        {minimized && hasHistory && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900" />
        )}
      </button>

      {/* Q&A Panel — hidden when minimized */}
      {open && !minimized && (
        <div className="fixed right-4 bottom-20 w-[420px] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 flex flex-col max-h-[78vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
            <h3 className="text-white font-semibold text-sm">Ask anything</h3>
            <div className="flex items-center gap-1">
              {/* New Chat */}
              <button
                onClick={newChat}
                title="Start a new conversation"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <span>＋</span> New chat
              </button>
              {/* Minimize */}
              <button
                onClick={handleMinimize}
                title="Minimize"
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-lg leading-none transition-colors"
              >
                −
              </button>
              {/* Close */}
              <button
                onClick={handleClose}
                title="Close"
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
          </div>

          {/* Context */}
          {context && (
            <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 mb-1">Context (selected text):</p>
                  <p className="text-slate-400 text-xs font-mono line-clamp-2">{context}</p>
                </div>
                <button
                  onClick={() => setContext("")}
                  className="text-slate-600 hover:text-slate-400 text-xs flex-shrink-0 mt-1"
                  title="Clear context"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Conversation */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[120px]">
            {turns.length === 0 && (
              <p className="text-slate-500 text-sm text-center mt-6">
                {context
                  ? "Ask a question about the selected text."
                  : "Select text on the page for context, or ask anything."}
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
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
                <div className="bg-slate-700 rounded-xl px-3 py-2 text-slate-400 text-sm">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-700 space-y-2 flex-shrink-0">
            <div className="relative">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder={listening ? "Listening… speak now" : "Type or speak, then edit before sending…"}
                className={`w-full bg-slate-900 text-slate-100 rounded-xl p-3 text-sm resize-none border focus:outline-none pr-8 ${
                  listening ? "border-red-500 animate-pulse" : "border-slate-600 focus:border-indigo-500"
                }`}
                rows={3}
              />
              {draft && (
                <button
                  onClick={() => setDraft("")}
                  className="absolute top-2 right-2 text-slate-500 hover:text-slate-300"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                title={listening ? "Stop" : "Speak"}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
                  listening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40"
                }`}
              >
                {listening ? "■" : "🎤"}
              </button>

              {listening && <span className="text-red-400 text-xs flex-1">Recording… click ■ to stop</span>}

              <button
                onClick={sendMessage}
                disabled={loading || !draft.trim()}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm rounded-xl font-medium"
              >
                Send ↑
              </button>
            </div>

            {draft && !loading && (
              <p className="text-slate-600 text-xs">Edit above if needed, then Send or press Enter.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
