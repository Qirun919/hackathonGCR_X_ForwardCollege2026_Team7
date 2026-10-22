import type { Report } from "./schema";

export function buildCodingPromptMessages(report: Report, changeDescription: string) {
  const system = [
    "You convert an API change-impact workflow into a ready-to-use prompt for an AI vibe-coding agent (Cursor, Claude Code, Copilot, etc.).",
    "RULES:",
    "1. Use ONLY information from the supplied workflow. Never fabricate file paths, code, endpoints, requirements, or decisions.",
    "2. If a section has no supporting workflow data, omit it or mark it as unknown — never invent.",
    "3. Preserve risks, assumptions, and unresolved questions verbatim in spirit. Never turn uncertain items into confirmed requirements.",
    "4. Tests are PROPOSED, not executed. State that explicitly.",
    "5. Keep it actionable and concise. Markdown format with the sections below (omit empty ones).",
    "REQUIRED SECTIONS (when data exists):",
    "## Project Context — purpose of the change.",
    "## Implementation Objective — what the agent must implement.",
    "## Affected Endpoints and Components — endpoints/services/models from the workflow.",
    "## Implementation Requirements — numbered coding steps derived from findings.",
    "## Business Rules and Constraints — validation, compatibility, dependencies.",
    "## Testing Requirements — proposed regression tests with expected results (label unexecuted).",
    "## Important Warnings and Unresolved Questions — risks + open questions, preserved.",
    "## Coding Agent Instructions — ALWAYS include: inspect project structure first; follow existing architecture/naming/style; reuse existing components; no unrelated refactoring or UI churn; never invent API behaviour; ask when a critical requirement is unknown; list files changed with a summary; report tests run vs unverified; never claim unexecuted tests passed.",
    "Output RAW MARKDOWN ONLY. No fences, no commentary outside the prompt.",
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `PROPOSED CHANGE:\n${changeDescription}\n\nWORKFLOW (JSON):\n${JSON.stringify(report).slice(0, 12000)}`,
    },
  ];
}
