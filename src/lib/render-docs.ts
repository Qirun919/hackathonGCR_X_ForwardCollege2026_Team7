import type { CodeAnalysis } from "./analysis-schema";
import type { FileSignal } from "./code-context";

function lines(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "None identified in supplied code.";
}

/**
 * Deterministic renderer: Markdown is built from validated JSON only.
 * The AI never writes Markdown, so it cannot leak example paths.
 * Contract with the Workflow Generator (analyzer):
 * - Endpoint headings are EXACTLY `### METHOD /path` (no extra words).
 * - Component entries are NOT headings (bold text), so they can never be
 *   mistaken for endpoints by the downstream parser.
 * - ASCII-only output (no smart quotes/dashes) to avoid encoding issues.
 */
function ascii(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...");
}

export function renderMarkdown(analysis: CodeAnalysis, signals: FileSignal[]): string {
  const name = analysis.projectName || "Backend API";
  const out: string[] = [`# API Documentation - ${ascii(name)}`, ""];

  out.push("## 1. Overview", "");
  out.push(ascii(analysis.overview) || "Purpose unclear from supplied code.", "");

  out.push("## 2. Source Coverage and Completeness", "");
  const complete = analysis.endpoints.filter((e) => e.status === "complete").length;
  const partial = analysis.endpoints.filter((e) => e.status === "partial").length;
  out.push(`- Supplied files: ${signals.length}`);
  for (const s of signals) out.push(`  - ${s.name} (detected: ${s.detectedKind})`);
  out.push(`- Endpoints: ${analysis.endpoints.length} (${complete} complete, ${partial} partially documented)`);
  out.push(`- Components without endpoint: ${analysis.components.length}`);
  if (analysis.limitations.length > 0) {
    out.push("- Major limitations:");
    for (const l of analysis.limitations) out.push(`  - ${ascii(l)}`);
  }
  out.push("");

  out.push("## 3. API Endpoints", "");
  if (analysis.endpoints.length === 0) {
    out.push("No endpoints could be established from the supplied code. See Internal Components below.", "");
  }
  for (const e of analysis.endpoints) {
    out.push(`### ${e.method} ${e.path}`, "");
    out.push(`Purpose: ${ascii(e.purpose) || "Unknown."}`, "");
    out.push(`Authentication and Authorization: ${ascii(e.auth) || "Not specified in supplied code."}`, "");
    out.push("Path Parameters:", lines(e.pathParams.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Query Parameters:", lines(e.queryParams.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Request Body:", lines(e.bodyFields.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Responses:", lines(e.responses.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Validation and Error Handling:", lines(e.errors.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Business Logic and Side Effects:", lines(e.sideEffects.map((p) => `\`${ascii(p)}\``)), "");
    out.push("Dependencies:", lines(e.dependencies.map((p) => `\`${ascii(p)}\``)), "");
    out.push(`Documentation Status: ${e.status}${e.missing.length > 0 ? ` - unresolved: ${ascii(e.missing.join("; "))}` : ""}`, "");
    out.push(`Evidence / Source Files: ${e.evidenceFiles.length > 0 ? e.evidenceFiles.join(", ") : "Not established."}`, "");
  }

  out.push("## 4. Internal Components", "");
  if (analysis.components.length === 0) {
    out.push("None - all supplied code maps to endpoints above.", "");
  }
  // NOTE: bold text, NOT ### headings — component entries must never match
  // the endpoint-heading pattern the Workflow Generator parses.
  for (const c of analysis.components) {
    out.push(`**${c.name}** (${c.kind})`, "");
    out.push(`Purpose: ${ascii(c.purpose) || "Unknown."}`);
    if (c.functions.length > 0) out.push(`Functions: ${c.functions.map((f) => `\`${f}\``).join(", ")}`);
    out.push(`File: ${c.file}`, "");
  }

  out.push("## 5. Cross-Endpoint Relationships", "");
  out.push(lines(analysis.relationships.map(ascii)), "");

  out.push("## 6. Missing Information and Verification Required", "");
  out.push(lines(analysis.missing.map(ascii)), "");
  if (analysis.recommendedFiles.length > 0) {
    out.push("Recommended next files:", lines(analysis.recommendedFiles.map((f) => `\`${ascii(f)}\``)), "");
  }

  out.push("## 7. Analysis Limitations", "");
  out.push(lines(analysis.limitations.map(ascii)), "");

  return out.join("\n");
}
