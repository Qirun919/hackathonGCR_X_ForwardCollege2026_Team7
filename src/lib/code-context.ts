import type { CodeRole } from "./code-docs";

export type DetectedKind =
  | "route"
  | "controller"
  | "service"
  | "model"
  | "middleware"
  | "validation"
  | "utility"
  | "unknown";

export type FileSignal = {
  name: string;
  declaredRole: CodeRole;
  detectedKind: DetectedKind;
  routeRegs: { method: string; path: string }[];
  handlers: string[];
  mongooseModels: string[];
  requires: string[];
  hasAuth: boolean;
};

const ROUTE_RE = /\b(router|app)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
// Fallback: short router aliases (r.get, api.post...). Only trusted when the
// file is Express-flavoured (requires express / Router / app.use).
const ROUTE_ALIAS_RE = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const EXPRESS_FLAVOUR_RE = /express|Router\(|app\.use\(|Router\./;
const HANDLER_RE = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(req|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(req|module\.exports\s*\.\s*([A-Za-z_$][\w$]*)\s*=|exports\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g;
const MODEL_RE = /mongoose\.model\s*\(\s*['"`]([^'"`]+)['"`]/g;
const REQUIRE_RE = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|from\s+['"`]([^'"`]+)['"`]/g;
const AUTH_RE = /jwt\.verify|passport|Bearer|authorization/i;
const VALIDATION_RE = /express-validator|Joi\.|celebrate|zod|class-validator|\.isString\(\)|\.isMongoId\(\)|\.notEmpty\(\)/;
const SERVICE_RE = /module\.exports\s*=\s*\{|export\s+(const|async\s+function|function)/;
const CONTROLLER_RE = /req\.(params|body|query)|res\.(status|json|send|end)/;
const MODEL_DEF_RE = /new\s+mongoose\.Schema|mongoose\.Schema\s*\(|Sequelize|DataTypes|@Entity/;

export function detectKind(name: string, content: string, declared: CodeRole): DetectedKind {
  const lower = name.toLowerCase();
  ROUTE_RE.lastIndex = 0;
  if (/route|router/.test(lower) || ROUTE_RE.test(content)) return "route";
  ROUTE_RE.lastIndex = 0;
  if (ROUTE_ALIAS_RE && EXPRESS_FLAVOUR_RE.test(content)) {
    ROUTE_ALIAS_RE.lastIndex = 0;
    if (ROUTE_ALIAS_RE.test(content)) return "route";
    ROUTE_ALIAS_RE.lastIndex = 0;
  }
  if (/controller/.test(lower) || (CONTROLLER_RE.test(content) && /find|create|update|delete|save/i.test(content))) return "controller";
  if (/\.model\.|schema|models?\//.test(lower) || MODEL_DEF_RE.test(content)) return "model";
  if (/middleware|auth|guard|interceptor/.test(lower) || (/next\s*\(\s*\)/.test(content) && AUTH_RE.test(content))) return "middleware";
  if (/valid|schema\.js|dto/.test(lower) || VALIDATION_RE.test(content)) return "validation";
  if (/service/.test(lower) || (SERVICE_RE.test(content) && !CONTROLLER_RE.test(content))) return "service";
  if (/util|helper|lib\//.test(lower)) return "utility";
  if (declared !== "other") {
    if (declared === "route" || declared === "controller" || declared === "service" || declared === "model" || declared === "middleware") return declared;
    return "unknown";
  }
  return "unknown";
}

export function analyzeFiles(files: { name: string; role: CodeRole; content: string }[]): FileSignal[] {
  return files.map((f) => {
    const routeRegs: FileSignal["routeRegs"] = [];
    ROUTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROUTE_RE.exec(f.content)) !== null) {
      routeRegs.push({ method: m[2].toUpperCase(), path: m[3] });
    }
    // Alias fallback for `r.get(...)`-style routers.
    if (routeRegs.length === 0 && EXPRESS_FLAVOUR_RE.test(f.content)) {
      ROUTE_ALIAS_RE.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = ROUTE_ALIAS_RE.exec(f.content)) !== null) {
        if (/^(console|Math|JSON|Object|res|req|module)$/.test(a[1])) continue;
        routeRegs.push({ method: a[2].toUpperCase(), path: a[3] });
      }
    }
    const handlers: string[] = [];
    let h: RegExpExecArray | null;
    const hr = new RegExp(HANDLER_RE.source, "g");
    while ((h = hr.exec(f.content)) !== null) handlers.push(h[1] ?? h[2] ?? h[3] ?? h[4]);
    const mongooseModels: string[] = [];
    let mo: RegExpExecArray | null;
    const mr = new RegExp(MODEL_RE.source, "g");
    while ((mo = mr.exec(f.content)) !== null) mongooseModels.push(mo[1]);
    const requires: string[] = [];
    let r: RegExpExecArray | null;
    const rr = new RegExp(REQUIRE_RE.source, "g");
    while ((r = rr.exec(f.content)) !== null) requires.push(r[1] ?? r[2]);
    return {
      name: f.name,
      declaredRole: f.role,
      detectedKind: detectKind(f.name, f.content, f.role),
      routeRegs,
      handlers: [...new Set(handlers)],
      mongooseModels: [...new Set(mongooseModels)],
      requires: [...new Set(requires)],
      hasAuth: AUTH_RE.test(f.content),
    };
  });
}

/** Names referenced but not supplied — drives "recommended next files". */
export function missingRequires(signals: FileSignal[], suppliedNames: string[]): string[] {
  const supplied = new Set(suppliedNames.map((n) => n.toLowerCase()));
  const missing = new Set<string>();
  for (const s of signals) {
    for (const req of s.requires) {
      const base = req.split("/").pop()?.replace(/\.(js|ts)$/, "").toLowerCase() ?? "";
      if (!base || base === "express" || base.startsWith("express-")) continue;
      if (base === "mongoose" || base === "jsonwebtoken" || base === "joi" || base === "zod") continue;
      const found = [...supplied].some((n) => n.includes(base));
      if (!found && base.length > 2) missing.add(req);
    }
  }
  return [...missing].slice(0, 10);
}

export type CompletenessGate =
  | { ok: true; completeInput: boolean }
  | { ok: false; reason: string; missing: string[]; recommended: string[] };

export type HandlerUse = { handler: string; file: string; route: string };

// Handler references inside route files: controller.fn (not require().X).
// Bare fn refs as extra route args are handled separately below.
const HANDLER_DOT_RE = /\b(?:controller|ctrl|handlers?|actions?|c|svc|service)\s*\.\s*([A-Za-z_$][\w$]*)/g;

export function handlerUses(routeContent: string, routeFile: string, routePath: string): HandlerUse[] {
  const uses: HandlerUse[] = [];
  HANDLER_DOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HANDLER_DOT_RE.exec(routeContent)) !== null) {
    const name = m[1];
    if (name && !/^(auth|validate|upload|cache|rateLimit)$/i.test(name)) {
      uses.push({ handler: name, file: routeFile, route: routePath });
    }
  }
  // Bare handler refs: router.METHOD(path, <name>) and (path, [mw,] <name>).
  // Skip the object prefix (router/app/r/...) by requiring the match to sit
  // after the path string's closing quote — scan per registration instead.
  const REG_WITH_ARGS =
    /\b[A-Za-z_$][\w$]*\s*\.\s*(?:get|post|put|patch|delete|head|options)\s*\(\s*['"`][^'"`]+['"`]\s*,([^;]*?)\)\s*;/gi;
  REG_WITH_ARGS.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = REG_WITH_ARGS.exec(routeContent)) !== null) {
    const args = r[1].split(",");
    for (const a of args) {
      const t = a.trim().replace(/^(?:async\s+)?/, "");
      const bm = t.match(/^([A-Za-z_$][\w$]*)(?:\s*\.\s*([A-Za-z_$][\w$]*))?$/);
      if (!bm) continue;
      const name = bm[2] ?? bm[1];
      // Skip middleware-ish names and the router object itself.
      if (/^(auth|validate.*|upload|cache|rateLimit|param|body|query|check)$/i.test(name)) continue;
      if (!bm[2] && /^(router|app|r|api|routerAuth)$/i.test(name)) continue;
      if (name && !/^(Router|express)$/.test(name)) {
        uses.push({ handler: name, file: routeFile, route: routePath });
      }
    }
  }
  return uses;
}

/**
 * Strict evidence-based completeness gate. Blocks generation unless the
 * supplied code supports accurate endpoint documentation. Fail closed.
 * - Example A (service only): no route evidence → block, ask for route+controller.
 * - Example B (controller, no routes): no method+path evidence → block, ask for routes.
 * - Example C (missing service/validation imports): block if the missing piece
 *   is essential (controller/service/validation/model); warn-only for the rest.
 */
export function completenessGate(
  signals: FileSignal[],
  rawFiles: { name: string; content: string }[]
): CompletenessGate {
  const kinds = new Set(signals.map((s) => s.detectedKind));
  const hasRoute = kinds.has("route");
  const hasController = kinds.has("controller");
  const hasService = kinds.has("service") || kinds.has("utility") || kinds.has("validation");
  const hasModel = kinds.has("model");
  const hasMiddlewareOnly =
    signals.length > 0 &&
    signals.every((s) => s.detectedKind === "middleware" || s.detectedKind === "unknown");

  const byName = new Map(rawFiles.map((f) => [f.name, f.content]));
  const suppliedHandlers = new Set(signals.flatMap((s) => s.handlers));

  const missing: string[] = [];
  const recommended: string[] = [];

  // Collect every handler referenced by every route registration.
  const dangling: HandlerUse[] = [];
  for (const s of signals) {
    if (s.detectedKind !== "route") continue;
    const content = byName.get(s.name) ?? "";
    for (const reg of s.routeRegs) {
      for (const use of handlerUses(content, s.name, `${reg.method} ${reg.path}`)) {
        if (!suppliedHandlers.has(use.handler)) dangling.push(use);
      }
    }
  }

  // Case 1: nothing analyzable — middleware/unknown only.
  if (hasMiddlewareOnly && !hasController && !hasService && !hasModel && !hasRoute) {
    return {
      ok: false,
      reason: "Only middleware/unclassified files supplied — no routes, controllers, services, or models found.",
      missing: ["route definitions", "request handlers (controllers or services)"],
      recommended: ["route file registering your endpoints", "controller implementing request handling"],
    };
  }

  // Case A: service/model only — HTTP method, path, and request/response
  // behaviour cannot be established. Block (no component-docs bypass).
  if (!hasRoute && !hasController && (hasService || hasModel)) {
    return {
      ok: false,
      reason:
        "Service/model logic found, but no route definition or controller — HTTP method, URL path, and request/response behaviour cannot be established.",
      missing: ["registered HTTP method and URL path", "HTTP request/response behaviour"],
      recommended: [
        "the controller that calls your service function(s)",
        "the route definition that registers that controller",
        "relevant validation middleware, if it determines accepted request values",
      ],
    };
  }

  // Case B: controller(s) but no route file — method+path unknown. Block.
  if (!hasRoute && hasController) {
    return {
      ok: false,
      reason:
        "Controller code found, but no route registration — the HTTP method and URL path cannot be established from the supplied code.",
      missing: ["registered HTTP method and URL path for controller handler(s)"],
      recommended: ["the route definition file that registers your controller(s)"],
    };
  }

  // Case 2: routes exist but reference handlers not supplied. Block.
  if (dangling.length > 0) {
    const names = [...new Set(dangling.map((d) => `'${d.handler}' (used in ${d.file} for ${d.route})`))].slice(0, 5);
    return {
      ok: false,
      reason: `Route file(s) reference handler(s) not present in the submission — endpoint behaviour cannot be documented accurately.`,
      missing: [`handler implementation(s): ${names.join(", ")}`],
      recommended: [
        "the controller file(s) implementing the referenced handler(s)",
        "any service/model files those handlers depend on",
      ],
    };
  }

  // Case C: essential imports missing (service/model/validation required by
  // supplied controllers or routes). Block; non-essential unmet imports stay warnings.
  const ESSENTIAL_RE = /service|model|schema|valid|dto|middleware|auth|guard/i;
  const unmetEssential: string[] = [];
  {
    const supplied = new Set(rawFiles.map((f) => f.name.toLowerCase()));
    for (const s of signals) {
      for (const req of s.requires) {
        const base = req.split("/").pop()?.replace(/\.(js|ts)$/, "").toLowerCase() ?? "";
        if (!base || base === "express" || base.startsWith("express-")) continue;
        if (["mongoose", "jsonwebtoken", "joi", "zod", "express-validator"].includes(base)) continue;
        const found = [...supplied].some((n) => n.includes(base));
        if (!found && base.length > 2 && ESSENTIAL_RE.test(req)) unmetEssential.push(req);
      }
    }
  }
  if (unmetEssential.length > 0) {
    const uniq = [...new Set(unmetEssential)].slice(0, 5);
    return {
      ok: false,
      reason: `Essential dependenc${uniq.length > 1 ? "ies" : "y"} referenced but not supplied — endpoint behaviour cannot be fully established.`,
      missing: uniq.map((r) => `dependency '${r}'`),
      recommended: uniq.map((r) => `the file providing '${r}' (service, model, or validation logic)`),
    };
  }

  // Case 3: route file present but zero registrations parsed (empty/malformed router).
  if (hasRoute && signals.every((s) => s.routeRegs.length === 0)) {
    return {
      ok: false,
      reason: "Route file(s) supplied, but no route registrations (router.METHOD(path)) could be parsed.",
      missing: ["parseable route registrations with HTTP method and path"],
      recommended: ["a route file with Express registrations like router.get('/items', controller.list)"],
    };
  }

  if (missing.length === 0) {
    return { ok: true, completeInput: hasRoute && (hasController || hasService) };
  }
  return {
    ok: false,
    reason: `Incomplete context: ${missing.join("; ")}.`,
    missing,
    recommended,
  };
}
