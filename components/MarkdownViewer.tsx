"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Section } from "@/lib/markdown";

export interface Highlight {
  id: string;
  section_id: string;
  selected_text: string;
  color: string;
}

interface PickerState {
  x: number;
  y: number;
  text: string;
  sectionId: string;
  highlightId?: string;
  containingHighlightId?: string;
}

interface PreviewHighlight {
  text: string;
  color: string;
  highlightId?: string;
}

const PRESET_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Purple", value: "#ddd6fe" },
  { label: "Red", value: "#fca5a5" },
];

interface Props {
  sections: Section[];
  highlights: Highlight[];
  comments: { id: string; text: string; sectionId?: string }[];
  filterMode: boolean;
  onActiveSection: (id: string) => void;
  onSelectionChange: (text: string, sectionId: string) => void;
  onHighlight: (text: string, sectionId: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
  onRecolorHighlight: (id: string, color: string) => void;
  onPartialRemove: (highlightId: string, textToRemove: string) => void;
  onCommentUpdate: (id: string, text: string) => Promise<void>;
  onCommentDelete: (id: string) => void;
}

// ── Module-scope DOM helpers (shared by all interactive viewers) ──────────────

function unwrapSpan(span: Element) {
  const parent = span.parentNode!;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}

function unwrapAll(container: HTMLElement) {
  container.querySelectorAll("span[data-hid]").forEach(unwrapSpan);
}

function applySpans(container: HTMLElement, text: string, color: string, id: string) {
  if (!text.trim()) return;
  type Entry = { node: Text; start: number };
  const entries: Entry[] = [];
  let pos = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node as Text;
    if (t.parentElement?.closest("span[data-hid]")) continue;
    entries.push({ node: t, start: pos });
    pos += t.data.length;
  }
  const fullText = entries.map((e) => e.node.data).join("");
  type Item = { node: Text; localStart: number; localEnd: number };
  const toWrap: Item[] = [];
  const idx = fullText.indexOf(text);
  if (idx !== -1) {
    const matchEnd = idx + text.length;
    for (const { node: t, start } of entries) {
      const nodeEnd = start + t.data.length;
      if (start >= matchEnd || nodeEnd <= idx) continue;
      const localStart = Math.max(0, idx - start);
      const localEnd = Math.min(t.data.length, matchEnd - start);
      if (localStart < localEnd) toWrap.push({ node: t, localStart, localEnd });
    }
  }
  toWrap.reverse();
  for (const { node: t, localStart, localEnd } of toWrap) {
    try {
      if (!t.parentNode || t.data.length < localEnd) continue;
      const range = document.createRange();
      range.setStart(t, localStart);
      range.setEnd(t, localEnd);
      const span = document.createElement("span");
      span.style.textDecoration = "underline";
      span.style.textDecorationColor = color;
      span.style.textDecorationThickness = "2px";
      span.style.textUnderlineOffset = "3px";
      span.style.cursor = "pointer";
      span.setAttribute("data-hid", id);
      range.surroundContents(span);
    } catch { /* range spans element boundary — skip segment */ }
  }
}

// ── Shared picker popup ───────────────────────────────────────────────────────

