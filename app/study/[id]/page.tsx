"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { extractSections, buildHeadingTree, Section, HeadingNode } from "@/lib/markdown";
import Navigation from "@/components/Navigation";
import MarkdownViewer, { Highlight } from "@/components/MarkdownViewer";
import ProgressBar from "@/components/ProgressBar";
import QuizSection from "@/components/QuizSection";
import FloatingCommentCard, { CommentCardData } from "@/components/FloatingCommentCard";
import FloatingAsk from "@/components/FloatingAsk";

interface GenerationPlan {
  title: string;
  summary: string;
  topics: string[];
}

interface TopicState {
  name: string;
  status: "pending" | "generating" | "done" | "error";
}

interface DbComment {
  id: string;
  text: string;
  section_id: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

function findNodeInTree(nodes: HeadingNode[], targetId: string): HeadingNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findNodeInTree(node.children, targetId);
    if (found) return found;
  }
  return null;
}

function getDescendantIds(node: HeadingNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child));
  }
  return ids;
}

function computeParentAutoStates(
  nodes: HeadingNode[],
  progress: Record<string, boolean>
): Record<string, boolean> {
  const updates: Record<string, boolean> = {};
  function processNode(node: HeadingNode): boolean {
    if (node.children.length === 0) return !!progress[node.id];
    const allDone = node.children.every(processNode);
    updates[node.id] = allDone;
    return allDone;
  }
  for (const node of nodes) processNode(node);
  return updates;
}

