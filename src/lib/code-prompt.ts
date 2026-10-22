import type { CodeRole } from "./code-docs";

export function buildDocMessages(files: { name: string; role: CodeRole; content: string }[], projectName: string) {
  const system = [
    "You turn backend source code into COMPACT Markdown API documentation. Accuracy over completeness.",
    "FORMAT (follow exactly — one ## heading per endpoint, 1-3 plain lines each):",
    "# [Project Name] v[version if known]",
    "## [METHOD] [full route path]",
    "[1-2 sentences: what it does. Then compact facts: params, body fields with required/optional + types, status codes, auth, errors.]",
    "## [METHOD] [next path]",
    "[...]",
    "STYLE REFERENCE (shape only — NEVER reuse these paths/fields unless they appear in the supplied code):",
    "Each endpoint line reads like: 'Does X. Body: a (required, string), b (optional, string, YYYY-MM-DD). Returns 201 with created thing. 400 if a missing.'",
    "CRITICAL — GROUNDING (violations cause rejection):",
    "G1. Derive EVERY path, field, and status code from the SUPPLIED FILES section below. The style reference above is NOT source material.",
    "G2. Before writing each endpoint, quote (mentally) the exact code line that proves its path and method. No proof = '## UNKNOWN /resource-from-filename' + flag unknown.",
    "G3. The resource name comes from the supplied filenames and code symbols ONLY (e.g. file 'ordersController.js' = /orders). NEVER from any example.",
    "G4. Single-file input with no endpoints (e.g. only a middleware file, no routes/controllers): if no endpoint registration or handler logic exists in the supplied code, output ONLY the title line plus 'Notes: No endpoints found in supplied code — add route/controller files.' Do NOT document endpoints from other contexts.",
    "CRITICAL PATH RULES:",
    "A. Every ## heading path MUST contain a resource name (e.g. /tasks, /orders/{id}, /api/inventory/{vin}).",
    "B. NEVER output bare router-local paths like '## GET /', '## POST /', '## GET /{id}'. Those are ALWAYS wrong.",
    "C. If the route file shows router.get('/') then the mount prefix comes from how the router is mounted: check app.use('/tasks', router), server.js, app.js, or index files. Combine mount prefix + router path: mount '/tasks' + router '/' = '## GET /tasks'.",
    "D. If NO mount prefix can be found in any supplied file, infer the resource from the controller/model/file names in SUPPLIED FILES and write the full path. Then add to Notes: 'Mount prefix not found in supplied code; paths inferred from supplied filenames — verify.'",
    "E. NEVER copy the user's change-request text into the documentation. Document ONLY what the supplied source code does TODAY, not proposed changes.",
    "RULES:",
    "1. Only document endpoints, fields, status codes, and behaviour DIRECTLY supported by the supplied code.",
    "2. Keep each endpoint to 1-3 short lines. No tables, no sub-headings per endpoint, no bullet lists unless needed for 3+ fields.",
    "3. Body format: 'Body: field (required|optional, type, constraints), ...'. Responses: 'Returns [code] with [shape].' Errors: '404 if not found.' / '401 without token.'",
    "4. If the method cannot be established from the code, use '## UNKNOWN /resource' and flag it unknown in the line. The PATH must still be full.",
    "5. If auth/middleware applies, append one short sentence: 'Requires Bearer token (auth middleware).'",
    "6. After the last endpoint, append at most 5 lines starting with 'Notes:' for verification-needed items only. Omit if nothing is missing.",
    "7. Never invent fields, codes, or logic. Never add placeholder endpoints.",
    "8. Output RAW MARKDOWN ONLY. No fences, no commentary outside the document.",
  ].join("\n");

  const fileBlocks = files
    .map((f) => `--- FILE: ${f.name} (role: ${f.role}) ---\n${f.content}`)
    .join("\n\n");

  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `Project name: ${projectName || "Unknown project"}\n\nGrounding reminder: document ONLY the files below. Ignore any paths/fields from the style reference.\n\nSUPPLIED FILES (${files.length}):\n${fileBlocks}`,
    },
  ];
}
