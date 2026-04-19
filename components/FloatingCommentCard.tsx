"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import VoiceButton from "./VoiceButton";

export interface CommentCardData {
  uid: string;
  id?: string;
  text: string;
  isSaved: boolean;
  position: { x: number; y: number };
}

interface Props {
  card: CommentCardData;
  markdownId: string;
  onUpdate: (uid: string, updates: Partial<CommentCardData>) => void;
  onClose: (uid: string) => void;
  onDelete: (uid: string) => void;
}

const MIN_W = 150;
const MIN_H = 100;
const DEFAULT_W = 300;
const DEFAULT_H = 220;

export default function FloatingCommentCard({ card, markdownId, onUpdate, onClose, onDelete }: Props) {
  const [text, setText] = useState(card.text);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!card.isSaved);
  const [hovered, setHovered] = useState(false);

  const [pos, setPos] = useState(card.position);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const resizing = useRef<{
    edge: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const savePosToDb = useCallback(
    (x: number, y: number) => {
      if (!card.id) return;
      fetch(`/api/comments/${markdownId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: card.id, posX: x, posY: y }),
      });
    },
    [card.id, markdownId]
  );

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      dragOffset.current = {
        x: e.clientX + window.scrollX - pos.x,
        y: e.clientY + window.scrollY - pos.y,
      };
      e.preventDefault();
    },
    [pos]
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent, edge: string) => {
      resizing.current = { edge, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
      e.preventDefault();
      e.stopPropagation();
    },
    [size]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) {
        setPos({
          x: Math.max(0, e.clientX + window.scrollX - dragOffset.current.x),
          y: Math.max(0, e.clientY + window.scrollY - dragOffset.current.y),
        });
      }
      if (resizing.current) {
        const { edge, startX, startY, startW, startH } = resizing.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        setSize((prev) => ({
          w: edge.includes("e") ? Math.max(MIN_W, startW + dx) : prev.w,
          h: edge.includes("s") ? Math.max(MIN_H, startH + dy) : prev.h,
        }));
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (dragging.current) {
        const x = Math.max(0, e.clientX + window.scrollX - dragOffset.current.x);
        const y = Math.max(0, e.clientY + window.scrollY - dragOffset.current.y);
        savePosToDb(x, y);
        onUpdate(card.uid, { position: { x, y } });
      }
      dragging.current = false;
      resizing.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [size.w, card.uid, savePosToDb, onUpdate]);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      if (card.id) {
        await fetch(`/api/comments/${markdownId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId: card.id, text, posX: pos.x, posY: pos.y }),
        });
        onUpdate(card.uid, { text, isSaved: true });
      } else {
        const res = await fetch(`/api/comments/${markdownId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, posX: pos.x, posY: pos.y }),
        });
        const saved = await res.json();
        onUpdate(card.uid, { id: saved.id, text, isSaved: true });
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard() {
    if (card.id) {
      await fetch(`/api/comments/${markdownId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: card.id }),
      });
    }
    onDelete(card.uid);
  }

  const viewMode = card.isSaved && !editing;

  return (
    <div
      className="absolute z-50"
      style={
        viewMode
          ? { left: pos.x, top: pos.y, maxWidth: 300 }
          : { left: pos.x, top: pos.y, width: size.w }
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
    <div
      className="bg-slate-800 border border-amber-600/40 rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={viewMode ? {} : { height: size.h }}
      onMouseDown={onDragStart}
    >
      {/* Close button — editing mode only, stops drag propagation */}
      {!viewMode && (
        <div className="flex justify-end px-2 pt-2 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => onClose(card.uid)}
            className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Body */}
      <div
        className={viewMode ? "p-3 select-text" : "flex-1 overflow-y-auto p-3 min-h-0 select-text"}
        onMouseDown={(e) => { if (editing) e.stopPropagation(); }}
      >
        {editing ? (
          <div className="flex gap-2 items-start h-full">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your note…"
              autoFocus
              className="flex-1 h-full bg-slate-900 text-slate-100 text-sm rounded-xl p-2.5 resize-none border border-slate-600 focus:outline-none focus:border-amber-500"
            />
            <VoiceButton
              onTranscript={(t) => setText((p) => p + (p ? " " : "") + t)}
              size="sm"
            />
          </div>
        ) : (
          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{card.text}</p>
        )}
      </div>

      {/* Footer — always visible when editing, hover-only when saved */}
      {(editing || hovered) && (
        <div
          className="flex gap-2 px-3 py-2 border-t border-slate-700 flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving || !text.trim()}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs rounded-xl font-medium"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={deleteCard}
                className="px-3 py-1.5 text-red-400 hover:text-red-300 border border-red-500/30 text-xs rounded-xl"
              >
                Delete
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => setEditing(true)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700"
              >
                Edit
              </button>
              <button
                onClick={deleteCard}
                className="ml-auto text-red-400 hover:text-red-300 text-xs"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resize handles — only when editing */}
      {editing && (
        <>
          <div
            className="absolute top-8 right-0 w-1.5 cursor-ew-resize hover:bg-amber-500/30 transition-colors"
            style={{ bottom: 8 }}
            onMouseDown={(e) => onResizeStart(e, "e")}
          />
          <div
            className="absolute bottom-0 left-8 h-1.5 cursor-ns-resize hover:bg-amber-500/30 transition-colors"
            style={{ right: 8 }}
            onMouseDown={(e) => onResizeStart(e, "s")}
          />
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center"
            onMouseDown={(e) => onResizeStart(e, "es")}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-amber-600/50">
              <path d="M0 8 L8 0 M4 8 L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
