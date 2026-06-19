#!/usr/bin/env node
// Real-mode smoke audit (Phase 1.4) — standalone Node, no Nest boot.
//
// Verifies that the `claude` CLI on THIS machine still speaks the exact flag
// dialect ZIBBY's command builder emits (claude-run-command.service.ts):
//   1. preflight probes: `--version` and `auth status` (the ClaudePreflightService
//      mechanisms),
//   2. one trivial real run per cumulative flag group mirroring the full matrix
//      (-p, --permission-mode dontAsk, --allowedTools, --append-system-prompt,
//      --agents, --settings approval hook, --output-format stream-json, --model
//      haiku), asserting exit 0 + a parseable/expected result — printed as a
//      per-group pass/fail table so CLI drift is visible at a glance,
//   3. a context-loading probe pinning the rule Phase 2/3 build on: the target
//      project's CLAUDE.md loads from the spawn CWD; an `--add-dir` grants file
//      access but loads NO context.
//
// Honours CLAUDE_BIN. Burns a handful of trivial haiku calls — run manually
// (`pnpm api:smoke`), never in CI.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = process.env.CLAUDE_BIN ?? "claude";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPROVAL_HOOK = path.resolve(HERE, "../src/runner/claude-approval-hook.mjs");

const PROBE_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 120_000;

/** Spawn and capture; resolves { code, stdout, stderr } (never rejects). */
function run(args, { timeoutMs, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(BIN, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      settle({ code: null, stdout, stderr: `${stderr}\n[timed out after ${timeoutMs}ms]` });
    }, timeoutMs ?? RUN_TIMEOUT_MS);
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.on("error", (err) => settle({ code: null, stdout, stderr: String(err) }));
    child.on("exit", (code) => settle({ code, stdout, stderr }));
  });
}

const results = [];
function record(group, ok, note = "") {
  results.push({ group, ok, note });
  console.log(`  ${ok ? "✓" : "✗"} ${group}${note ? ` — ${note}` : ""}`);
}

