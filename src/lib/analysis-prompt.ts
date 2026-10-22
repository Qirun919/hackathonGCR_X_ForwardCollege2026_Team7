import type { CodeRole } from "./code-docs";
import type { FileSignal } from "./code-context";

export function buildAnalysisMessages(
  files: { name: string; role: CodeRole; content: string }[],
  projectName: string,
  signals: FileSignal[]
) {
  const system = [
    "You analyze backend source code and return STRUCTURED JSON (not Markdown). Accuracy over completeness.",
    "GROUNDING: derive EVERYTHING from SUPPLIED FILES only. Never reuse method/path/field examples from this prompt.",
    "ENDPOINT RULES:",
    "1. An endpoint exists ONLY if a route registration (router.METHOD(path) / app.METHOD(path)) is in the supplied code. No registration = NO endpoint; describe the code as a component instead.",
    "2. Every heading path MUST contain a resource name. NEVER output bare router-local paths like '/', '/{id}' — combine the mount prefix (app.use('/x')) with the router path, or infer from controller/model filenames and set fullPathKnown=false.",
    "3. status per endpoint: complete = method+full path+request behaviour+validation+responses all evidenced; partial = endpoint identifiable but something missing (list in 'missing'); unknown = cannot establish.",
    "4. Components that are not endpoints (services, models, middleware, utils): list in 'components' with kind, purpose, functions, file. NEVER present a service function as an HTTP endpoint.",
    "5. Service-only input example: for 'export const updateAccountTier = async (accountId, tier) => Account.findByIdAndUpdate(accountId, {tier}, {new:true})' output ZERO endpoints, ONE component {name:'updateAccountTier',kind:'service',...}, missing:['HTTP method and route path — no route registration supplied'], recommendedFiles:['the controller that calls updateAccountTier','the route definition registering that controller','validation middleware for accepted tier values'].",
    "6. Keep strings short (<300 chars), plain, no unescaped quotes/newlines. Arrays max 10 items.",
    "7. Return STRICT JSON ONLY matching this shape:",
    '{"projectName":"...","overview":"...","endpoints":[{"method":"GET|POST|PUT|PATCH|DELETE|UNKNOWN","path":"/full/path","fullPathKnown":true,"purpose":"...","auth":"...","pathParams":["id (string, required)"],"queryParams":[],"bodyFields":["title (required, string, max 200)"],"responses":["200 with updated item"],"errors":["404 if not found"],"sideEffects":[],"dependencies":[],"evidenceFiles":["routes/x.js"],"status":"complete|partial|unknown","missing":[]}],"components":[{"name":"...","kind":"route|controller|service|model|middleware|validation|utility|unknown","purpose":"...","functions":[],"file":"..."}],"relationships":[],"missing":[],"recommendedFiles":[],"limitations":[]}',
  ].join("\n");

  const signalSummary = signals
    .map(
      (s) =>
        `- ${s.name}: detected=${s.detectedKind}, routes=[${s.routeRegs.map((r) => `${r.method} ${r.path}`).join(", ") || "none"}], handlers=[${s.handlers.join(", ") || "none"}], models=[${s.mongooseModels.join(", ") || "none"}], auth=${s.hasAuth ? "yes" : "no"}`
    )
    .join("\n");

  const fileBlocks = files
    .map((f) => `--- FILE: ${f.name} (role: ${f.role}) ---\n${f.content}`)
    .join("\n\n");

  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `Project: ${projectName || "Unknown project"}\n\nDETECTED SIGNALS (heuristic, verify against code):\n${signalSummary}\n\nSUPPLIED FILES (${files.length}):\n${fileBlocks}`,
    },
  ];
}

/** Ask the model to fix JSON that failed schema validation. */
export function buildAnalysisRepairMessages(broken: string, issues: string) {
  return [
    {
      role: "system" as const,
      content: `Fix this JSON so it validates. Issues: ${issues}. Keep all correct data; only repair structure/types. Return ONLY fixed JSON, no fences.`,
    },
    { role: "user" as const, content: broken.slice(0, 12000) },
  ];
}
