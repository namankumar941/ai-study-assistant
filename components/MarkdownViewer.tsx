"use client";
import { useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Section } from "@/lib/markdown";

interface Props {
  sections: Section[];
  onActiveSection: (id: string) => void;
  onSelectionChange: (text: string, sectionId: string) => void;
}

export default function MarkdownViewer({ sections, onActiveSection, onSelectionChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observersRef = useRef<IntersectionObserver[]>([]);

  // Track active section via IntersectionObserver
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

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);

    // Find which section the selection is in
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
  }, [onSelectionChange]);

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} className="select-text">
      {sections.map((section) => {
        return (
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
                    <h1 className="text-3xl font-bold text-white mt-10 mb-4 pb-3 border-b border-slate-700 scroll-mt-20">
                      {children}
                    </h1>
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
                      <code className="bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className={`${className} font-mono text-sm`} {...props}>{children}</code>
                    ),
                  pre: ({ children }) => (
                    <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 overflow-x-auto text-sm my-4">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-indigo-500 pl-4 text-slate-400 italic my-4">
                      {children}
                    </blockquote>
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
                    <th className="bg-slate-800 text-slate-200 px-4 py-2 text-left text-sm font-semibold border-b border-slate-700">
                      {children}
                    </th>
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
        );
      })}
    </div>
  );
}
