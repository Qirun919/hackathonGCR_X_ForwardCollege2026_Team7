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
const HANDLER_RE = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(req|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(req/g;
const MODEL_RE = /mongoose\.model\s*\(\s*['"`]([^'"`]+)['"`]/g;
const REQUIRE_RE = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|from\s+['"`]([^'"`]+)['"`]/g;
const AUTH_RE = /jwt\.verify|passport|Bearer|authorization/i;
const VALIDATION_RE = /express-validator|Joi\.|celebrate|zod|class-validator|\.isString\(\)|\.isMongoId\(\)|\.notEmpty\(\)/;
const SERVICE_RE = /module\.exports\s*=\s*\{|export\s+(const|async\s+function|function)/;
const CONTROLLER_RE = /req\.(params|body|query)|res\.(status|json|send|end)/;
const MODEL_DEF_RE = /new\s+mongoose\.Schema|mongoose\.Schema\s*\(|Sequelize|DataTypes|@Entity/;

export function detectKind(name: string, content: string, declared: CodeRole): DetectedKind {
  const lower = name.toLowerCase();
  if (/route|router/.test(lower) || ROUTE_RE.test(content)) return "route";
  ROUTE_RE.lastIndex = 0;
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
    const handlers: string[] = [];
    let h: RegExpExecArray | null;
    const hr = new RegExp(HANDLER_RE.source, "g");
    while ((h = hr.exec(f.content)) !== null) handlers.push(h[1] ?? h[2]);
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
