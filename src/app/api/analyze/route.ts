import { NextResponse } from "next/server";
import { analyzeRequestSchema, reportSchema, type Report } from "@/lib/schema";
import { truncateDocs, truncateChange } from "@/lib/truncate";
import { buildMessages } from "@/lib/prompt";
import { callAi, parseJsonLenient, repairJson, mockReport } from "@/lib/ai-client";

/** Parse one AI response leniently, then self-repair via the model if needed. */
async function parseReport(raw: string): Promise<Report> {
  const attempts: unknown[] = [];
  try {
    attempts.push(parseJsonLenient(raw));
  } catch {
    // handled below
  }
  if (attempts.length === 0) {
    const repaired = await repairJson(raw);
    attempts.push(parseJsonLenient(repaired));
  }
  const first = reportSchema.safeParse(attempts[0]);
  if (first.success) return first.data;
  // Sanitise partial output: keep only valid entries so one bad item
  // doesn't discard the whole report.
  const loose = attempts[0] as Record<string, unknown>;
  const sanitised = {
    impactSummary: typeof loose?.impactSummary === "string" ? loose.impactSummary : "",
    affectedEndpoints: Array.isArray(loose?.affectedEndpoints) ? loose.affectedEndpoints : [],
    risks: Array.isArray(loose?.risks) ? loose.risks : [],
    openQuestions: Array.isArray(loose?.openQuestions) ? loose.openQuestions : [],
    testCases: Array.isArray(loose?.testCases) ? loose.testCases : [],
  };
  const second = reportSchema.safeParse(sanitised);
  if (second.success) return second.data;
  throw new Error(`AI output failed validation: ${second.error.issues[0]?.message ?? "unknown"}`);
}

