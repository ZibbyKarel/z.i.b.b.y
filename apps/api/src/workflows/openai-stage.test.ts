import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "openai-stage.mjs");
const PRICE = { inputUsd: 2, cachedUsd: 0.1, outputUsd: 10 };

describe("openai-stage.mjs", () => {
  let dir: string;
  let server: http.Server;
  let hits: Array<{ auth?: string; body: Record<string, unknown> }>;
  let replies: Array<{ status: number; json: unknown }>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "openai-stage-"));
    hits = [];
    replies = [];
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        hits.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
        const r = replies.shift() ?? { status: 500, json: {} };
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
  });
  afterEach(async () => {
    server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run(env: Record<string, string> = {}) {
    const req = path.join(dir, "req.json");
    await fs.writeFile(
      req,
      JSON.stringify({
        model: "gpt-6.1-sol",
        effort: "low",
        instructions: "i",
        input: "x",
        price: PRICE,
      }),
    );
    const produces = path.join(dir, "out", "result.md");
    const child = spawn(process.execPath, [SCRIPT, req, produces], {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        OPENAI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        OPENAI_API_KEY: "sk-test",
        OPENAI_STAGE_BACKOFF_MS: "1",
        ZIBBY_STAGE_DIR: dir,
        ...env,
      },
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    const code = await new Promise<number | null>((r) => child.on("close", r));
    return { code, stderr, produces };
  }

  it("writes produces and bills the usage", async () => {
    replies.push({
      status: 200,
      json: {
        output_text: "hello",
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cached_tokens: 400 },
        },
      },
    });
    const { code, produces } = await run();
    expect(code).toBe(0);
    expect(await fs.readFile(produces, "utf8")).toBe("hello");
    expect(hits[0]?.auth).toBe("Bearer sk-test");
    expect(hits[0]?.body).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "low" } });
    const line = JSON.parse((await fs.readFile(path.join(dir, "costs.jsonl"), "utf8")).trim());
    // (600*2 + 400*0.1 + 500*10) / 1e6
    expect(line.costUsd).toBeCloseTo(0.00624, 8);
    expect(line).toMatchObject({ source: "text", provider: "openai", model: "gpt-6.1-sol" });
  });

  it("retries a 500 and then succeeds", async () => {
    replies.push({ status: 500, json: { error: { message: "boom" } } });
    replies.push({ status: 200, json: { output_text: "ok", usage: {} } });
    const { code } = await run();
    expect(code).toBe(0);
    expect(hits).toHaveLength(2);
  });

  it("reads text from output[] when output_text is absent", async () => {
    replies.push({
      status: 200,
      json: {
        output: [
          { type: "reasoning" },
          {
            type: "message",
            content: [
              { type: "output_text", text: "a" },
              { type: "output_text", text: "b" },
            ],
          },
        ],
      },
    });
    const { code, produces } = await run();
    expect(code).toBe(0);
    expect(await fs.readFile(produces, "utf8")).toBe("ab");
  });

  it("exits 1 without a key, and surfaces the API error message", async () => {
    const noKey = await run({ OPENAI_API_KEY: "" });
    expect(noKey.code).toBe(1);
    expect(noKey.stderr).toContain("OPENAI_API_KEY is not set");
    replies.push({ status: 400, json: { error: { message: "bad model" } } });
    const bad = await run();
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("bad model");
  });
});
