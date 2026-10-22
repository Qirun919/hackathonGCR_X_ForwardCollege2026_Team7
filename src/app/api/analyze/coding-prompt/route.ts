import { NextResponse } from "next/server";
import { z } from "zod";
import { reportSchema } from "@/lib/schema";
import { buildCodingPromptMessages } from "@/lib/coding-prompt";
import { callAiRaw } from "@/lib/ai-raw";

const bodySchema = z.object({
  report: reportSchema,
  changeDescription: z.string().trim().min(1).max(5000),
});

function clean(text: string): string {
  const out = text.trim();
  const fenced = out.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/);
  return (fenced ? fenced[1] : out).trim();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid generated workflow is required before creating a coding prompt." },
      { status: 400 }
    );
  }

  const { report, changeDescription } = parsed.data;

  try {
    const raw = await callAiRaw({
      messages: buildCodingPromptMessages(report, changeDescription),
      maxTokens: 8000,
      temperature: 0.3,
      jsonMode: false,
      timeoutMs: 90000,
    });
    const prompt = clean(raw);
    if (prompt.length < 100) throw new Error("AI returned an incomplete coding prompt");
    return NextResponse.json({ prompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prompt generation failed";
    if (!message.includes("400")) {
      try {
        const raw = await callAiRaw({
          messages: buildCodingPromptMessages(report, changeDescription),
          maxTokens: 8000,
          temperature: 0.3,
          jsonMode: false,
          timeoutMs: 90000,
        });
        const prompt = clean(raw);
        if (prompt.length >= 100) {
          return NextResponse.json({ prompt, retried: true });
        }
      } catch {
        // fall through
      }
    }
    console.error("coding prompt failed:", message);
    return NextResponse.json({ error: `Coding prompt generation failed: ${message}` }, { status: 502 });
  }
}
