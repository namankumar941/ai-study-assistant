import { NextRequest, NextResponse } from "next/server";
import { callLLM, Message } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, context, mode } = body as {
      messages: Message[];
      context?: string;
      mode?: "qa" | "comment" | "quiz_score";
    };

    let systemPrompt = "You are a helpful study assistant. Be concise and clear.";

    if (mode === "qa" && context) {
      systemPrompt = `You are a helpful study assistant. The user is studying the following text and has a question about it. Answer clearly and concisely based on the context provided. If asked a follow-up, maintain conversation continuity.

CONTEXT:
${context}`;
    } else if (mode === "quiz_score") {
      systemPrompt = `You are an interview preparation evaluator. Compare the user's answer with the correct answer and provide:
1. A score from 1-10
2. What they got right
3. What they missed or could improve
4. Key points they should remember

Be encouraging but honest. Format your response clearly.`;
    }

    const fullMessages: Message[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const response = await callLLM(fullMessages);
    return NextResponse.json({ response });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "LLM request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
