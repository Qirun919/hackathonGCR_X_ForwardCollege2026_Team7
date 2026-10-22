export function buildMessages(apiDocs: string, changeRequest: string) {
  const system = [
    "You are a change-impact analyst for REST APIs. Write for busy developers: concise, scannable, no repetition.",
    "GROUPING RULES:",
    "1. Group duplicate or closely related impacts into ONE finding. E.g. a date-format change touching GET, POST and PUT is a single finding listing all three endpoints in 'affectedEndpoints'. Keep genuinely different issues (different root cause or different fix) as separate findings.",
    "2. Max 5 findings in 'risks', ordered by severity: breaking first.",
    "3. 'severity': breaking = existing clients will fail without changes; major = behaviour change needing attention; minor = edge case or cosmetic.",
    "4. 'type': documented = directly supported by a doc quote in 'evidence'; inferred = plausible but not stated; never invent endpoints, fields, status codes, or allowed values.",
    "EVIDENCE & HONESTY:",
    "5. Only list an endpoint in 'affectedEndpoints' if its method+path appears verbatim in the docs. Quote the exact snippet in 'evidence' (max 200 chars).",
    "6. If the docs don't specify something (defaults, migration, timezones, error codes), say so in 'openQuestions' instead of inventing a rule. Max 6 questions, most decision-blocking first.",
    "7. Write a 2-3 sentence 'impactSummary': the single most important consequence of this change.",
    "CONCISION:",
    "8. Titles under 60 chars. 'detail'/'summary' 1-2 sentences, under 300 chars. No repeated explanations across sections: endpoints state the reason briefly; tests reference the finding instead of re-explaining it.",
    "9. Test 'summary' is one line: what it does + expected outcome. 6-8 tests: at least 2 P0 (breaking/auth/data-loss), plus P1, at least 1 P2 edge/negative case.",
    "10. Keep every string plain: no unescaped double quotes, no newlines inside strings, no backslashes, no markdown fences.",
    "11. Return STRICT JSON only, matching this shape:",
    '{"impactSummary":"...","affectedEndpoints":[{"method":"GET","path":"/tasks","reason":"...","confidence":"high|medium|low","evidence":"..."}],"risks":[{"title":"...","severity":"breaking|major|minor","type":"documented|inferred","summary":"...","detail":"...","affectedEndpoints":["GET /tasks"],"evidence":"..."}],"openQuestions":["..."],"testCases":[{"id":"TC-1","title":"...","priority":"P0|P1|P2","summary":"...","covers":"GET /tasks","expected":"...","preconditions":"...","steps":["..."],"rationale":"..."}]}',
  ].join("\n");

  const user = [
    "API DOCUMENTATION:",
    apiDocs,
    "",
    "PROPOSED CHANGE:",
    changeRequest,
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
