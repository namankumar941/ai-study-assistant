import { NextRequest } from "next/server";
import db from "@/lib/db";
import { callLLMStream } from "@/lib/llm";

interface GenerationPlan {
  title: string;
  summary: string;
  topics: string[];
}

interface MarkdownRow {
  id: string;
  content: string;
  status: string;
  generation_plan: string | null;
}

function countCompletedTopics(content: string, topics: string[]): number {
  // Count how many ## headings matching topic names already exist in content
  let count = 0;
  for (const topic of topics) {
    if (content.includes(`## ${topic}`)) count++;
  }
  return count;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const row = db
    .prepare("SELECT id, content, status, generation_plan FROM markdowns WHERE id = ?")
    .get(params.id) as MarkdownRow | undefined;

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  // If already complete, send a done event immediately
  if (row.status === "ready") {
    const body = `data: ${JSON.stringify({ type: "done" })}\n\n`;
    return new Response(body, {
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
          // client disconnected
        }
      };

      // Figure out which topics are already done (resume support)
      const currentRow = db
        .prepare("SELECT content FROM markdowns WHERE id = ?")
        .get(params.id) as { content: string } | undefined;
      const currentContent = currentRow?.content ?? row.content;
      const startFrom = countCompletedTopics(currentContent, topics);

      let accumulatedContent = currentContent;

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

        // Append completed topic to markdown content in DB
        accumulatedContent += `\n\n${topicContent.trim()}`;
        db.prepare("UPDATE markdowns SET content = ? WHERE id = ?").run(
          accumulatedContent,
          params.id
        );

        send({ type: "topic_done", topic, index: i });
      }

      // Mark as ready
      db.prepare("UPDATE markdowns SET status = 'ready' WHERE id = ?").run(params.id);
      send({ type: "done" });
      controller.close();
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
