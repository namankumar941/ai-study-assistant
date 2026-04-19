"use client";
import { useState } from "react";
import VoiceButton from "./VoiceButton";

interface Comment {
  id: string;
  section_id: string;
  text: string;
  created_at: string;
}

interface Props {
  sectionId: string;
  sectionTitle: string;
  markdownId: string;
  existingComments: Comment[];
  onClose: () => void;
  onSaved: (comment: Comment) => void;
  onDeleted: (commentId: string) => void;
}

export default function CommentModal({
  sectionId,
  sectionTitle,
  markdownId,
  existingComments,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveComment() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/comments/${markdownId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, text }),
      });
      const comment = await res.json();
      onSaved(comment);
      setText("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteComment(commentId: string) {
    await fetch(`/api/comments/${markdownId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
    onDeleted(commentId);
  }

  const sectionComments = existingComments.filter((c) => c.section_id === sectionId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h3 className="text-white font-semibold">Comments</h3>
            <p className="text-slate-400 text-sm truncate">{sectionTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        {sectionComments.length > 0 && (
          <div className="p-4 space-y-3 max-h-48 overflow-y-auto border-b border-slate-700">
            {sectionComments.map((c) => (
              <div key={c.id} className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                <p className="text-slate-200 text-sm leading-relaxed">{c.text}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-slate-500 text-xs">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-5 space-y-3">
          <div className="flex gap-3 items-start">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your comment or use voice..."
              className="flex-1 bg-slate-900 text-slate-100 rounded-xl p-3 text-sm resize-none border border-slate-600 focus:outline-none focus:border-indigo-500"
              rows={3}
            />
            <VoiceButton onTranscript={(t) => setText((prev) => prev + (prev ? " " : "") + t)} size="sm" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveComment}
              disabled={saving || !text.trim()}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-sm font-medium"
            >
              {saving ? "Saving..." : "Save Comment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
