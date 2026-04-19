"use client";
import { useState } from "react";
import { HeadingNode } from "@/lib/markdown";

interface Props {
  headings: HeadingNode[];
  progress: Record<string, boolean>;
  activeId: string;
  onNavigate: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
}

function NavNode({
  node,
  progress,
  activeId,
  onNavigate,
  onToggleDone,
  depth,
}: {
  node: HeadingNode;
  progress: Record<string, boolean>;
  activeId: string;
  onNavigate: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isActive = activeId === node.id;
  const isDone = !!progress[node.id];
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`flex items-center gap-1.5 rounded-lg py-1.5 pr-2 group transition-colors ${
          isActive ? "bg-indigo-600/20" : "hover:bg-slate-700/50"
        }`}
        style={{ paddingLeft: `${(depth + 1) * 10}px` }}
      >
        {/* Collapse toggle */}
        {hasChildren ? (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 hover:text-slate-200 flex items-center justify-center transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-2.5 h-2.5 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => onToggleDone(node.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 flex-shrink-0 accent-green-500 cursor-pointer"
          title={isDone ? "Mark as not done" : "Mark as done"}
        />

        {/* Label */}
        <button
          onClick={() => onNavigate(node.id)}
          className={`flex-1 text-left text-xs leading-snug truncate transition-colors ${
            isActive
              ? "text-indigo-300 font-semibold"
              : isDone
              ? "text-slate-500 line-through"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {node.title}
        </button>
      </div>

      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((child) => (
            <NavNode
              key={child.id}
              node={child}
              progress={progress}
              activeId={activeId}
              onNavigate={onNavigate}
              onToggleDone={onToggleDone}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Navigation({ headings, progress, activeId, onNavigate, onToggleDone }: Props) {
  return (
    <nav>
      <ul className="space-y-0.5">
        {headings.map((node) => (
          <NavNode
            key={node.id}
            node={node}
            progress={progress}
            activeId={activeId}
            onNavigate={onNavigate}
            onToggleDone={onToggleDone}
            depth={0}
          />
        ))}
      </ul>
    </nav>
  );
}
