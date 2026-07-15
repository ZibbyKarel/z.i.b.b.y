import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The hook is a dependency-free `.mjs` with no `.d.ts` sibling; `classify` is a pure
// `(command: string) => { action, branch?, … } | null`. Imported for unit coverage.
// @ts-expect-error — untyped .mjs module (implicit any), intentional for this seam.
import { classify, classifyTask } from "./claude-approval-hook.mjs";

/**
 * Direct coverage for the PreToolUse approval hook's destructive-command detector.
 * The Cleaner e2e drives a stubbed `claude` (fake-claude.mjs) that fakes the gate
 * handshake, so the *real* `isDestructive`/`parseTargets` in the hook were never
 * exercised — which is how `find … -delete` slipped the gate in production. These
 * tests run the actual hook binary the way Claude Code does: an event JSON on stdin.
 */
const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "claude-approval-hook.mjs");

interface HookResult {
  stdout: string;
  code: number | null;
}

/** Run the hook with `event` on stdin, in `cwd`; resolve once it exits. */
function runHook(
  cwd: string,
  event: unknown,
  env?: Record<string, string>,
  args: string[] = [],
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, code }));
    child.stdin.write(JSON.stringify(event));
    child.stdin.end();
  });
}

const bashEvent = (command: string, cwd: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd,
});

const taskEvent = (
  cwd: string,
  toolInput: { subagent_type?: string; prompt?: string; description?: string },
) => ({
  tool_name: "Task",
  tool_input: toolInput,
  cwd,
});

