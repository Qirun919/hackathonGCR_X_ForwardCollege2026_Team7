import { z } from "zod";

export const endpointStatusSchema = z.enum(["complete", "partial", "unknown"]);

const endpointSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "UNKNOWN"]),
  path: z.string().min(1).max(200),
  fullPathKnown: z.boolean().default(true),
  purpose: z.string().max(500).default(""),
  auth: z.string().max(300).default(""),
  pathParams: z.array(z.string().max(120)).default([]),
  queryParams: z.array(z.string().max(120)).default([]),
  bodyFields: z.array(z.string().max(200)).default([]),
  responses: z.array(z.string().max(200)).default([]),
  errors: z.array(z.string().max(200)).default([]),
  sideEffects: z.array(z.string().max(200)).default([]),
  dependencies: z.array(z.string().max(120)).default([]),
  evidenceFiles: z.array(z.string().max(200)).default([]),
  status: endpointStatusSchema.default("partial"),
  missing: z.array(z.string().max(200)).default([]),
});

const componentSchema = z.object({
  name: z.string().max(200),
  kind: z.enum(["route", "controller", "service", "model", "middleware", "validation", "utility", "unknown"]),
  purpose: z.string().max(500).default(""),
  functions: z.array(z.string().max(120)).default([]),
  file: z.string().max(200),
});

export const analysisSchema = z.object({
  projectName: z.string().max(120).default(""),
  overview: z.string().max(1000).default(""),
  endpoints: z.array(endpointSchema).max(30).default([]),
  components: z.array(componentSchema).max(30).default([]),
  relationships: z.array(z.string().max(300)).max(15).default([]),
  missing: z.array(z.string().max(300)).max(15).default([]),
  recommendedFiles: z.array(z.string().max(200)).max(10).default([]),
  limitations: z.array(z.string().max(300)).max(10).default([]),
});

export type CodeAnalysis = z.infer<typeof analysisSchema>;
export type AnalyzedEndpoint = CodeAnalysis["endpoints"][number];
export type AnalyzedComponent = CodeAnalysis["components"][number];
