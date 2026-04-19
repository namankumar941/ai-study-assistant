"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { extractSections, buildHeadingTree, Section, HeadingNode } from "@/lib/markdown";
import Navigation from "@/components/Navigation";
import MarkdownViewer from "@/components/MarkdownViewer";
import ProgressBar from "@/components/ProgressBar";
import QuizSection from "@/components/QuizSection";
import FloatingCommentCard, { CommentCardData } from "@/components/FloatingCommentCard";
import FloatingAsk from "@/components/FloatingAsk";

interface DbComment {
  id: string;
  text: string;
  pos_x: number;
  pos_y: number;
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

// For nodes with children, auto-compute their state from children (all done → parent done)
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

  useEffect(() => {
    async function load() {
      const [mdRes, progressRes, commentsRes] = await Promise.all([
        fetch(`/api/markdowns/${id}`),
        fetch(`/api/progress/${id}`),
        fetch(`/api/comments/${id}`),
      ]);
      const md = await mdRes.json();
      const prog = await progressRes.json();
      const comms: DbComment[] = await commentsRes.json();

      const parsed = extractSections(md.content);
      setName(md.name);
      setSections(parsed);
      setHeadings(buildHeadingTree(parsed));
      setProgress(prog);
      if (parsed.length > 0) setActiveId(parsed[0].id);

      // Restore saved comments as floating cards
      setCommentCards(
        comms.map((c) => ({
          uid: c.id,
          id: c.id,
          text: c.text,
          isSaved: true,
          position: { x: c.pos_x ?? 120, y: c.pos_y ?? 120 },
        }))
      );

      setLoading(false);
    }
    load();
  }, [id]);

  const handleNavigate = useCallback((sectionId: string) => {
    setActiveId(sectionId);
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleToggleDone(sectionId: string, done: boolean) {
    // Cascade to all descendants
    const node = findNodeInTree(headings, sectionId);
    const descendantIds = node ? getDescendantIds(node) : [];
    const cascadeIds = [sectionId, ...descendantIds];

    const newProgress = { ...progress };
    for (const cid of cascadeIds) newProgress[cid] = done;

    // Auto-mark parents whose all children are now done
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

    // Trigger background question generation for non-leaf nodes being marked complete
    // Includes directly-toggled section AND any parents auto-promoted by computeParentAutoStates
    if (done) {
      const autoPromotedIds = Object.keys(parentUpdates).filter(
        (pid) => parentUpdates[pid] && !progress[pid]
      );
      const idsToGenerate = [sectionId, ...autoPromotedIds];

      for (const gid of idsToGenerate) {
        const gnode = findNodeInTree(headings, gid);
        if (gnode && gnode.children.length > 0) {
          setGeneratingFor(gnode.title);
          fetch(`/api/quiz/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdownId: id, sectionId: gid }),
          }).catch(() => {/* ignore — generation runs server-side */});
        }
      }
      if (idsToGenerate.some((gid) => {
        const gnode = findNodeInTree(headings, gid);
        return gnode && gnode.children.length > 0;
      })) {
        setTimeout(() => setGeneratingFor(null), 3000);
      }
    }
  }

  function openNewCommentCard() {
    const card: CommentCardData = {
      uid: uuidv4(),
      text: "",
      isSaved: false,
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

  const handleSelectionChange = useCallback((text: string, sectionId: string) => {
    setSelectedText(text);
    setSelectedSectionId(sectionId);
  }, []);

  const completedCount = Object.values(progress).filter(Boolean).length;

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
        <Link href="/" className="text-slate-400 hover:text-white text-sm flex-shrink-0">← Home</Link>
        <div className="h-4 w-px bg-slate-700 flex-shrink-0" />
        <h1 className="text-white font-semibold truncate flex-1 min-w-0">{name}</h1>
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
      </header>

      {/* Fixed left sidebar */}
      <aside
        className="fixed left-0 top-14 bottom-0 bg-slate-800 border-r border-slate-700 flex flex-col z-30 overflow-hidden"
        style={{ width: sidebarOpen ? sidebarWidth : 32 }}
      >
        <div className={`transition-opacity duration-150 ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"} flex flex-col flex-1 overflow-hidden`}>
          <div className="p-4 border-b border-slate-700 flex-shrink-0">
            <ProgressBar total={sections.length} completed={completedCount} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <Navigation
              headings={headings}
              progress={progress}
              activeId={activeId}
              onNavigate={handleNavigate}
              onToggleDone={handleToggleDone}
            />
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

      {/* Sidebar toggle button — rendered outside aside to avoid overflow-hidden clipping */}
      <button
        onClick={() => setSidebarOpen((o) => !o)}
        className="fixed z-40 top-[calc(3.5rem+1rem)] w-5 h-8 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-r-md flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        style={{ left: sidebarOpen ? sidebarWidth : 32 }}
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Main content */}
      <main className="pt-14 min-h-screen" style={{ marginLeft: sidebarOpen ? sidebarWidth : 32 }}>
        <div className="max-w-3xl mx-auto px-8 py-10 pb-28">
          {tab === "study" ? (
            <MarkdownViewer
              sections={sections}
              onActiveSection={setActiveId}
              onSelectionChange={handleSelectionChange}
            />
          ) : (
            <QuizSection markdownId={id} view={tab === "all" ? "all" : "quiz"} progress={progress} />
          )}
        </div>
      </main>

      {/* Floating action bar */}
      {tab === "study" && (
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
          <span className="truncate">Generating questions for &ldquo;{generatingFor}&rdquo; in background…</span>
        </div>
      )}

      {/* Floating comment cards */}
      {commentCards.map((card) => (
        <FloatingCommentCard
          key={card.uid}
          card={card}
          markdownId={id}
          onUpdate={updateCard}
          onClose={closeCard}
          onDelete={deleteCard}
        />
      ))}
    </div>
  );
}
