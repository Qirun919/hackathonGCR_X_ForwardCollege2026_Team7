import type { Report } from "./schema";

/**
 * Call the hackathon AI proxy (OpenAI-compatible chat completions).
 * Reasoning model: needs a generous max_tokens budget since reasoning
 * tokens count toward the limit.
 */
export async function callAi(rawContent: {
  messages: { role: string; content: string }[];
}): Promise<string> {
  const baseUrl = process.env.META_BASE_URL ?? "http://47.84.184.85:4000/v1";
  const model = process.env.META_MODEL ?? "muse-1.3-gcr";
  const apiKey = process.env.META_API_KEY ?? "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: rawContent.messages,
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
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

/** Strip markdown fences if the model wraps JSON anyway. */
export function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : content).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in AI output");
  return candidate.slice(start, end + 1);
}

/**
 * Lenient JSON parse: strips control chars, trailing commas, stray fences.
 * Throws the original SyntaxError if nothing works.
 */
export function parseJsonLenient(text: string): unknown {
  const cleaned = extractJson(text)
    // strip ASCII control chars that commonly sneak into model output
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    // remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (first) {
    // Last resort: cut at the last complete `}` / `]` boundary we can parse.
    let end = cleaned.lastIndexOf("}");
    while (end > 0) {
      const attempt = cleaned.slice(0, end + 1).replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(attempt);
      } catch {
        end = cleaned.lastIndexOf("}", end - 1);
      }
    }
    throw first;
  }
}

/**
 * Ask the model to repair its own malformed JSON output.
 * Returns the repaired string (still needs parse + schema validation).
 */
export async function repairJson(broken: string): Promise<string> {
  const baseUrl = process.env.META_BASE_URL ?? "http://47.84.184.85:4000/v1";
  const model = process.env.META_MODEL ?? "muse-1.3-gcr";
  const apiKey = process.env.META_API_KEY ?? "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Fix this broken JSON so it parses. Return ONLY the fixed JSON, no fences, no commentary. Keep every field and value; only repair syntax (quotes, commas, brackets).",
          },
          { role: "user", content: broken.slice(0, 12000) },
        ],
        temperature: 0,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`repair request failed (${res.status})`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") throw new Error("repair returned empty content");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/** Demo fallback shown when live AI fails; clearly labelled as mock. */
export function mockReport(): Report {
  return {
    impactSummary:
      "Switching dueDate to ISO-8601 with strict 400 rejection is a breaking change for every client that reads or writes tasks, and the new required priority field breaks existing create/update calls that omit it.",
    affectedEndpoints: [
      {
        method: "POST",
        path: "/tasks",
        reason: "New required 'priority' field changes request validation; old clients omitting it will fail.",
        confidence: "high",
        evidence: "POST /tasks — creates a task with title, dueDate (DD-MM-YYYY).",
      },
      {
        method: "PUT",
        path: "/tasks/{id}",
        reason: "Update path shares the same schema, so date-format change applies here too.",
        confidence: "high",
        evidence: "PUT /tasks/{id} — updates title and dueDate (DD-MM-YYYY).",
      },
      {
        method: "GET",
        path: "/tasks",
        reason: "Response now includes 'priority' and ISO-8601 dates; consumers parsing DD-MM-YYYY will break.",
        confidence: "medium",
        evidence: "GET /tasks — returns list with dueDate in DD-MM-YYYY.",
      },
    ],
    risks: [
      {
        title: "Date-format change breaks all task I/O",
        severity: "breaking",
        type: "documented",
        summary: "Every endpoint reading or writing dueDate switches format; old values are rejected with 400.",
        detail: "GET, POST and PUT share the dueDate format, so clients on DD-MM-YYYY fail on both reads and writes after rollout.",
        affectedEndpoints: ["GET /tasks", "POST /tasks", "PUT /tasks/{id}"],
        evidence: "dueDate (string, DD-MM-YYYY)",
      },
      {
        title: "Required priority breaks existing clients",
        severity: "breaking",
        type: "documented",
        summary: "Create/update calls omitting priority will fail unless a default is defined.",
        detail: "Stored tasks also lack a priority value, so list responses and sorting are inconsistent until migrated.",
        affectedEndpoints: ["POST /tasks", "PUT /tasks/{id}", "GET /tasks"],
        evidence: "Body: title (required), dueDate (optional, DD-MM-YYYY)",
      },
      {
        title: "Unknown migration for stored dates",
        severity: "major",
        type: "inferred",
        summary: "No migration rule is documented for existing DD-MM-YYYY values.",
        detail: "Without a documented backfill, old rows may fail validation or return mixed formats.",
        affectedEndpoints: ["GET /tasks", "GET /tasks/{id}"],
        evidence: "",
      },
    ],
    openQuestions: [
      "What is the default priority for existing tasks?",
      "Should the API accept legacy DD-MM-YYYY during a deprecation window?",
      "Which timezone applies to ISO-8601 dueDate values?",
    ],
    testCases: [
      {
        id: "TC-1",
        title: "Reject legacy date format with 400",
        priority: "P0",
        summary: "POST with DD-MM-YYYY date is rejected with a 400 mentioning ISO-8601.",
        preconditions: "API running with new validation",
        steps: ["POST /tasks with dueDate '31-12-2026'", "Observe response"],
        expected: "400 with clear validation error mentioning ISO-8601",
        covers: "POST /tasks",
        rationale: "Core breaking change: old format must be rejected explicitly.",
      },
      {
        id: "TC-2",
        title: "Require priority on create",
        priority: "P0",
        summary: "POST without priority fails with 400 unless a default is documented.",
        preconditions: "None",
        steps: ["POST /tasks without priority field", "Observe response"],
        expected: "400 missing-field error, or documented default applied",
        covers: "POST /tasks",
        rationale: "New field changes the request contract.",
      },
      {
        id: "TC-3",
        title: "ISO date round-trip on update",
        priority: "P1",
        summary: "PUT with an ISO date persists and reads back identically.",
        preconditions: "Existing task id=1",
        steps: ["PUT /tasks/1 with dueDate '2026-12-31T00:00:00Z'", "GET /tasks/1"],
        expected: "Updated task returns identical ISO date",
        covers: "PUT /tasks/{id}",
        rationale: "Update path shares validation with create.",
      },
      {
        id: "TC-4",
        title: "List includes priority field",
        priority: "P1",
        summary: "Every item in GET /tasks carries a priority value.",
        preconditions: "Tasks exist",
        steps: ["GET /tasks", "Inspect each item"],
        expected: "Every item contains a priority value",
        covers: "GET /tasks",
        rationale: "Response shape change affects all consumers.",
      },
      {
        id: "TC-5",
        title: "Invalid priority value rejected",
        priority: "P2",
        summary: "Unknown priority values are rejected with a 400 listing allowed values.",
        preconditions: "None",
        steps: ["POST /tasks with priority 'urgent-xyz'", "Observe response"],
        expected: "400 validation error listing allowed values",
        covers: "POST /tasks",
        rationale: "Edge case: enum validation for the new field.",
      },
    ],
  };
}
