export const MAX_DOCS_CHARS = 9000;
export const MAX_CHANGE_CHARS = 2500;

const ENDPOINT_LINE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|\/[a-zA-Z0-9_{}\-:./]+/;

/**
 * Truncate long docs while keeping endpoint-like lines so the AI
 * still sees method/path evidence even when input is cut.
 */
export function truncateDocs(docs: string, max = MAX_DOCS_CHARS): { text: string; truncated: boolean } {
  const text = docs.trim();
  if (text.length <= max) return { text, truncated: false };
  const lines = text.split("\n");
  const kept: string[] = [];
  let budget = max;
  // First pass: keep endpoint-like lines.
  for (const line of lines) {
    if (ENDPOINT_LINE.test(line) && line.length + 1 <= budget) {
      kept.push(line);
      budget -= line.length + 1;
    }
  }
  // Second pass: fill remaining budget from the top.
  for (const line of lines) {
    if (kept.includes(line)) continue;
    if (line.length + 1 > budget) break;
    kept.push(line);
    budget -= line.length + 1;
  }
  return { text: kept.join("\n").slice(0, max), truncated: true };
}

export function truncateChange(change: string, max = MAX_CHANGE_CHARS): { text: string; truncated: boolean } {
  const text = change.trim();
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}
