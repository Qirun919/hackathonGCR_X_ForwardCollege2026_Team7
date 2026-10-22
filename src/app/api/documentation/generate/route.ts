import { NextResponse } from "next/server";
import { generateDocsSchema } from "@/lib/doc-schema";
import { MAX_TOTAL_CHARS } from "@/lib/code-docs";
import { analyzeFiles, missingRequires } from "@/lib/code-context";
import { buildAnalysisMessages, buildAnalysisRepairMessages } from "@/lib/analysis-prompt";
import { analysisSchema, type CodeAnalysis } from "@/lib/analysis-schema";
import { renderMarkdown } from "@/lib/render-docs";
import { callAiRaw } from "@/lib/ai-raw";
import { parseJsonLenient } from "@/lib/ai-client";

/** Run the two-pass pipeline: structured JSON analysis → deterministic Markdown. */
async function analyzeCode(
  files: { name: string; role: string; content: string }[],
  projectName: string,
  signals: ReturnType<typeof analyzeFiles>
): Promise<CodeAnalysis> {
  const callOnce = async () => {
    const raw = await callAiRaw({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: buildAnalysisMessages(files as any, projectName, signals),
      maxTokens: 8000,
      temperature: 0.2,
      jsonMode: true,
      timeoutMs: 90000,
    });
    return parseJsonLenient(raw);
  };

  const first = analysisSchema.safeParse(await callOnce());
  if (first.success) return first.data;

  // Self-repair: ask the model to fix schema violations, then re-validate.
  const issues = first.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  const repaired = await callAiRaw({
    messages: buildAnalysisRepairMessages(JSON.stringify(first.error), issues),
    maxTokens: 8000,
    temperature: 0,
    jsonMode: true,
    timeoutMs: 60000,
  });
  const second = analysisSchema.safeParse(parseJsonLenient(repaired));
  if (second.success) return second.data;
  throw new Error(`AI analysis failed validation: ${issues}`);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = generateDocsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { files, projectName } = parsed.data;

  // Size guardrail.
  const total = files.reduce((n, f) => n + f.content.length, 0);
  if (total > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: `Source code too large (${total} chars, max ${MAX_TOTAL_CHARS}). Remove files or trim to the relevant routes/controllers.` },
      { status: 400 }
    );
  }

  // Secret guardrail — don't send keys to the AI.
  const SECRET = /(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|xox[bpas]-[A-Za-z0-9-]+|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|mongodb(\+srv)?:\/\/[^\s"']+)/i;
  const withSecret = files.filter((f) => SECRET.test(f.content)).map((f) => f.name);
  if (withSecret.length > 0) {
    return NextResponse.json(
      { error: `These files look like they contain secrets (keys, tokens, connection strings): ${withSecret.join(", ")}. Remove them before generating.` },
      { status: 400 }
    );
  }

  // --- Guardrail A: duplicate filenames / conflicting definitions. ---
  const seenNames = new Map<string, number>();
  for (const f of files) {
    const key = f.name.toLowerCase();
    seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
  }
  const dupes = [...seenNames.entries()].filter(([, n]) => n > 1).map(([n]) => n);
  if (dupes.length > 0) {
    return NextResponse.json(
      { error: `Duplicate filenames: ${dupes.join(", ")}. Rename or remove duplicates — conflicting definitions can't be resolved automatically.` },
      { status: 400 }
    );
  }
  // Same handler name defined in two different controllers = conflict the AI must not silently pick.
  const handlerOwners = new Map<string, Set<string>>();
  for (const f of files) {
    const matches = f.content.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(req|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(req/g);
    for (const m of matches) {
      const name = m[1] ?? m[2];
      if (!handlerOwners.has(name)) handlerOwners.set(name, new Set());
      handlerOwners.get(name)!.add(f.name);
    }
  }
  const conflicts = [...handlerOwners.entries()].filter(([, owners]) => owners.size > 1);
  const conflictNote = conflicts.length > 0
    ? conflicts.map(([h, owners]) => `Handler '${h}' defined in ${[...owners].join(" and ")} — documented from first occurrence; verify which one is wired.`).slice(0, 5)
    : [];

  // --- Guardrail B: prompt-injection / instruction override in code or names. ---
  // Source is DATA, never instructions: block override attempts, including in comments.
  const INJECTION = /(ignore (all )?previous instructions|system prompt|you are now|disregard (all )?(prior|previous)|jailbreak|do anything now|forget (all |your )?instructions|new instructions:|return .*password|reveal .*(key|prompt|secret)|output .*system)/i;
  const injected = files.filter((f) => INJECTION.test(f.content) || INJECTION.test(f.name)).map((f) => f.name);
  if (injected.length > 0) {
    return NextResponse.json(
      { error: `Blocked instruction-override text in: ${injected.join(", ")}. Source code is treated as data, not instructions — remove the override attempt.` },
      { status: 400 }
    );
  }

  // --- Guardrail C: non-code submissions (prose, essays, JSON blobs, minified dumps). ---
  const CODE_SIGNS = /(require\s*\(|import\s+.*from|module\.exports|export\s+(default|const|function|class)|function\s+\w+\s*\(|=>|mongoose\.|express\s*\(|router\.(get|post|put|patch|delete)|console\.log)/;
  const nonCode = files
    .filter((f) => {
      const sample = f.content.slice(0, 3000);
      // Skip the code test for tiny stubs; the min-length schema handles those.
      if (sample.trim().length < 60) return false;
      return !CODE_SIGNS.test(sample);
    })
    .map((f) => f.name);
  if (nonCode.length > 0) {
    return NextResponse.json(
      { error: `These don't look like source code: ${nonCode.join(", ")}. Paste .js/.ts backend files (routes, controllers, services, models).` },
      { status: 400 }
    );
  }

  // --- Guardrail D: non-JS/TS uploads the analyzer can't parse. ---
  const BAD_EXT = /\.(exe|dll|so|bin|zip|tar|gz|rar|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|mp4|mov)$/i;
  const badExt = files.filter((f) => BAD_EXT.test(f.name)).map((f) => f.name);
  if (badExt.length > 0) {
    return NextResponse.json(
      { error: `Unsupported file types: ${badExt.join(", ")}. Upload .js/.ts source files only.` },
      { status: 400 }
    );
  }

  // --- Pass 0 (deterministic, no AI): classify files, detect route registrations. ---
  const signals = analyzeFiles(files);
  const suppliedNames = files.map((f) => f.name);
  const unmetRequires = missingRequires(signals, suppliedNames);

  try {
    // --- Pass 1 (AI): structured analysis JSON, validated. ---
    const analysis = await analyzeCode(files, projectName || "Unknown project", signals);

    // --- Pass 2 (deterministic): render Markdown from validated JSON. ---
    const markdown = renderMarkdown(analysis, signals);

    // Completeness report for the UI.
    const endpoints = analysis.endpoints;
    const completeness = {
      detectedComponents: signals.map((s) => ({ file: s.name, kind: s.detectedKind })),
      totalEndpoints: endpoints.length,
      complete: endpoints.filter((e) => e.status === "complete").map((e) => `${e.method} ${e.path}`),
      partial: endpoints
        .filter((e) => e.status === "partial")
        .map((e) => ({ endpoint: `${e.method} ${e.path}`, missing: e.missing })),
      componentOnly: analysis.components.map((c) => `${c.name} (${c.kind}, ${c.file})`),
      missing: analysis.missing,
      recommendedFiles: [...new Set([...analysis.recommendedFiles, ...unmetRequires.map((r) => `missing import: ${r}`)])].slice(0, 10),
    };

    const warnings = [
      ...unmetRequires.map((r) => `Referenced but not supplied: ${r} — add the file for complete docs.`),
      ...conflictNote,
    ];
    if (unmetRequires.length === 0 && analysis.recommendedFiles.length > 0) {
      warnings.push("Some details need more context — see completeness report for recommended files.");
    }

    return NextResponse.json({
      markdown,
      warnings,
      completeness,
      meta: { files: files.length, chars: total },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    if (!message.includes("400")) {
      try {
        const signals2 = analyzeFiles(files);
        const analysis = await analyzeCode(files, projectName || "Unknown project", signals2);
        const markdown = renderMarkdown(analysis, signals2);
        const endpoints = analysis.endpoints;
        return NextResponse.json({
          markdown,
          warnings: unmetRequires.map((r) => `Referenced but not supplied: ${r}.`),
          completeness: {
            detectedComponents: signals2.map((s) => ({ file: s.name, kind: s.detectedKind })),
            totalEndpoints: endpoints.length,
            complete: endpoints.filter((e) => e.status === "complete").map((e) => `${e.method} ${e.path}`),
            partial: endpoints.filter((e) => e.status === "partial").map((e) => ({ endpoint: `${e.method} ${e.path}`, missing: e.missing })),
            componentOnly: analysis.components.map((c) => `${c.name} (${c.kind}, ${c.file})`),
            missing: analysis.missing,
            recommendedFiles: analysis.recommendedFiles,
          },
          meta: { files: files.length, chars: total, retried: true },
        });
      } catch {
        // fall through to 502
      }
    }
    console.error("doc generation failed:", message);
    return NextResponse.json({ error: `Documentation generation failed: ${message}` }, { status: 502 });
  }
}
