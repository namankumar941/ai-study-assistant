import { NextRequest } from "next/server";
import { callLLMStream } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const { plan, message } = await req.json();
  if (!plan || !message?.trim()) {
    return new Response(JSON.stringify({ error: "plan and message required" }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        await callLLMStream(
          [
            {
              role: "system",
              content: `You are a curriculum designer. Given an existing course plan and a modification request, return the updated plan as valid JSON only — no markdown, no explanation, no code fences.

Format:
{
  "title": "concise course title",
  "summary": "2-3 sentence overview of what will be covered and why",
  "topics": ["Topic 1", "Topic 2", ...]
}

Rules:
- Keep however many topics are needed — let the subject scope determine the count
- Each topic name should be specific and self-contained (3-6 words max)
- Apply the requested changes while keeping the course coherent
- Return ONLY the JSON object, nothing else`,
            },
            {
              role: "user",
              content: `Current plan:
${JSON.stringify(plan, null, 2)}

User request: ${message}

Return the updated plan as JSON:`,
            },
          ],
          (token) => send({ token })
        );
        send({ done: true });
      } catch (err) {
        send({ error: String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