describe("claude approval hook — destructive-command gate", () => {
  let cwd: string;
  const requestFile = () => path.join(cwd, "intent-request.json");
  /** Pre-write an allow decision so the (blocking) hook returns immediately. */
  const preApprove = () =>
    fs.writeFile(
      path.join(cwd, "intent-decision.json"),
      JSON.stringify({ decision: "allow" }),
      "utf8",
    );
  const readRequest = async () => JSON.parse(await fs.readFile(requestFile(), "utf8"));
  const present = (p: string) =>
    fs
      .access(p)
      .then(() => true)
      .catch(() => false);

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "hook-"));
  });
  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("lets a non-destructive command through without raising a request", async () => {
    const res = await runHook(cwd, bashEvent("ls -la && cat report.txt", cwd));
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("");
    expect(await present(requestFile())).toBe(false);
  });

  it("ignores a non-Bash, non-Task tool call entirely", async () => {
    const res = await runHook(cwd, {
      tool_name: "Read",
      tool_input: { file_path: "/etc/hosts" },
      cwd,
    });
    expect(res.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("gates EVERY Task (agent delegation) call as agent.delegate, not just recognised idioms", async () => {
    // Fáze 2a: unlike Bash (only recognised destructive idioms are gated), every
    // handoff goes through the gate — the default floor decision is allow, so an
    // unremarkable delegation still proceeds, just via the same protocol.
    await preApprove();
    const res = await runHook(
      cwd,
      taskEvent(cwd, { subagent_type: "coder", prompt: "Fix the failing test in foo.ts" }),
    );
    const req = await readRequest();
    expect(req.action).toBe("agent.delegate");
    expect(req.scope).toBe("coder");
    expect(req.context).toBe("Fix the failing test in foo.ts");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("truncates a long delegated prompt to ~200 chars for the intent's context", async () => {
    await preApprove();
    const longPrompt = "x".repeat(500);
    await runHook(cwd, taskEvent(cwd, { subagent_type: "tester", prompt: longPrompt }));
    const req = await readRequest();
    expect(req.context.length).toBeLessThan(longPrompt.length);
    expect(req.context.startsWith("x".repeat(200))).toBe(true);
  });

  it("falls back to the Task's description when no prompt field is present", async () => {
    await preApprove();
    await runHook(cwd, taskEvent(cwd, { subagent_type: "cleaner", description: "Tidy the repo" }));
    const req = await readRequest();
    expect(req.context).toBe("Tidy the repo");
  });

  it("denies a delegation when the gate rejects it (an operator's own agent.delegate rule)", async () => {
    await fs.writeFile(
      path.join(cwd, "intent-decision.json"),
      JSON.stringify({ decision: "deny" }),
      "utf8",
    );
    const res = await runHook(cwd, taskEvent(cwd, { subagent_type: "coder", prompt: "do it" }));
    expect(res.stdout).toContain('"permissionDecision":"deny"');
  });

  it("gates a plain rm and keeps a quoted, spaced filename as one target", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent('rm -rf ".DS_Store" "zibby-ascii 2.txt"', cwd));
    const req = await readRequest();
    expect(req.action).toBe("delete");
    const ctx = JSON.parse(req.context);
    expect(ctx.preview.targets).toEqual([".DS_Store", "zibby-ascii 2.txt"]);
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("keeps a backslash-escaped, spaced filename as one target (unescaped)", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("rm -rf zibby-ascii\\ 2.txt", cwd));
    const ctx = JSON.parse((await readRequest()).context);
    expect(ctx.preview.targets).toEqual(["zibby-ascii 2.txt"]);
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("emits a dashboard-shaped delete enrichment (canonical riskType + command preview)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent('rm "a.txt"', cwd));
    const ctx = JSON.parse((await readRequest()).context);
    // `mazani` is a canonical gate risk type — anything else degrades to the cart icon.
    expect(ctx.riskType).toBe("mazani");
    // The UI's command preview reads `shell` + `cmd`; a bare `command` shows "undefined".
    expect(ctx.preview.kind).toBe("command");
    expect(ctx.preview.shell).toBeTruthy();
    expect(ctx.preview.cmd).toBe('rm "a.txt"');
    expect(ctx.preview.command).toBeUndefined();
  });

  it("collects only the file targets from a chained rm command (no operator/binary tokens)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent('rm a.txt && rm "b c.txt" && rmdir d', cwd));
    const ctx = JSON.parse((await readRequest()).context);
    expect(ctx.preview.targets).toEqual(["a.txt", "b c.txt", "d"]);
    expect(ctx.summary).toBe("Smazat 3 položek");
  });

  it("gates a path-qualified rm invocation that bypassed the old boundary regex (/bin/rm)", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("/bin/rm foo", cwd));
    const req = await readRequest();
    expect(req.action).toBe("delete");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a backslash-escaped rm invocation that bypassed the old boundary regex (\\rm)", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("\\rm foo", cwd));
    const req = await readRequest();
    expect(req.action).toBe("delete");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a `command`-wrapped rm invocation that bypassed the old boundary regex", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("command rm foo", cwd));
    const req = await readRequest();
    expect(req.action).toBe("delete");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a `busybox`-wrapped rm invocation that bypassed the old boundary regex", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("busybox rm foo", cwd));
    const req = await readRequest();
    expect(req.action).toBe("delete");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates `mv` as a move", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("mv a b", cwd));
    const req = await readRequest();
    expect(req.action).toBe("move");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates `cp` with two positional args as an overwrite (best-effort — can't know the dest exists)", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("cp a b", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a bare `>` redirect onto a real file as an overwrite", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("echo hi > file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a `>>` append redirect onto a real file as an overwrite", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("echo hi >> file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("gates `dd of=…` as an overwrite", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("dd if=/dev/zero of=file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("gates `truncate` as an overwrite", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("truncate -s0 file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("gates `sed -i` (in-place edit) as an overwrite", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("sed -i s/x/y/ file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("gates a bare `tee` (no -a) as an overwrite (truncate-then-write)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("tee file", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("does NOT gate `tee -a` (append, no truncation)", async () => {
    const res = await runHook(cwd, bashEvent("tee -a file", cwd));
    expect(res.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("gates `install` as an overwrite (can overwrite the destination)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("install src dst", cwd));
    const req = await readRequest();
    expect(req.action).toBe("overwrite");
  });

  it("does NOT gate `echo \"rm -rf\" > note.txt` as a delete — the rm-rf is echo DATA, not a real rm", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent('echo "rm -rf" > note.txt', cwd));
    const req = await readRequest();
    // The quoted "rm -rf" is one data token, never an executed rm — but the bare
    // `>` redirect right after it is a real file write, so it correctly gates as
    // an overwrite, never as a false-positive delete.
    expect(req.action).toBe("overwrite");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("does NOT gate `> /dev/null` (a discard, not a real-file overwrite)", async () => {
    const res = await runHook(cwd, bashEvent("echo hi > /dev/null", cwd));
    expect(res.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("leaves plain reads (`cat`, `ls`) ungated", async () => {
    const res1 = await runHook(cwd, bashEvent("cat file", cwd));
    expect(res1.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
    const res2 = await runHook(cwd, bashEvent("ls", cwd));
    expect(res2.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("gates a `gh api … -X PUT …/merges` REST merge (Fáze 17.1 — previously fail-open)", async () => {
    await preApprove();
    const res = await runHook(cwd, bashEvent("gh api repos/o/r/pulls/1/merges -X PUT", cwd));
    const req = await readRequest();
    expect(req.action).toBe("pr.merge");
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });

  it("gates a chained `gh api … -X PUT …/merges` (segmentation already existed)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("ls && gh api repos/o/r/pulls/1/merges -X PUT", cwd));
    const req = await readRequest();
    expect(req.action).toBe("pr.merge");
  });

  it("gates a `gh api` field-flag write (implicit POST) that creates a PR", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("gh api repos/o/r/pulls -f title=x", cwd));
    const req = await readRequest();
    expect(req.action).toBe("pr.open");
  });

  it("gates a `gh api … --method DELETE` as the generic gh.api_write intent", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("gh api repos/o/r/pulls --method DELETE", cwd));
    const req = await readRequest();
    expect(req.action).toBe("gh.api_write");
  });

  it("lets a plain `gh api` GET through without a request (fail-open default persists)", async () => {
    const res = await runHook(cwd, bashEvent("gh api repos/o/r/pulls", cwd));
    expect(res.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("gates `find … -delete` (the .DS_Store sweep that previously slipped the gate)", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("find . -name .DS_Store -delete", cwd));
    expect(await present(requestFile())).toBe(true);
    const ctx = JSON.parse((await readRequest()).context);
    // No enumerable positional targets — the command string is the source of truth.
    expect(ctx.preview.targets).toEqual([]);
    expect(ctx.summary).toBe("Smazat soubory odpovídající příkazu");
  });

  it("gates `git clean -fdx` but not a commit whose message merely says 'clean'", async () => {
    await preApprove();
    await runHook(cwd, bashEvent("git clean -fdx", cwd));
    expect(await present(requestFile())).toBe(true);

    await fs.rm(requestFile(), { force: true });
    const res = await runHook(cwd, bashEvent('git commit -m "clean up the workspace"', cwd));
    expect(res.code).toBe(0);
    expect(await present(requestFile())).toBe(false);
  });

  it("writes the request into ZIBBY_INTENT_DIR, not the command's cwd", async () => {
    // The regression: a clean agent runs `rm` inside the granted target directory, so
    // the Bash call's cwd is the target — not the sandbox the core watches. The hook
    // must honour the explicit coordination dir and ignore `input.cwd`.
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-"));
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "target-"));
    try {
      await fs.writeFile(
        path.join(sandbox, "intent-decision.json"),
        JSON.stringify({ decision: "allow" }),
        "utf8",
      );
      // Event reports the *target* as cwd; env points the gate at the *sandbox*.
      await runHook(target, bashEvent("rm -rf scratch.tmp", target), {
        ZIBBY_INTENT_DIR: sandbox,
      });
      // Request landed in the sandbox (watched), never in the target (the regression).
      expect(await present(path.join(sandbox, "intent-request.json"))).toBe(true);
      expect(await present(path.join(target, "intent-request.json"))).toBe(false);
    } finally {
      await fs.rm(sandbox, { recursive: true, force: true });
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  it("denies (exit-blocks) when the decision is reject", async () => {
    await fs.writeFile(
      path.join(cwd, "intent-decision.json"),
      JSON.stringify({ decision: "deny" }),
      "utf8",
    );
    const res = await runHook(cwd, bashEvent("rm -rf scratch.tmp", cwd));
    expect(res.stdout).toContain('"permissionDecision":"deny"');
  });

  it("denies fail-closed when the approval deadline elapses with no decision", async () => {
    // The production incident: Claude Code kills a hook at its configured timeout
    // and treats the kill as a NON-decision — under dontAsk the gated `rm` then
    // executes as if approved. The hook must therefore deny on its own, shorter
    // deadline (argv[2], in seconds) instead of blocking until it is killed.
    const res = await runHook(cwd, bashEvent("rm -rf scratch.tmp", cwd), undefined, ["1"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('"permissionDecision":"deny"');
    expect(res.stdout).toContain("Approval window elapsed");
    // The unconsumed request is tidied away so it can't strand a stale gate entry.
    expect(await present(requestFile())).toBe(false);
  });

  it("still allows within the deadline when a decision arrives late but in time", async () => {
    const run = runHook(cwd, bashEvent("rm -rf scratch.tmp", cwd), undefined, ["10"]);
    // Decision lands after the hook started polling, well inside the window.
    await new Promise((r) => setTimeout(r, 500));
    await preApprove();
    const res = await run;
    expect(res.stdout).toContain('"permissionDecision":"allow"');
  });
});

describe("claude approval hook — classify (push / PR / chains)", () => {
  it("classifies a plain push as git.push and extracts the branch", () => {
    const c = classify("git push origin main");
    expect(c?.action).toBe("git.push");
    expect(c?.branch).toBe("main");
    expect(c?.riskType).toBe("push");
    expect(c?.preview).toMatchObject({
      kind: "command",
      shell: "bash",
      cmd: "git push origin main",
    });
  });

  it("honours git global options before the subcommand", () => {
    expect(classify("git -C /repo push origin feature/x")).toMatchObject({
      action: "git.push",
      branch: "feature/x",
    });
    expect(classify("git --git-dir=/r/.git push origin dev")).toMatchObject({
      action: "git.push",
      branch: "dev",
    });
    expect(classify("git -c user.name=x push origin trunk")).toMatchObject({ action: "git.push" });
  });

  it("takes the destination of a src:dst refspec as the branch", () => {
    expect(classify("git push origin HEAD:release")).toMatchObject({
      action: "git.push",
      branch: "release",
    });
  });

  it("reclassifies force variants as git.force_push", () => {
    expect(classify("git push --force origin main")?.action).toBe("git.force_push");
    expect(classify("git push -f origin main")?.action).toBe("git.force_push");
    expect(classify("git push --force-with-lease origin main")?.action).toBe("git.force_push");
    expect(classify("git push origin +main")?.action).toBe("git.force_push");
  });

  it("classifies gh pr create → pr.open and gh pr merge → pr.merge", () => {
    expect(classify("gh pr create --title x --body-file b.md")?.action).toBe("pr.open");
    expect(classify("gh -R owner/repo pr merge 42 --squash")?.action).toBe("pr.merge");
  });

  it("a push+PR chain announces the single most severe action (pr.open over git.push)", () => {
    const c = classify("git push -u origin feat && gh pr create --title x --body-file b.md");
    expect(c?.action).toBe("pr.open");
    // The preview shows the whole chain, not just the announced segment.
    expect(c?.preview.cmd).toContain("git push");
    expect(c?.preview.cmd).toContain("gh pr create");
  });

  it("pr.merge outranks every other action in a chain", () => {
    const c = classify("git push --force origin main && gh pr merge 1");
    expect(c?.action).toBe("pr.merge");
  });

  it("detects a push nested in command substitution", () => {
    expect(classify("$(git push origin main)")?.action).toBe("git.push");
  });

  it("does not match lookalikes or quoted text", () => {
    expect(classify("git pushover origin main")).toBeNull();
    expect(classify('echo "git push origin main"')).toBeNull();
    expect(classify("ls -la && cat report.txt")).toBeNull();
  });

  it("still classifies the destructive corpus as delete", () => {
    expect(classify("rm -rf scratch.tmp")?.action).toBe("delete");
    expect(classify("find . -name .DS_Store -delete")?.action).toBe("delete");
    expect(classify("git clean -fdx")?.action).toBe("delete");
  });
});

describe("claude approval hook — classify (gh api mutations, Fáze 17.1)", () => {
  it("maps a PUT on a …/merges path to pr.merge (the REST merge)", () => {
    const c = classify("gh api repos/o/r/pulls/1/merges -X PUT");
    expect(c?.action).toBe("pr.merge");
    expect(c?.riskType).toBe("push");
  });

  it("recognises --method= (equals form) and lower-case method values", () => {
    expect(classify("gh api repos/o/r/pulls/1/merges --method=put")?.action).toBe("pr.merge");
    expect(classify("gh api repos/o/r/pulls/1/merges -X put")?.action).toBe("pr.merge");
  });

  it("maps an explicit POST on a path ending /pulls to pr.open", () => {
    expect(classify("gh api repos/o/r/pulls -X POST -f title=x")?.action).toBe("pr.open");
  });

  it("maps an implicit POST (a field flag, no -X) on /pulls to pr.open", () => {
    expect(classify("gh api repos/o/r/pulls -f title=x")?.action).toBe("pr.open");
    expect(classify("gh api repos/o/r/pulls -F body=@f.md")?.action).toBe("pr.open");
    expect(classify("gh api repos/o/r/pulls --raw-field title=x")?.action).toBe("pr.open");
    expect(classify("gh api repos/o/r/pulls --input body.json")?.action).toBe("pr.open");
  });

  it("falls back to the generic gh.api_write for any other mutating gh api call", () => {
    expect(classify("gh api repos/o/r/pulls --method DELETE")?.action).toBe("gh.api_write");
    expect(classify("gh api repos/o/r --method PATCH -f archived=true")?.action).toBe(
      "gh.api_write",
    );
    expect(classify("gh api repos/o/r/collaborators/bob -X PUT")?.action).toBe("gh.api_write");
  });

  it("does not classify a plain GET, with or without --paginate", () => {
    expect(classify("gh api repos/o/r/pulls")).toBeNull();
    expect(classify("gh api repos/o/r/issues --paginate")).toBeNull();
  });

  it("does not classify an unrecognised gh subcommand", () => {
    expect(classify("gh issue list")).toBeNull();
    expect(classify("gh repo view")).toBeNull();
  });

  it("gh.api_write outranks a plain push but not a REST merge in a chain", () => {
    const withPush = classify("git push origin main && gh api repos/o/r --method PATCH -f x=y");
    expect(withPush?.action).toBe("gh.api_write");
    const withMerge = classify(
      "gh api repos/o/r --method PATCH -f x=y && gh api repos/o/r/pulls/1/merges -X PUT",
    );
    expect(withMerge?.action).toBe("pr.merge");
  });
});

describe("claude approval hook — classify (overwrite/move + rm-family boundary fix)", () => {
  it("classifies path-qualified, backslash, and wrapped rm invocations as delete", () => {
    expect(classify("/bin/rm foo")?.action).toBe("delete");
    expect(classify("/usr/bin/rm -rf x")?.action).toBe("delete");
    expect(classify("\\rm foo")?.action).toBe("delete");
    expect(classify("command rm foo")?.action).toBe("delete");
    expect(classify("busybox rm foo")?.action).toBe("delete");
  });

  it("classifies mv as move and cp (≥2 positional args) as overwrite", () => {
    expect(classify("mv a b")?.action).toBe("move");
    expect(classify("cp a b")?.action).toBe("overwrite");
    expect(classify("cp -r a b")?.action).toBe("overwrite");
  });

  it("classifies redirect/tee/dd/truncate/sed -i/install as overwrite", () => {
    expect(classify("echo hi > file")?.action).toBe("overwrite");
    expect(classify("echo hi >> file")?.action).toBe("overwrite");
    expect(classify("dd if=/dev/zero of=file")?.action).toBe("overwrite");
    expect(classify("truncate -s0 file")?.action).toBe("overwrite");
    expect(classify("sed -i s/x/y/ file")?.action).toBe("overwrite");
    expect(classify("tee file")?.action).toBe("overwrite");
    expect(classify("install src dst")?.action).toBe("overwrite");
  });

  it("does not gate `tee -a`, a fd-duplication redirect, or a /dev/null discard", () => {
    expect(classify("tee -a file")).toBeNull();
    expect(classify("cmd 2>&1")).toBeNull();
    expect(classify("echo hi > /dev/null")).toBeNull();
  });

  it("does not falsely gate a quoted 'rm -rf' as delete, but does gate the real redirect after it as overwrite", () => {
    const c = classify('echo "rm -rf" > note.txt');
    expect(c?.action).toBe("overwrite");
    expect(c?.action).not.toBe("delete");
  });

  it("leaves plain reads ungated", () => {
    expect(classify("cat file")).toBeNull();
    expect(classify("ls")).toBeNull();
    expect(classify("ls -la")).toBeNull();
  });
});

describe("claude approval hook — classifyTask (agent delegation)", () => {
  it("classifies a Task call to agent.delegate, carrying subagent_type as scope", () => {
    const c = classifyTask({ subagent_type: "coder", prompt: "Implement the feature" });
    expect(c.action).toBe("agent.delegate");
    expect(c.scope).toBe("coder");
    expect(c.context).toBe("Implement the feature");
  });

  it("omits scope when subagent_type is absent (still classifies — every handoff is gated)", () => {
    const c = classifyTask({ prompt: "General task" });
    expect(c.action).toBe("agent.delegate");
    expect(c.scope).toBeUndefined();
    expect(c.context).toBe("General task");
  });

  it("truncates a long prompt to ~200 chars with an ellipsis marker", () => {
    const c = classifyTask({ subagent_type: "tester", prompt: "y".repeat(300) });
    expect(c.context.length).toBeLessThan(210);
    expect(c.context.endsWith("…")).toBe(true);
  });

  it("falls back to description when prompt is missing, and omits context when both are blank", () => {
    expect(classifyTask({ subagent_type: "x", description: "d" }).context).toBe("d");
    const bare = classifyTask({ subagent_type: "x" });
    expect(bare.context).toBeUndefined();
  });

  it("tolerates a malformed/missing tool_input (never throws, always classifies)", () => {
    expect(classifyTask(undefined)).toEqual({ action: "agent.delegate" });
    expect(classifyTask(null)).toEqual({ action: "agent.delegate" });
    expect(classifyTask("not an object")).toEqual({ action: "agent.delegate" });
  });
});
