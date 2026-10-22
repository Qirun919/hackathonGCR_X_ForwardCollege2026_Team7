import { z } from "zod";

export const codeFileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.enum(["route", "controller", "service", "model", "middleware", "other"]),
  content: z.string().min(1).max(20000),
});

export const generateDocsSchema = z.object({
  projectName: z.string().max(120).default(""),
  files: z.array(codeFileSchema).min(1, "Add at least one source file.").max(8, "Max 8 files per request."),
});
