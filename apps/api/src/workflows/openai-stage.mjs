// One workflow AGENT stage on an OpenAI text model (Responses API): text in, text
// out — no tools, no shell. The runner writes the request JSON; this posts it and
// writes the reply to `produces`, plus one line in costs.jsonl so the run is billed.
//
// Usage: node openai-stage.mjs <requestJsonPath> <producesAbs>
// Request: { model, effort, instructions, input, price: { inputUsd, cachedUsd, outputUsd } }
// Env: OPENAI_API_KEY (required), OPENAI_BASE_URL, OPENAI_STAGE_BACKOFF_MS (default 1000),
//      ZIBBY_STAGE_DIR (where costs.jsonl lands; default: dirname of produces).

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const [requestPath, producesAbs] = process.argv.slice(2);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const key = process.env.OPENAI_API_KEY;
if (!key) fail("OPENAI_API_KEY is not set (Settings → AI models → OpenAI)");

const { model, effort, instructions, input, price } = JSON.parse(
  await readFile(requestPath, "utf8"),
);
const url = `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`;
const backoffMs = Number(process.env.OPENAI_STAGE_BACKOFF_MS ?? 1000);

let res;
for (let attempt = 0; ; attempt++) {
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort },
        max_output_tokens: 25000,
      }),
    });
  } catch (error) {
    if (attempt >= 3)
      fail(`OpenAI request failed: ${error instanceof Error ? error.message : error}`);
    await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    continue;
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    continue;
  }
  break;
}

const body = await res.json().catch(() => ({}));
if (!res.ok) fail(`OpenAI error ${res.status}: ${body?.error?.message ?? "request failed"}`);
if (body.status === "incomplete") {
  fail(`OpenAI response incomplete: ${body.incomplete_details?.reason ?? "unknown reason"}`);
}

const text =
  typeof body.output_text === "string"
    ? body.output_text
    : (body.output ?? [])
        .filter((item) => item?.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part?.type === "output_text")
        .map((part) => part.text)
        .join("");
if (!text.trim()) fail("OpenAI returned no text");

await mkdir(path.dirname(producesAbs), { recursive: true });
await writeFile(producesAbs, text);

const usage = body.usage ?? {};
const inTok = usage.input_tokens ?? 0;
const outTok = usage.output_tokens ?? 0;
const cached = usage.input_tokens_details?.cached_tokens ?? 0;
const costUsd =
  ((inTok - cached) * price.inputUsd + cached * price.cachedUsd + outTok * price.outputUsd) / 1e6;
const stageDir = process.env.ZIBBY_STAGE_DIR ?? path.dirname(producesAbs);
await appendFile(
  path.join(stageDir, "costs.jsonl"),
  `${JSON.stringify({ at: new Date().toISOString(), source: "text", provider: "openai", model, costUsd })}\n`,
);
console.log(
  `${model}: ${inTok} in (${cached} cached) / ${outTok} out tokens, $${costUsd.toFixed(4)}`,
);
