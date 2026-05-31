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
  highlightId?: string;          // exact-match highlight (recolor/remove whole thing)
  containingHighlightId?: string; // highlight that CONTAINS the selection (partial remove)
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
  onActiveSection: (id: string) => void;
  onSelectionChange: (text: string, sectionId: string) => void;
  onHighlight: (text: string, sectionId: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
  onRecolorHighlight: (id: string, color: string) => void;
  onPartialRemove: (highlightId: string, textToRemove: string) => void;
}

// Memoized so it never re-renders when picker/preview state changes — keeps the
// browser's text selection alive while the color picker is open.
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
  onActiveSection,
  onSelectionChange,
  onHighlight,
  onRemoveHighlight,
  onRecolorHighlight,
  onPartialRemove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observersRef = useRef<IntersectionObserver[]>([]);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [preview, setPreview] = useState<PreviewHighlight | null>(null);

  // Keep refs so event handlers always read fresh values without stale closures
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  // ── IntersectionObserver ───────────────────────────────────────────────────
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

  // ── Saved highlights — full re-apply whenever highlights list changes ──────
  // normalize() is safe here because this only runs after OK/Remove (no active selection)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    unwrapAll(container);
    container.normalize();
    for (const h of highlights) {
      applySpans(container, h.selected_text, h.color, h.id);
    }
  }, [highlights]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview — lightweight update, no normalize so selection is preserved ───
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll("span[data-hid='__preview__']").forEach(unwrapSpan);

    if (!preview) return;

    if (preview.highlightId) {
      // Recolor: just swap CSS — no DOM restructuring, selection unaffected
      container.querySelectorAll(`span[data-hid="${preview.highlightId}"]`).forEach((s) => {
        (s as HTMLElement).style.textDecorationColor = preview.color;
      });
      return;
    }

    // New text preview: surroundContents splits text nodes and breaks the browser
    // selection range. Save whether there was a selection, apply spans, then
    // rebuild the selection to cover the newly created preview spans.
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

  // ── DOM helpers ────────────────────────────────────────────────────────────
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

    // Build a global text map across all (non-highlighted) text nodes
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

    // Collect every segment to wrap (handles cross-element selections)
    type Item = { node: Text; localStart: number; localEnd: number };
    const toWrap: Item[] = [];
    let idx = fullText.indexOf(text);
    while (idx !== -1) {
      const matchEnd = idx + text.length;
      for (const { node: t, start } of entries) {
        const nodeEnd = start + t.data.length;
        if (start >= matchEnd || nodeEnd <= idx) continue;
        const localStart = Math.max(0, idx - start);
        const localEnd = Math.min(t.data.length, matchEnd - start);
        if (localStart < localEnd) toWrap.push({ node: t, localStart, localEnd });
      }
      idx = fullText.indexOf(text, matchEnd);
    }

    // Reverse so later offsets are processed first — keeps earlier indices valid
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

  // ── Click on an existing underline span → open recolor/remove picker ───────
  useEffect(() => {
    const handleMarkClick = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // selection picker takes priority

      const span = (e.target as HTMLElement).closest("span[data-hid]") as HTMLElement | null;
      if (!span || span.getAttribute("data-hid") === "__preview__") return;

      const rect = span.getBoundingClientRect();
      const hid = span.getAttribute("data-hid") || undefined;
      setPicker({ x: rect.left + rect.width / 2, y: rect.top, text: span.textContent || "", sectionId: "", highlightId: hid });
      setPreview(null);
    };
    document.addEventListener("click", handleMarkClick);
    return () => document.removeEventListener("click", handleMarkClick);
  }, []);

  // ── Text selection → open color picker ────────────────────────────────────
  useEffect(() => {
    const handleMouseUp = (e: Event) => {
      // Ignore mouseup inside the picker (e.g. releasing after clicking a color swatch)
      if (document.getElementById("hl-picker")?.contains(e.target as Node)) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (containerRef.current && !containerRef.current.contains(range.commonAncestorContainer)) return;

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

      // Exact match → recolor/remove whole highlight
      const exact = highlightsRef.current.find((h) => h.selected_text === selectedText);
      // Partial match → selected text is a subset of an existing highlight
      const containing = !exact
        ? highlightsRef.current.find((h) => h.selected_text.includes(selectedText) && h.selected_text !== selectedText)
        : undefined;

      const rect = range.getBoundingClientRect();
      setPicker({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text: selectedText,
        sectionId,
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
  }, [onSelectionChange]);

  // ── Dismiss picker on outside click ───────────────────────────────────────
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

  // ── Picker actions ─────────────────────────────────────────────────────────
  function handleColorClick(color: string) {
    if (!picker) return;
    setPreview({ text: picker.text, color, highlightId: picker.highlightId });
  }

  function handleOK() {
    if (!picker || !preview) return;
    const { text, sectionId, highlightId } = picker;
    const { color } = preview;
    setPicker(null);
    setPreview(null);
    window.getSelection()?.removeAllRanges();
    if (highlightId) {
      onRecolorHighlight(highlightId, color);
    } else {
      onHighlight(text, sectionId, color);
    }
  }

  const pickerX = picker ? Math.min(Math.max(picker.x, 140), window.innerWidth - 140) : 0;
  const above = picker ? picker.y > 80 : false;
  const pickerY = picker ? (above ? picker.y - 62 : picker.y + 30) : 0;

  return (
    <>
      <MarkdownContent sections={sections} containerRef={containerRef} />

      {picker && (
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
              // Use onMouseDown so we can preventDefault (keeps selection) and
              // still trigger the action — click is not needed here.
              onMouseDown={(e) => { e.preventDefault(); handleColorClick(value); }}
              className="w-6 h-6 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{
                backgroundColor: value,
                outline: preview?.color === value ? "2px solid white" : "2px solid transparent",
                outlineOffset: "2px",
              }}
            />
          ))}

          {/* Custom color — preventDefault keeps selection; click still opens native picker */}
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
              onChange={(e) => handleColorClick(e.target.value)}
            />
          </label>

          {/* OK — normal onClick so click fires normally; selection cleared inside handleOK */}
          {preview && (
            <>
              <div className="w-px h-5 bg-slate-600 mx-0.5" />
              <button
                onClick={handleOK}
                className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                OK
              </button>
            </>
          )}

          {/* Remove — full remove for exact match, partial remove for subset selection */}
          {(picker.highlightId || picker.containingHighlightId) && (
            <>
              {!preview && <div className="w-px h-5 bg-slate-600 mx-0.5" />}
              <button
                onClick={() => {
                  if (picker.highlightId) {
                    onRemoveHighlight(picker.highlightId);
                  } else if (picker.containingHighlightId) {
                    onPartialRemove(picker.containingHighlightId, picker.text);
                  }
                  setPreview(null);
                  setPicker(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded-lg transition-colors"
              >
                {picker.containingHighlightId ? "Remove here" : "Remove"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
