export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  messages: Message[],
  apiKey?: string,
  onToken?: (t: string) => void
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 16384, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error (${res.status}): ${err}`);
  }

  // Stream SSE to avoid undici's 5-minute body timeout on slow thinking models
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices[0]?.delta?.content ?? "";
        if (token) {
          fullContent += token;
          onToken?.(token);
        }
      } catch {
        // incomplete chunk, skip
      }
    }
  }

  return stripThinkTags(fullContent);
}

async function callAnthropic(messages: Message[], onToken?: (t: string) => void): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 8192,
      stream: !!onToken,
      system: systemMsg?.content,
      messages: rest,
    }),
  });

  if (!res.ok) throw new Error(`Anthropic error (${res.status}): ${await res.text()}`);

  if (!onToken) {
    const data = await res.json();
    return data.content[0].text;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          const token = parsed.delta.text ?? "";
          if (token) { fullContent += token; onToken(token); }
        }
      } catch { /* skip */ }
    }
  }

  return fullContent;
}

async function callGemini(messages: Message[], onToken?: (t: string) => void): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const contents = rest.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const endpoint = onToken ? "streamGenerateContent" : "generateContent";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:${endpoint}?key=${process.env.GEMINI_API_KEY}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) throw new Error(`Gemini error (${res.status}): ${await res.text()}`);

  if (!onToken) {
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6).trim());
        const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (token) { fullContent += token; onToken(token); }
      } catch { /* skip */ }
    }
  }

  return fullContent;
}

export async function callLLM(messages: Message[]): Promise<string> {
  return callLLMStream(messages);
}

export async function callLLMStream(
  messages: Message[],
  onToken?: (t: string) => void
): Promise<string> {
  const provider = process.env.LLM_PROVIDER || "llamacpp";

  switch (provider) {
    case "llamacpp":
      return callOpenAICompatible(
        process.env.LLAMACPP_BASE_URL || "http://localhost:8080",
        process.env.LLAMACPP_MODEL || "qwen3.5:9b",
        messages,
        undefined,
        onToken
      );
    case "anthropic":
      return callAnthropic(messages, onToken);
    case "openai":
      return callOpenAICompatible(
        "https://api.openai.com",
        process.env.OPENAI_MODEL || "gpt-4o",
        messages,
        process.env.OPENAI_API_KEY,
        onToken
      );
    case "gemini":
      return callGemini(messages, onToken);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
