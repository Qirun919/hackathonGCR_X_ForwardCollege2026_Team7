import { z } from "zod";

const confidenceSchema = z.enum(["high", "medium", "low"]);
const prioritySchema = z.enum(["P0", "P1", "P2"]);

export const affectedEndpointSchema = z.object({
  method: z.string().min(1).max(12),
  path: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
  confidence: confidenceSchema,
  evidence: z.string().min(1).max(1000),
});

export const riskSchema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(500),
  evidence: z.string().max(1000).default(""),
  type: z.enum(["documented", "inferred"]),
  // New optional fields — defaulted so older AI outputs still validate.
  severity: z.enum(["breaking", "major", "minor"]).default("major"),
  summary: z.string().max(300).default(""),
  affectedEndpoints: z.array(z.string().max(60)).max(10).default([]),
});

export const testCaseSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  priority: prioritySchema,
  preconditions: z.string().max(500).default(""),
  steps: z.array(z.string().min(1).max(500)).min(1).max(10),
  expected: z.string().min(1).max(1000),
  covers: z.string().min(1).max(200),
  rationale: z.string().min(1).max(1000),
  // Optional short one-liner for the collapsed test view.
  summary: z.string().max(300).default(""),
});

export const reportSchema = z.object({
  affectedEndpoints: z.array(affectedEndpointSchema).min(1).max(20),
  risks: z.array(riskSchema).min(1).max(15),
  openQuestions: z.array(z.string().min(1).max(500)).min(1).max(15),
  testCases: z.array(testCaseSchema).min(1).max(15),
  // Optional model-written headline; UI falls back to generated text.
  impactSummary: z.string().max(600).default(""),
});

export const analyzeRequestSchema = z.object({
  apiDocs: z
    .string()
    .trim()
    .min(20, "API documentation is too short — paste at least a few lines describing your endpoints.")
    .max(60000, "API documentation is too large (max 60,000 chars). Try uploading a smaller excerpt."),
  changeRequest: z
    .string()
    .trim()
    .min(10, "Change description is too short — describe what is changing.")
    .max(10000, "Change description is too large (max 10,000 chars)."),
});

export type Report = z.infer<typeof reportSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type Finding = Report["risks"][number];