/** Mirrors approvalSettings() in claude-run-command.service.ts. */
function approvalSettings() {
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(APPROVAL_HOOK)}`;
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 600 }] }],
    },
  });
}

const MARKER = "SMOKE_OK";
const TASK = `Reply with exactly: ${MARKER}`;

/** The cumulative flag groups, in the order the builder assembles them. */
function flagGroups() {
  return [
    {
      group: "print + model haiku",
      args: ["-p", TASK, "--model", "haiku"],
      check: (r) => r.stdout.includes(MARKER),
    },
    {
      group: "+ permission-mode dontAsk + allowedTools",
      args: [
        "-p",
        TASK,
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Read",
        "Bash",
        "--model",
        "haiku",
      ],
      check: (r) => r.stdout.includes(MARKER),
    },
    {
      group: "+ append-system-prompt",
      args: [
        "-p",
        TASK,
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Read",
        "Bash",
        "--append-system-prompt",
        "You are a smoke-test agent. Follow the user's instruction exactly.",
        "--model",
        "haiku",
      ],
      check: (r) => r.stdout.includes(MARKER),
    },
    {
      group: "+ agents catalog",
      args: [
        "-p",
        TASK,
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Agent",
        "Read",
        "Bash",
        "--append-system-prompt",
        "You are a smoke-test agent. Follow the user's instruction exactly.",
        "--agents",
        JSON.stringify({
          "smoke-helper": {
            description: "A no-op helper for the smoke test",
            prompt: "Do nothing.",
          },
        }),
        "--model",
        "haiku",
      ],
      check: (r) => r.stdout.includes(MARKER),
    },
    {
      group: "+ settings approval hook",
      args: [
        "-p",
        TASK,
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Agent",
        "Read",
        "Bash",
        "--append-system-prompt",
        "You are a smoke-test agent. Follow the user's instruction exactly.",
        "--agents",
        JSON.stringify({
          "smoke-helper": {
            description: "A no-op helper for the smoke test",
            prompt: "Do nothing.",
          },
        }),
        "--settings",
        approvalSettings(),
        "--model",
        "haiku",
      ],
      check: (r) => r.stdout.includes(MARKER),
    },
    {
      group: "+ output-format stream-json (full matrix)",
      args: [
        "-p",
        TASK,
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Agent",
        "Read",
        "Bash",
        "--append-system-prompt",
        "You are a smoke-test agent. Follow the user's instruction exactly.",
        "--agents",
        JSON.stringify({
          "smoke-helper": {
            description: "A no-op helper for the smoke test",
            prompt: "Do nothing.",
          },
        }),
        "--settings",
        approvalSettings(),
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "haiku",
      ],
      check: (r) => {
        // Every line must be JSON; a `result` event must close the stream.
        const lines = r.stdout.split("\n").filter((l) => l.trim());
        let sawResult = false;
        for (const line of lines) {
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            return false;
          }
          if (event.type === "result") sawResult = true;
        }
        return sawResult;
      },
    },
  ];
}

async function preflight() {
  console.log(`\n[1/3] Preflight probes (${BIN})`);
  const version = await run(["--version"], { timeoutMs: PROBE_TIMEOUT_MS });
  record("claude --version", version.code === 0, version.stdout.trim() || version.stderr.trim());

  const auth = await run(["auth", "status"], { timeoutMs: PROBE_TIMEOUT_MS });
  let loggedIn = false;
  let note = auth.stderr.trim();
  if (auth.code === 0) {
    try {
      const status = JSON.parse(auth.stdout);
      loggedIn = status.loggedIn === true;
      note = `loggedIn=${status.loggedIn} (${status.subscriptionType ?? "?"})`;
    } catch {
      note = "unparseable output";
    }
  }
  record("claude auth status", auth.code === 0 && loggedIn, note);
}

async function flagMatrix() {
  console.log("\n[2/3] Flag matrix (one trivial haiku run per cumulative group)");
  for (const { group, args, check } of flagGroups()) {
    const result = await run(args);
    const ok = result.code === 0 && check(result);
    const note =
      result.code !== 0
        ? `exit ${result.code}: ${(result.stderr || result.stdout).trim().slice(0, 160)}`
        : ok
          ? ""
          : `exit 0 but unexpected output: ${result.stdout.trim().slice(0, 120)}`;
    record(group, ok, note);
  }
}

async function contextProbe() {
  console.log("\n[3/3] Context-loading probe (cwd loads CLAUDE.md; --add-dir does not)");
  const suffix = randomBytes(4).toString("hex");
  const cwdMarker = `CTX_MARKER_CWD_${suffix}`;
  const grantMarker = `CTX_MARKER_GRANT_${suffix}`;
  const cwdDir = await mkdtemp(path.join(tmpdir(), "smoke-ctx-cwd-"));
  const grantDir = await mkdtemp(path.join(tmpdir(), "smoke-ctx-grant-"));
  try {
    await writeFile(
      path.join(cwdDir, "CLAUDE.md"),
      `# Project context\n\nThe magic phrase of this project is ${cwdMarker}.\n`,
    );
    await writeFile(
      path.join(grantDir, "CLAUDE.md"),
      `# Other context\n\nThe magic phrase of this project is ${grantMarker}.\n`,
    );
    const result = await run(
      [
        "-p",
        "List every string starting with CTX_MARKER_ that appears in your context. Reply with only those strings, or NONE.",
        "--permission-mode",
        "dontAsk",
        "--add-dir",
        grantDir,
        "--model",
        "haiku",
      ],
      { cwd: cwdDir },
    );
    const seesCwd = result.stdout.includes(cwdMarker);
    const seesGrant = result.stdout.includes(grantMarker);
    record(
      "cwd CLAUDE.md loads",
      result.code === 0 && seesCwd,
      result.code !== 0 ? `exit ${result.code}` : seesCwd ? "" : "marker not seen",
    );
    record(
      "--add-dir CLAUDE.md does NOT load",
      result.code === 0 && !seesGrant,
      seesGrant ? "GRANT MARKER LEAKED INTO CONTEXT" : "",
    );
  } finally {
    await rm(cwdDir, { recursive: true, force: true });
    await rm(grantDir, { recursive: true, force: true });
  }
}

const started = Date.now();
console.log("ZIBBY claude smoke audit");
await preflight();
await flagMatrix();
await contextProbe();

const failed = results.filter((r) => !r.ok);
console.log(`\n${"─".repeat(60)}`);
for (const r of results) console.log(` ${r.ok ? "PASS" : "FAIL"}  ${r.group}`);
console.log(`${"─".repeat(60)}`);
console.log(
  `${results.length - failed.length}/${results.length} groups passed in ${Math.round((Date.now() - started) / 1000)}s`,
);
if (failed.length > 0) {
  console.error(
    "\nCLI drift detected — fix claude-run-command.service.ts (and its flag-matrix tests).",
  );
  process.exit(1);
}
