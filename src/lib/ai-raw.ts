/**
 * Raw-text variant of the AI caller (no JSON mode) for Markdown generation.
 * Key stays server-side. Reasoning model needs a generous token budget.
 */
export async function callAiRaw(opts: {
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const baseUrl = process.env.META_BASE_URL ?? "http://47.84.184.85:4000/v1";
  const model = process.env.META_MODEL ?? "muse-1.3-gcr";
  const apiKey = process.env.META_API_KEY ?? "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 8000,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("AI returned empty content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