/** Merge findings with identical titles; keep all linked endpoints. */
function dedupeFindings(report: Report): void {
  const seen = new Map<string, number>();
  const merged: Report["risks"] = [];
  for (const r of report.risks) {
    const key = r.title.trim().toLowerCase();
    const idx = seen.get(key);
    if (idx === undefined) {
      seen.set(key, merged.length);
      merged.push({ ...r, affectedEndpoints: [...r.affectedEndpoints] });
    } else {
      const target = merged[idx];
      for (const ep of r.affectedEndpoints) {
        if (!target.affectedEndpoints.includes(ep)) target.affectedEndpoints.push(ep);
      }
      if (r.severity === "breaking") target.severity = "breaking";
      else if (r.severity === "major" && target.severity === "minor") target.severity = "major";
    }
  }
  report.risks = merged;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const rawDocs = parsed.data.apiDocs;
  const rawChange = parsed.data.changeRequest;

  // --- Guardrail 1: reject non-API text (prose, essays, random paste).
  // Accepts both plain "GET /tasks" and Markdown "## GET /tasks" / "### GET /tasks"
  // headings (the latter is what the code-to-docs generator emits).
  // Normalizes smart quotes/dashes first so pasted docs with fancy
  // punctuation don't fail matching. ---
  const normalizedDocs = rawDocs
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-");
  const endpointLike = normalizedDocs.match(/^#{0,3}\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s]*)\s*$/gim) ?? [];
  const pathLike = normalizedDocs.match(/\/[a-zA-Z0-9_{}-]+(?:\/[a-zA-Z0-9_{}.-]+)+/g) ?? [];
  if (endpointLike.length === 0 && pathLike.length < 2) {
    return NextResponse.json(
      {
        error:
          "This doesn't look like API documentation — no endpoints or paths detected. Paste docs containing lines like 'GET /tasks' or paths like '/accounts/{id}'.",
      },
      { status: 400 }
    );
  }

  // --- Guardrail 2: reject prompt-injection / instruction-override attempts. ---
  // Anchored to instruction phrasing so normal code/docs mentioning
  // passwords or keys do NOT trigger.
  const INJECTION = /(ignore (all )?previous instructions|you are now an? (ai|assistant|system|developer|root|admin)|disregard (all )?(prior|previous) (instructions|prompt)|jailbreak|do anything now|forget (all |your )?instructions|new instructions:|reveal (the |your )?(system prompt|api key|secret key)|output (the |your )?system prompt|bypass (all |your )?safety|disable (all |your )?(safety|guardrails|filters))/i;
  if (INJECTION.test(rawDocs) || INJECTION.test(rawChange)) {
    return NextResponse.json(
      { error: "Input looks like an instruction override and was blocked. Describe the API change plainly instead." },
      { status: 400 }
    );
  }

  // --- Guardrail 3: reject secret-looking material (keys, tokens). ---
  const SECRET = /(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|xox[bpas]-[A-Za-z0-9-]+|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16})/;
  if (SECRET.test(rawDocs) || SECRET.test(rawChange)) {
    return NextResponse.json(
      { error: "Input appears to contain a secret (API key/token). Remove secrets before analysing." },
      { status: 400 }
    );
  }

  // --- Guardrail 4: reject unrelated requests — the change description must
  // describe an API/product change, not homework, essays, or general chat. ---
  if (endpointLike.length > 0 || pathLike.length >= 2) {
    const OFF_TOPIC = /(write (me |an? )?(an? )?(essay|poem|story|cover letter|resume)|solve (this|my)|homework|exam answer|translate (this|the)|summar(y|ise) (this|the)|what is the (capital|meaning|history)|who (is|was)|tell me a joke|write code for (a |my )?(game|website|homework)|math problem|calculate \d)/i;
    const API_WORDS = /(endpoint|api|field|schema|request|response|status ?code|header|payload|param|query|method|route|version|deprecat|migrat|backward|breaking|validation|json|rest|http|get|post|put|patch|delete|auth|token|client|server|database|deploy|release|feature|change|update|add|remove|rename|require|optional|format|type|enum|default|error|test|regression|impact|affect)/i;
    const changeAlpha = rawChange.replace(/[^a-zA-Z ]/g, " ").trim().split(/\s+/).filter(Boolean);
    const hasApiWord = API_WORDS.test(rawChange);
    if (OFF_TOPIC.test(rawChange) || (changeAlpha.length >= 12 && !hasApiWord)) {
      return NextResponse.json(
        {
          error:
            "This doesn't look like an API change request. Describe what is changing in the API (endpoints, fields, formats, validation, behaviour) — e.g. 'Add a required priority field to POST /tasks'.",
        },
        { status: 400 }
      );
    }
  }

  const { text: docs, truncated: docsTruncated } = truncateDocs(normalizedDocs);
  const { text: change, truncated: changeTruncated } = truncateChange(rawChange);

  try {
    const raw = await callAi({ messages: buildMessages(docs, change) });
    const report = await parseReport(raw);
    dedupeFindings(report);

    // Post-check: downgrade endpoints with no textual evidence in the docs.
    for (const ep of report.affectedEndpoints) {
      if (!docs.includes(ep.path)) {
        ep.confidence = "low";
        ep.reason = `[UNVERIFIED PATH — not found in docs] ${ep.reason}`;
      }
      if (ep.evidence && !docs.includes(ep.evidence.slice(0, 24))) {
        const risk = {
          title: `Unverified evidence for ${ep.method} ${ep.path}`,
          severity: "minor" as const,
          type: "inferred" as const,
          summary: "Evidence quote not found verbatim in docs; treat as unverified.",
          detail: "The quoted evidence snippet was not found verbatim in the supplied docs; treat as inferred.",
          affectedEndpoints: [`${ep.method} ${ep.path}`],
          evidence: "",
        };
        report.risks.push(risk);
      }
    }

    return NextResponse.json({
      report,
      meta: {
        model: process.env.META_MODEL ?? "muse-1.3-gcr",
        mock: false,
        truncated: docsTruncated || changeTruncated,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    // One retry on transient failure.
    if (!message.includes("400")) {
      try {
        const raw = await callAi({ messages: buildMessages(docs, change) });
        const report = await parseReport(raw);
        dedupeFindings(report);
        return NextResponse.json({
          report,
          meta: { model: process.env.META_MODEL ?? "muse-1.3-gcr", mock: false, truncated: docsTruncated || changeTruncated, retried: true },
        });
      } catch {
        // fall through to 502
      }
    }
    console.error("analyze failed:", message);
    return NextResponse.json(
      { error: `Analysis failed: ${message}`, fallbackAvailable: true, mockReport: mockReport() },
      { status: 502 }
    );
  }
}