export default function StudyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const tab = searchParams.get("tab") || "study";

  const [name, setName] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [headings, setHeadings] = useState<HeadingNode[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [genPlan, setGenPlan] = useState<GenerationPlan | null>(null);
  const [topicStates, setTopicStates] = useState<TopicState[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const streamPanelRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(480, Math.max(160, ev.clientX)));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const [commentCards, setCommentCards] = useState<CommentCardData[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [filterMode, setFilterMode] = useState(false);

  // Cleanup SSE on unmount — generation continues server-side
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  function startSSE() {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/generate/stream/${id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "topic_start") {
        setTopicStates((prev) =>
          prev.map((t, i) => (i === data.index ? { ...t, status: "generating" } : t))
        );
        setStreamBuffer("");
      }

      if (data.type === "token") {
        setStreamBuffer((prev) => prev + data.content);
        requestAnimationFrame(() => {
          streamPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      }

      if (data.type === "topic_done") {
        setTopicStates((prev) =>
          prev.map((t, i) => (i === data.index ? { ...t, status: "done" } : t))
        );
        setStreamBuffer("");
        // Refresh sections from DB so the completed topic is browsable
        (async () => {
          const mdRes = await fetch(`/api/markdowns/${id}`);
          const md = await mdRes.json();
          const parsed = extractSections(md.content);
          setSections(parsed);
          setHeadings(buildHeadingTree(parsed));
        })();
      }

      if (data.type === "error") {
        setTopicStates((prev) =>
          prev.map((t, i) => (i === data.index ? { ...t, status: "error" } : t))
        );
      }

      if (data.type === "done") {
        es.close();
        esRef.current = null;
        fetch(`/api/markdowns/${id}`)
          .then((r) => r.json())
          .then((md) => {
            const parsed = extractSections(md.content);
            setSections(parsed);
            setHeadings(buildHeadingTree(parsed));
            if (parsed.length > 0) setActiveId(parsed[0].id);
            setIsGenerating(false);
            setGenPlan(null);
            setStreamBuffer("");
          });
      }
    };
  }

  useEffect(() => {
    async function load() {
      const [mdRes, progressRes, commentsRes, highlightsRes] = await Promise.all([
        fetch(`/api/markdowns/${id}`),
        fetch(`/api/progress/${id}`),
        fetch(`/api/comments/${id}`),
        fetch(`/api/highlights/${id}`),
      ]);
      const md = await mdRes.json();
      const prog = await progressRes.json();
      const comms: DbComment[] = await commentsRes.json();
      setHighlights(await highlightsRes.json());
      setName(md.name);

      if (md.status === "generating" && md.generation_plan) {
        const plan: GenerationPlan = JSON.parse(md.generation_plan);
        setGenPlan(plan);
        setIsGenerating(true);

        // Initialise topic states from already-written content
        const initialTopicStates: TopicState[] = plan.topics.map((t) => ({
          name: t,
          status: md.content.includes(`## ${t}`) ? "done" : "pending",
        }));
        setTopicStates(initialTopicStates);

        // Parse whatever sections already exist
        const parsed = extractSections(md.content);
        setSections(parsed);
        setHeadings(buildHeadingTree(parsed));
        if (parsed.length > 0) setActiveId(parsed[0].id);

        setProgress(prog);
        setCommentCards(
          comms.map((c) => ({
            uid: c.id,
            id: c.id,
            text: c.text,
            isSaved: true,
            sectionId: c.section_id || undefined,
            position: { x: c.pos_x ?? 120, y: c.pos_y ?? 120 },
            width: c.width ?? 300,
            height: c.height ?? 220,
          }))
        );
        setLoading(false);
        startSSE();
        return;
      }

      const parsed = extractSections(md.content);
      setSections(parsed);
      setHeadings(buildHeadingTree(parsed));
      setProgress(prog);
      if (parsed.length > 0) setActiveId(parsed[0].id);
      setCommentCards(
        comms.map((c) => ({
          uid: c.id,
          id: c.id,
          text: c.text,
          isSaved: true,
          sectionId: c.section_id || undefined,
          position: { x: c.pos_x ?? 120, y: c.pos_y ?? 120 },
          width: c.width ?? 300,
          height: c.height ?? 220,
        }))
      );
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleNavigate = useCallback((sectionId: string) => {
    setActiveId(sectionId);
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function navigateToTopic(topicName: string) {
    const section = sections.find((s) => s.title === topicName);
    if (section) {
      setActiveId(section.id);
      setTimeout(() => {
        document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  async function handleToggleDone(sectionId: string, done: boolean) {
    const node = findNodeInTree(headings, sectionId);
    const descendantIds = node ? getDescendantIds(node) : [];
    const cascadeIds = [sectionId, ...descendantIds];

    const newProgress = { ...progress };
    for (const cid of cascadeIds) newProgress[cid] = done;

    const parentUpdates = computeParentAutoStates(headings, newProgress);
    const finalProgress = { ...newProgress, ...parentUpdates };

    const changedIds = Object.keys(finalProgress).filter(
      (pid) => finalProgress[pid] !== progress[pid]
    );

    await Promise.all(
      changedIds.map((pid) =>
        fetch(`/api/progress/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionId: pid, completed: finalProgress[pid] }),
        })
      )
    );

    setProgress(finalProgress);

    if (done) {
      const autoPromotedIds = Object.keys(parentUpdates).filter(
        (pid) => parentUpdates[pid] && !progress[pid]
      );
      const idsToGenerate = Array.from(new Set([sectionId, ...autoPromotedIds]));

      for (const gid of idsToGenerate) {
        const gnode = findNodeInTree(headings, gid);
        if (gnode && gnode.children.length > 0) {
          setGeneratingFor(gnode.title);
          fetch(`/api/quiz/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdownId: id, sectionId: gid }),
          }).catch(() => {});
        }
      }
      if (
        idsToGenerate.some((gid) => {
          const gnode = findNodeInTree(headings, gid);
          return gnode && gnode.children.length > 0;
        })
      ) {
        setTimeout(() => setGeneratingFor(null), 3000);
      }
    }
  }

  function openNewCommentCard() {
    const card: CommentCardData = {
      uid: uuidv4(),
      text: "",
      isSaved: false,
      sectionId: activeId || undefined,
      position: {
        x: Math.max(80, window.innerWidth / 2 - 150 + (commentCards.length % 5) * 30 + window.scrollX),
        y: Math.max(80, 140 + (commentCards.length % 5) * 30 + window.scrollY),
      },
    };
    setCommentCards((prev) => [...prev, card]);
  }

  function updateCard(uid: string, updates: Partial<CommentCardData>) {
    setCommentCards((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...updates } : c)));
  }

  function closeCard(uid: string) {
    setCommentCards((prev) => prev.filter((c) => c.uid !== uid));
  }

  function deleteCard(uid: string) {
    setCommentCards((prev) => prev.filter((c) => c.uid !== uid));
  }

  const handleHighlight = useCallback(
    async (text: string, sectionId: string, color: string) => {
      const res = await fetch(`/api/highlights/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, selectedText: text, color }),
      });
      const h: Highlight = await res.json();
      setHighlights((prev) => [...prev, h]);
    },
    [id]
  );

  const handleRemoveHighlight = useCallback(
    async (highlightId: string) => {
      await fetch(`/api/highlights/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlightId }),
      });
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    },
    [id]
  );

  const handleRecolorHighlight = useCallback(
    async (highlightId: string, color: string) => {
      const res = await fetch(`/api/highlights/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlightId, color }),
      });
      const updated: Highlight = await res.json();
      setHighlights((prev) => prev.map((h) => (h.id === highlightId ? updated : h)));
    },
    [id]
  );

  const handlePartialRemove = useCallback(
    async (highlightId: string, textToRemove: string) => {
      const original = highlights.find((h) => h.id === highlightId);
      if (!original) return;

      await fetch(`/api/highlights/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlightId }),
      });

      const idx = original.selected_text.indexOf(textToRemove);
      const before = original.selected_text.slice(0, idx).trim();
      const after = original.selected_text.slice(idx + textToRemove.length).trim();

      const created: Highlight[] = [];
      for (const part of [before, after]) {
        if (!part) continue;
        const res = await fetch(`/api/highlights/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionId: original.section_id, selectedText: part, color: original.color }),
        });
        created.push(await res.json());
      }

      setHighlights((prev) => [...prev.filter((h) => h.id !== highlightId), ...created]);
    },
    [id, highlights]
  );

  const handleSelectionChange = useCallback((text: string, sectionId: string) => {
    setSelectedText(text);
    setSelectedSectionId(sectionId);
  }, []);

  const handleCommentUpdate = useCallback(
    async (commentId: string, text: string) => {
      await fetch(`/api/comments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, text }),
      });
      updateCard(commentId, { text });
    },
    [id]
  );

  const handleCommentDelete = useCallback(
    (commentId: string) => {
      fetch(`/api/comments/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      deleteCard(commentId);
    },
    [id]
  );

  const completedCount = Object.values(progress).filter(Boolean).length;
  const doneTopicCount = topicStates.filter((t) => t.status === "done").length;
  const currentTopic = topicStates.find((t) => t.status === "generating");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* Fixed top header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center gap-4 h-14">
        <Link href="/" className="text-slate-400 hover:text-white text-sm flex-shrink-0">
          ← Home
        </Link>
        <div className="h-4 w-px bg-slate-700 flex-shrink-0" />
        <h1 className="text-white font-semibold truncate flex-1 min-w-0">{name}</h1>

        {isGenerating && genPlan ? (
          /* Generation progress badge */
          <div className="flex items-center gap-2 text-sm text-slate-400 flex-shrink-0">
            <span className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full" />
            <span>
              {doneTopicCount}/{genPlan.topics.length} topics
            </span>
          </div>
        ) : (
          /* Normal tab switcher */
          <div className="flex items-center gap-1 bg-slate-900 rounded-xl p-1 flex-shrink-0">
            <button
              onClick={() => router.push(`/study/${id}`)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === "study" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Study
            </button>
            <button
              onClick={() => router.push(`/study/${id}?tab=quiz`)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === "quiz" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Quiz
            </button>
            <button
              onClick={() => router.push(`/study/${id}?tab=all`)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All Questions
            </button>
          </div>
        )}
      </header>

      {/* Fixed left sidebar */}
      <aside
        className="fixed left-0 top-14 bottom-0 bg-slate-800 border-r border-slate-700 flex flex-col z-30 overflow-hidden"
        style={{ width: sidebarOpen ? sidebarWidth : 32 }}
      >
        <div
          className={`transition-opacity duration-150 ${
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          } flex flex-col flex-1 overflow-hidden`}
        >
          {/* Sidebar header */}
          <div className="p-4 border-b border-slate-700 flex-shrink-0">
            {isGenerating && genPlan ? (
              <div className="text-slate-400 text-xs font-medium">
                {doneTopicCount} / {genPlan.topics.length} topics complete
              </div>
            ) : (
              <ProgressBar total={sections.length} completed={completedCount} />
            )}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto p-3">
            {isGenerating && genPlan ? (
              /* Topic generation checklist */
              <div className="space-y-0.5">
                {topicStates.map((t, i) => {
                  const section = sections.find((s) => s.title === t.name);
                  return (
                    <button
                      key={i}
                      onClick={section ? () => navigateToTopic(t.name) : undefined}
                      className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg w-full text-left transition-colors ${
                        section
                          ? "hover:bg-slate-700 cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      {t.status === "done" && (
                        <span className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs flex-shrink-0">
                          ✓
                        </span>
                      )}
                      {t.status === "generating" && (
                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                          <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        </span>
                      )}
                      {t.status === "error" && (
                        <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs flex-shrink-0">
                          ✕
                        </span>
                      )}
                      {t.status === "pending" && (
                        <span className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${
                          t.status === "done"
                            ? "text-slate-300"
                            : t.status === "generating"
                            ? "text-white font-medium"
                            : t.status === "error"
                            ? "text-red-400"
                            : "text-slate-500"
                        }`}
                      >
                        {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Navigation
                headings={headings}
                progress={progress}
                activeId={activeId}
                onNavigate={handleNavigate}
                onToggleDone={handleToggleDone}
              />
            )}
          </div>
        </div>

        {/* Drag-to-resize handle */}
        {sidebarOpen && (
          <div
            onMouseDown={startResize}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors"
          />
        )}
      </aside>

      {/* Sidebar toggle button */}
      <button
        onClick={() => setSidebarOpen((o) => !o)}
        className="fixed z-40 top-[calc(3.5rem+1rem)] w-5 h-8 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-r-md flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        style={{ left: sidebarOpen ? sidebarWidth : 32 }}
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3 h-3 transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Main content */}
      <main className="pt-14 min-h-screen" style={{ marginLeft: sidebarOpen ? sidebarWidth : 32 }}>
        <div className="max-w-3xl mx-auto px-8 py-10 pb-28">
          {tab === "study" ? (
            <>
              {/* Completed sections — always rendered when available */}
              {sections.length > 0 && (
                <MarkdownViewer
                  sections={sections}
                  highlights={highlights}
                  comments={commentCards
                    .filter((c) => c.text.trim())
                    .map((c) => ({ id: c.uid, text: c.text, sectionId: c.sectionId }))}
                  filterMode={filterMode}
                  onFilterModeChange={setFilterMode}
                  onActiveSection={setActiveId}
                  onSelectionChange={handleSelectionChange}
                  onHighlight={handleHighlight}
                  onRemoveHighlight={handleRemoveHighlight}
                  onRecolorHighlight={handleRecolorHighlight}
                  onPartialRemove={handlePartialRemove}
                  onCommentUpdate={handleCommentUpdate}
                  onCommentDelete={handleCommentDelete}
                />
              )}

              {/* Streaming panel — visible during generation */}
              {isGenerating && (
                <div ref={streamPanelRef} className="mt-10">
                  {streamBuffer ? (
                    <div>
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-700">
                        <span className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full flex-shrink-0" />
                        <span className="text-indigo-400 text-xs font-medium">
                          Writing: {currentTopic?.name}
                        </span>
                      </div>
                      <pre className="text-slate-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                        {streamBuffer}
                        <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                      </pre>
                    </div>
                  ) : sections.length === 0 ? (
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <span className="animate-spin w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full" />
                      Waiting for first topic…
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <span className="animate-spin w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full" />
                      Preparing next topic…
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <QuizSection
              markdownId={id}
              view={tab === "all" ? "all" : "quiz"}
              progress={progress}
            />
          )}
        </div>
      </main>

      {/* Floating action bar — study tab only, not during generation */}
      {tab === "study" && !isGenerating && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
          <button
            onClick={openNewCommentCard}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-full shadow-lg font-medium text-sm"
          >
            <span>💬</span>
            <span>Comment</span>
          </button>
          <FloatingAsk selectedText={selectedText} selectedSectionId={selectedSectionId} />
        </div>
      )}

      {/* Quiz generation toast */}
      {generatingFor && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-full px-5 py-2.5 text-sm text-slate-200 shadow-lg flex items-center gap-2 max-w-sm">
          <span className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full flex-shrink-0" />
          <span className="truncate">
            Generating questions for &ldquo;{generatingFor}&rdquo; in background…
          </span>
        </div>
      )}

      {/* Floating comment cards — in highlight mode only unsaved (new) cards float */}
      {tab === "study" &&
        commentCards
          .filter((card) => !filterMode || !card.isSaved)
          .map((card) => (
          <FloatingCommentCard
            key={card.uid}
            card={card}
            markdownId={id}
            sections={sections}
            onUpdate={updateCard}
            onClose={closeCard}
            onDelete={deleteCard}
          />
        ))}
    </div>
  );
}
