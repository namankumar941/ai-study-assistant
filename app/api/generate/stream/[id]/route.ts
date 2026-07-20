import { NextRequest } from "next/server";
import db from "@/lib/db";
import { callLLMStream } from "@/lib/llm";
import { countCompletedTopics, GenerationPlan } from "@/lib/course-generator";

interface MarkdownRow {
  id: string;
  content: string;
  status: string;
  generation_plan: string | null;
}

// Module-level lock — only one SSE connection runs the generator at a time.
// Subsequent reconnects enter monitor mode and poll the DB.
const activeGenerations = new Set<string>();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const row = db
    .prepare("SELECT id, content, status, generation_plan FROM markdowns WHERE id = ?")
    .get(params.id) as MarkdownRow | undefined;

  if (!row) return new Response("Not found", { status: 404 });

  if (row.status === "ready") {
    return new Response(`data: ${JSON.stringify({ type: "done" })}\n\n`, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  if (!row.generation_plan) {
    return new Response("No generation plan found", { status: 400 });
  }

  const plan: GenerationPlan = JSON.parse(row.generation_plan);
  const { title, summary, topics } = plan;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected — generation continues below regardless
        }
      };

      // Send already-completed topics so the reconnecting client can catch up
      const freshRow = db
        .prepare("SELECT content FROM markdowns WHERE id = ?")
        .get(params.id) as { content: string } | undefined;
      const currentContent = freshRow?.content ?? row.content;
      const startFrom = countCompletedTopics(currentContent, topics);

      for (let i = 0; i < startFrom; i++) {
        send({ type: "topic_done", topic: topics[i], index: i, total: topics.length });
      }

      if (activeGenerations.has(params.id)) {
        // ── Monitor mode ─────────────────────────────────────────────────────
        // Another SSE connection is already running the generator.
        // Poll the DB and forward topic_done events until it finishes.
        let lastKnown = startFrom;
        while (!req.signal?.aborted) {
          await new Promise<void>((r) => setTimeout(r, 1500));

          const poll = db
            .prepare("SELECT content, status FROM markdowns WHERE id = ?")
            .get(params.id) as { content: string; status: string } | undefined;
          if (!poll) break;

          const nowDone = countCompletedTopics(poll.content, topics);
          while (lastKnown < nowDone) {
            send({
              type: "topic_done",
              topic: topics[lastKnown],
              index: lastKnown,
              total: topics.length,
            });
            lastKnown++;
          }

          if (poll.status === "ready") {
            send({ type: "done" });
            break;
          }
        }
      } else {
        // ── Generator mode ───────────────────────────────────────────────────
        // This SSE connection owns the generation loop.
        // It runs to completion even if the client disconnects — send() catches
        // the controller errors, and callLLMStream has no abort signal, so the
        // network requests to the LLM continue uninterrupted.
        activeGenerations.add(params.id);
        let accumulatedContent = currentContent;

        try {
          for (let i = startFrom; i < topics.length; i++) {
            const topic = topics[i];
            const completedTitles = topics.slice(0, i);

            send({ type: "topic_start", topic, index: i, total: topics.length });

            const previousContext =
              completedTitles.length === 0
                ? "This is the first topic."
                : `Previously covered: ${completedTitles.join(", ")}.`;

            const messages = [
              {
                role: "system" as const,
                content: `You are an expert educational content writer creating a comprehensive study guide.

Course: "${title}"
Course Overview: ${summary}

${previousContext}

Write a detailed, well-structured markdown section for the topic: "${topic}"

Requirements:
- Start with exactly "## ${topic}" as the heading (no other text before it)
- Include thorough explanations with practical examples
- Use code blocks, bullet lists, or tables where helpful
- Connect concepts to the overall course context
- Assume the reader has studied the previous topics
- Write 300-600 words of rich educational content
- Do NOT re-state the course title or repeat previous topics' content`,
              },
              {
                role: "user" as const,
                content: `Write the section for: ${topic}`,
              },
            ];

            let topicContent = "";
            try {
              await callLLMStream(messages, (token) => {
                topicContent += token;
                send({ type: "token", topic, index: i, content: token });
              });
            } catch (err) {
              send({ type: "error", topic, index: i, message: String(err) });
              continue;
            }

            accumulatedContent += `\n\n${topicContent.trim()}`;
            db.prepare("UPDATE markdowns SET content = ? WHERE id = ?").run(
              accumulatedContent,
              params.id
            );
            send({ type: "topic_done", topic, index: i });
          }

          db.prepare("UPDATE markdowns SET status = 'ready' WHERE id = ?").run(params.id);
          send({ type: "done" });
        } finally {
          activeGenerations.delete(params.id);
        }
      }

      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