function PickerUI({
  picker,
  preview,
  onColorClick,
  onOK,
  onRemove,
}: {
  picker: PickerState;
  preview: PreviewHighlight | null;
  onColorClick: (color: string) => void;
  onOK: () => void;
  onRemove: () => void;
}) {
  const pickerX = Math.min(Math.max(picker.x, 140), window.innerWidth - 140);
  const above = picker.y > 80;
  const pickerY = above ? picker.y - 62 : picker.y + 30;

  return (
    <div
      id="hl-picker"
      className="fixed z-50 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl px-3 py-2.5 flex items-center gap-2"
      style={{ left: pickerX, top: pickerY, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {PRESET_COLORS.map(({ label, value }) => (
        <button
          key={value}
          title={label}
          onMouseDown={(e) => { e.preventDefault(); onColorClick(value); }}
          className="w-6 h-6 rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: value,
            outline: preview?.color === value ? "2px solid white" : "2px solid transparent",
            outlineOffset: "2px",
          }}
        />
      ))}
      <label
        title="Custom color"
        className="relative w-6 h-6 rounded-full border-2 border-slate-500 hover:border-white transition-all cursor-pointer flex items-center justify-center text-slate-400 hover:text-white"
        style={{ fontSize: 13, fontWeight: 600 }}
        onMouseDown={(e) => e.preventDefault()}
      >
        +
        <input
          type="color"
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer rounded-full"
          value={preview?.color ?? "#ffffff"}
          onChange={(e) => onColorClick(e.target.value)}
        />
      </label>
      {preview && (
        <>
          <div className="w-px h-5 bg-slate-600 mx-0.5" />
          <button
            onClick={onOK}
            className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            OK
          </button>
        </>
      )}
      {(picker.highlightId || picker.containingHighlightId) && (
        <>
          {!preview && <div className="w-px h-5 bg-slate-600 mx-0.5" />}
          <button
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded-lg transition-colors"
          >
            {picker.containingHighlightId ? "Remove here" : "Remove"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Heading components ────────────────────────────────────────────────────────

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5 inline-block ml-1.5 opacity-50 flex-shrink-0 transition-transform"
      style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function HighlightHeading({
  section,
  dim,
  expanded,
  onClick,
}: {
  section: Section;
  dim?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const clickable = !dim && onClick;
  const spanClass = clickable
    ? "cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center"
    : "";
  const inner = (
    <span className={spanClass} onClick={clickable ? onClick : undefined}>
      {section.title}
      {clickable && <ExpandIcon expanded={!!expanded} />}
    </span>
  );
  if (section.level === 1)
    return (
      <h1 className={`text-2xl font-bold mt-8 mb-2 pb-2 border-b border-slate-700/50 ${dim ? "text-slate-600" : "text-white"}`}>
        {inner}
      </h1>
    );
  if (section.level === 2)
    return (
      <h2 className={`text-lg font-bold mt-6 mb-1 ${dim ? "text-slate-600" : "text-slate-100"}`}>
        {inner}
      </h2>
    );
  return (
    <h3 className={`text-base font-semibold mt-4 mb-1 ${dim ? "text-slate-600" : "text-slate-200"}`}>
      {inner}
    </h3>
  );
}

// ── Shared hook: highlight-aware interactive content ──────────────────────────

function useHighlightInteraction({
  containerRef,
  highlights,
  sectionId,
  onHighlight,
  onRemoveHighlight,
  onRecolorHighlight,
  onPartialRemove,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  highlights: Highlight[];
  sectionId: string;
  onHighlight: (text: string, sectionId: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
  onRecolorHighlight: (id: string, color: string) => void;
  onPartialRemove: (highlightId: string, textToRemove: string) => void;
}) {
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [preview, setPreview] = useState<PreviewHighlight | null>(null);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  // Apply saved highlights
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    unwrapAll(container);
    container.normalize();
    for (const h of highlights) {
      applySpans(container, h.selected_text, h.color, h.id);
    }
  }, [highlights]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview overlay
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll("span[data-hid='__preview__']").forEach(unwrapSpan);
    if (!preview) return;
    if (preview.highlightId) {
      container.querySelectorAll(`span[data-hid="${preview.highlightId}"]`).forEach((s) => {
        (s as HTMLElement).style.textDecorationColor = preview.color;
      });
      return;
    }
    const sel = window.getSelection();
    const hadSelection = sel && !sel.isCollapsed;
    applySpans(container, preview.text, preview.color, "__preview__");
    if (hadSelection) {
      const spans = Array.from(container.querySelectorAll("span[data-hid='__preview__']"));
      if (spans.length > 0) {
        try {
          const range = document.createRange();
          range.setStartBefore(spans[0]);
          range.setEndAfter(spans[spans.length - 1]);
          sel!.removeAllRanges();
          sel!.addRange(range);
        } catch { /* ignore invalid range edge cases */ }
      }
    }
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click on highlight span → recolor/remove picker
  useEffect(() => {
    const handleMarkClick = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const span = (e.target as HTMLElement).closest("span[data-hid]") as HTMLElement | null;
      if (!span || !container.contains(span) || span.getAttribute("data-hid") === "__preview__") return;
      const rect = span.getBoundingClientRect();
      const hid = span.getAttribute("data-hid") || undefined;
      setPicker({ x: rect.left + rect.width / 2, y: rect.top, text: span.textContent || "", sectionId, highlightId: hid });
      setPreview(null);
    };
    document.addEventListener("click", handleMarkClick);
    return () => document.removeEventListener("click", handleMarkClick);
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Text selection → color picker
  useEffect(() => {
    const handleMouseUp = (e: Event) => {
      const container = containerRef.current;
      if (!container) return;
      if (document.getElementById("hl-picker")?.contains(e.target as Node)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const selectedText = selection.toString().trim();
      const exact = highlightsRef.current.find((h) => h.selected_text === selectedText);
      const containing = !exact
        ? highlightsRef.current.find((h) => h.selected_text.includes(selectedText) && h.selected_text !== selectedText)
        : undefined;
      // Detect section from DOM so highlights made in the full view get the right section_id
      let resolvedSectionId = sectionId;
      let node: Node | null = range.commonAncestorContainer;
      while (node) {
        if (node instanceof HTMLElement) {
          const el = node.closest("[data-section-id]");
          if (el) { resolvedSectionId = el.getAttribute("data-section-id") || sectionId; break; }
        }
        node = node.parentNode;
      }
      const rect = range.getBoundingClientRect();
      setPicker({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text: selectedText,
        sectionId: resolvedSectionId,
        highlightId: exact?.id,
        containingHighlightId: containing?.id,
      });
      setPreview(exact ? { text: selectedText, color: exact.color, highlightId: exact.id } : null);
    };
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleMouseUp);
    };
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss picker on outside click
  useEffect(() => {
    if (!picker) return;
    const handleOutside = (e: MouseEvent) => {
      if (document.getElementById("hl-picker")?.contains(e.target as Node)) return;
      setPicker(null);
      setPreview(null);
      window.getSelection()?.removeAllRanges();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleOutside), 60);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [picker]);

  function handleColorClick(color: string) {
    if (!picker) return;
    setPreview({ text: picker.text, color, highlightId: picker.highlightId });
  }

  function handleOK() {
    if (!picker || !preview) return;
    const { text, sectionId: sid, highlightId } = picker;
    const { color } = preview;
    setPicker(null);
    setPreview(null);
    window.getSelection()?.removeAllRanges();
    if (highlightId) onRecolorHighlight(highlightId, color);
    else onHighlight(text, sid, color);
  }

  function handleRemove() {
    if (!picker) return;
    if (picker.highlightId) onRemoveHighlight(picker.highlightId);
    else if (picker.containingHighlightId) onPartialRemove(picker.containingHighlightId, picker.text);
    setPreview(null);
    setPicker(null);
    window.getSelection()?.removeAllRanges();
  }

  return { picker, preview, handleColorClick, handleOK, handleRemove };
}

// ── Expanded section in highlight-only view ───────────────────────────────────

const mdComponents = {
  h1: ({ children }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-2xl font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-700">{children}</h1>
  ),
  h2: ({ children }: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-xl font-bold text-slate-100 mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-lg font-semibold text-slate-200 mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="text-slate-300 leading-relaxed mb-3">{children}</p>
  ),
  code: ({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) =>
    inline ? (
      <code className="bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
    ) : (
      <code className={`${className} font-mono text-sm`} {...props}>{children}</code>
    ),
  pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => (
    <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 overflow-x-auto text-sm my-3">{children}</pre>
  ),
  blockquote: ({ children }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="border-l-4 border-indigo-500 pl-4 text-slate-400 italic my-3">{children}</blockquote>
  ),
  ul: ({ children }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3">{children}</ul>
  ),
  ol: ({ children }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-inside text-slate-300 space-y-1 mb-3">{children}</ol>
  ),
  li: ({ children }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="text-slate-300">{children}</li>
  ),
};

function InteractiveSectionContent({
  section,
  highlights,
  onHighlight,
  onRemoveHighlight,
  onRecolorHighlight,
  onPartialRemove,
}: {
  section: Section;
  highlights: Highlight[];
  onHighlight: (text: string, sectionId: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
  onRecolorHighlight: (id: string, color: string) => void;
  onPartialRemove: (highlightId: string, textToRemove: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { picker, preview, handleColorClick, handleOK, handleRemove } = useHighlightInteraction({
    containerRef,
    highlights,
    sectionId: section.id,
    onHighlight,
    onRemoveHighlight,
    onRecolorHighlight,
    onPartialRemove,
  });

  return (
    <>
      <div
        ref={containerRef}
        data-section-id={section.id}
        className="mt-2 mb-4 pl-3 border-l-2 border-indigo-500/40 bg-slate-900/40 rounded-r-lg p-3 prose prose-invert prose-slate max-w-none select-text"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {section.content}
        </ReactMarkdown>
      </div>
      {picker && (
        <PickerUI
          picker={picker}
          preview={preview}
          onColorClick={handleColorClick}
          onOK={handleOK}
          onRemove={handleRemove}
        />
      )}
    </>
  );
}

// ── Inline editable comment in highlight view ─────────────────────────────────

function InlineEditableComment({
  comment,
  onUpdate,
  onDelete,
}: {
  comment: { id: string; text: string };
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    await onUpdate(comment.id, text);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-amber-950/40 border border-amber-600/60 rounded-lg overflow-hidden">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="w-full bg-transparent text-slate-200 text-sm p-3 resize-none focus:outline-none min-h-[80px]"
        />
        <div className="flex gap-2 px-3 pb-2">
          <button
            onClick={save}
            disabled={saving || !text.trim()}
            className="flex-1 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs rounded-lg font-medium"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setText(comment.text); setEditing(false); }}
            className="px-3 py-1 text-slate-400 hover:text-white text-xs rounded-lg hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onDelete(comment.id)}
            className="px-3 py-1 text-red-400 hover:text-red-300 text-xs rounded-lg"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap cursor-pointer hover:border-amber-700/60 hover:bg-amber-950/50 transition-colors"
    >
      {comment.text}
    </div>
  );
}

// ── Highlights-only filter view ───────────────────────────────────────────────

interface FilterViewCallbacks {
  onHighlight: (text: string, sectionId: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
  onRecolorHighlight: (id: string, color: string) => void;
  onPartialRemove: (highlightId: string, textToRemove: string) => void;
  onCommentUpdate: (id: string, text: string) => Promise<void>;
  onCommentDelete: (id: string) => void;
}

function HighlightsFilterView({
  sections,
  highlights,
  comments,
  callbacks,
}: {
  sections: Section[];
  highlights: Highlight[];
  comments: { id: string; text: string; sectionId?: string }[];
  callbacks: FilterViewCallbacks;
}) {
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);

  if (highlights.length === 0 && comments.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        No highlights or comments yet.
      </div>
    );
  }

  const sectionById = new Map<string, Section>();
  for (const s of sections) sectionById.set(s.id, s);

  const highlightsBySection = new Map<string, Highlight[]>();
  for (const h of highlights) {
    const key = h.section_id || "__root__";
    if (!highlightsBySection.has(key)) highlightsBySection.set(key, []);
    highlightsBySection.get(key)!.push(h);
  }

  // Sort each section's highlights by document position
  highlightsBySection.forEach((hl: Highlight[], sectionId: string) => {
    const content = sectionById.get(sectionId)?.content ?? "";
    hl.sort((a: Highlight, b: Highlight) => {
      const ai = content.indexOf(a.selected_text);
      const bi = content.indexOf(b.selected_text);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  });

  const commentsBySection = new Map<string, typeof comments>();
  for (const c of comments) {
    const key = c.sectionId || "__root__";
    if (!commentsBySection.has(key)) commentsBySection.set(key, []);
    commentsBySection.get(key)!.push(c);
  }

  const items: React.ReactNode[] = [];
  const shownHeadings = new Set<string>();

  function ensureHeadings(sectionIndex: number, section: Section) {
    const ancestors: Section[] = [];
    let trackedLevel = section.level;
    for (let j = sectionIndex - 1; j >= 0; j--) {
      if (sections[j].level < trackedLevel) {
        ancestors.unshift(sections[j]);
        trackedLevel = sections[j].level;
        if (trackedLevel === 1) break;
      }
    }
    for (const ancestor of ancestors) {
      if (!shownHeadings.has(ancestor.id)) {
        shownHeadings.add(ancestor.id);
        items.push(<HighlightHeading key={`h-${ancestor.id}`} section={ancestor} dim />);
      }
    }
    if (!shownHeadings.has(section.id)) {
      shownHeadings.add(section.id);
      const isExpanded = expandedSectionId === section.id;
      items.push(
        <HighlightHeading
          key={`h-${section.id}`}
          section={section}
          expanded={isExpanded}
          onClick={() => setExpandedSectionId(isExpanded ? null : section.id)}
        />
      );
      if (isExpanded) {
        const sectionHighlights = highlights.filter((h) => h.section_id === section.id);
        const sectionComments = commentsBySection.get(section.id);
        items.push(
          <InteractiveSectionContent
            key={`full-${section.id}`}
            section={section}
            highlights={sectionHighlights}
            {...callbacks}
          />
        );
        if (sectionComments) {
          items.push(
            <div key={`cm-expanded-${section.id}`} className="ml-4 mb-6 space-y-2">
              {sectionComments.map((c) => (
                <InlineEditableComment
                  key={c.id}
                  comment={c}
                  onUpdate={callbacks.onCommentUpdate}
                  onDelete={callbacks.onCommentDelete}
                />
              ))}
            </div>
          );
        }
      }
    }
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionHighlights = highlightsBySection.get(section.id);
    const sectionComments = commentsBySection.get(section.id);
    if (!sectionHighlights && !sectionComments) continue;

    ensureHeadings(i, section);
    if (expandedSectionId === section.id) continue;

    if (sectionHighlights) {
      items.push(
        <div key={`hl-${section.id}`} className="ml-4 pl-3 border-l border-slate-700 mb-3 space-y-2">
          {sectionHighlights.map((h) => (
            <p
              key={h.id}
              className="text-slate-200 text-sm leading-relaxed"
              style={{
                textDecoration: "underline",
                textDecorationColor: h.color,
                textDecorationThickness: "2px",
                textUnderlineOffset: "3px",
                whiteSpace: "pre-wrap",
              }}
            >
              {h.selected_text}
            </p>
          ))}
        </div>
      );
    }

    if (sectionComments) {
      items.push(
        <div key={`cm-${section.id}`} className="ml-4 mb-6 space-y-2">
          {sectionComments.map((c) => (
            <InlineEditableComment
              key={c.id}
              comment={c}
              onUpdate={callbacks.onCommentUpdate}
              onDelete={callbacks.onCommentDelete}
            />
          ))}
        </div>
      );
    }
  }

  const rootHighlights = highlightsBySection.get("__root__");
  const rootComments = commentsBySection.get("__root__");
  if (rootHighlights || rootComments) {
    items.push(
      <div key="root-items" className="mb-6 space-y-2">
        {rootHighlights?.map((h) => (
          <p
            key={h.id}
            className="text-slate-200 text-sm leading-relaxed"
            style={{
              textDecoration: "underline",
              textDecorationColor: h.color,
              textDecorationThickness: "2px",
              textUnderlineOffset: "3px",
              whiteSpace: "pre-wrap",
            }}
          >
            {h.selected_text}
          </p>
        ))}
        {rootComments?.map((c) => (
          <InlineEditableComment
            key={c.id}
            comment={c}
            onUpdate={callbacks.onCommentUpdate}
            onDelete={callbacks.onCommentDelete}
          />
        ))}
      </div>
    );
  }

  return <div>{items}</div>;
}

// ── Main all-content markdown viewer ─────────────────────────────────────────

const MarkdownContent = React.memo(function MarkdownContent({
  sections,
  containerRef,
}: {
  sections: Section[];
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div ref={containerRef} className="select-text">
      {sections.map((section) => (
        <div
          key={section.id}
          id={`section-${section.id}`}
          data-section-id={section.id}
          data-section-title={section.title}
          className="pb-8"
        >
          <div className="prose prose-invert prose-slate max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold text-white mt-10 mb-4 pb-3 border-b border-slate-700 scroll-mt-20">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-2xl font-bold text-slate-100 mt-8 mb-3 scroll-mt-20">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xl font-semibold text-slate-200 mt-6 mb-2 scroll-mt-20">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
                ),
                code: ({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) =>
                  inline ? (
                    <code className="bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                  ) : (
                    <code className={`${className} font-mono text-sm`} {...props}>{children}</code>
                  ),
                pre: ({ children }) => (
                  <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 overflow-x-auto text-sm my-4">{children}</pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-indigo-500 pl-4 text-slate-400 italic my-4">{children}</blockquote>
                ),
                ul: ({ children }) => <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-slate-300 space-y-1 mb-4">{children}</ol>,
                li: ({ children }) => <li className="text-slate-300">{children}</li>,
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full border border-slate-700 rounded-xl overflow-hidden">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="bg-slate-800 text-slate-200 px-4 py-2 text-left text-sm font-semibold border-b border-slate-700">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2 text-slate-300 text-sm border-b border-slate-800">{children}</td>
                ),
              }}
            >
              {`${"#".repeat(section.level)} ${section.title}\n\n${section.content}`}
            </ReactMarkdown>
          </div>
          <div className="mt-6 border-b border-slate-800" />
        </div>
      ))}
    </div>
  );
});

export default function MarkdownViewer({
  sections,
  highlights,
  comments,
  filterMode,
  onActiveSection,
  onSelectionChange,
  onHighlight,
  onRemoveHighlight,
  onRecolorHighlight,
  onPartialRemove,
  onCommentUpdate,
  onCommentDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observersRef = useRef<IntersectionObserver[]>([]);

  const { picker, preview, handleColorClick, handleOK, handleRemove } = useHighlightInteraction({
    containerRef,
    highlights,
    sectionId: "",
    onHighlight,
    onRemoveHighlight,
    onRecolorHighlight,
    onPartialRemove,
  });

  // IntersectionObserver for active section tracking
  useEffect(() => {
    observersRef.current.forEach((o) => o.disconnect());
    observersRef.current = [];
    const options = { rootMargin: "-15% 0px -70% 0px", threshold: 0 };
    sections.forEach((section) => {
      const el = document.getElementById(`section-${section.id}`);
      if (!el) return;
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) onActiveSection(section.id);
      }, options);
      obs.observe(el);
      observersRef.current.push(obs);
    });
    return () => observersRef.current.forEach((o) => o.disconnect());
  }, [sections, onActiveSection]);

  // Notify parent of selection (for sidebar etc.) — piggyback on mouseup
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
      const range = selection.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) return;
      const selectedText = selection.toString().trim();
      let sectionId = "";
      let node: Node | null = range.commonAncestorContainer;
      while (node) {
        if (node instanceof HTMLElement) {
          const el = node.closest("[data-section-id]");
          if (el) { sectionId = el.getAttribute("data-section-id") || ""; break; }
        }
        node = node.parentNode;
      }
      onSelectionChange(selectedText, sectionId);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [onSelectionChange]);

  const callbacks: FilterViewCallbacks = {
    onHighlight,
    onRemoveHighlight,
    onRecolorHighlight,
    onPartialRemove,
    onCommentUpdate,
    onCommentDelete,
  };

  return (
    <>
      {filterMode && (
        <HighlightsFilterView
          sections={sections}
          highlights={highlights}
          comments={comments}
          callbacks={callbacks}
        />
      )}
      <div className={filterMode ? "hidden" : ""}>
        <MarkdownContent sections={sections} containerRef={containerRef} />
      </div>

      {!filterMode && picker && (
        <PickerUI
          picker={picker}
          preview={preview}
          onColorClick={handleColorClick}
          onOK={handleOK}
          onRemove={handleRemove}
        />
      )}
    </>
  );
}
