import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The hook is a dependency-free `.mjs` with no `.d.ts` sibling; `classify` is a pure
// `(command: string) => { action, branch?, … } | null`. Imported for unit coverage.
// @ts-expect-error — untyped .mjs module (implicit any), intentional for this seam.
import { analyzeOwnership, classify, classifyTask } from "./claude-approval-hook.mjs";
// @ts-expect-error — same untyped seam; a separate line keeps the directive on the import.
import { classifyEvent } from "./claude-approval-hook.mjs";

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

  describe("operator-only approvals API", () => {
    it.each([
      "curl -X POST http://localhost:3333/api/approvals/abc/approve",
      "curl -s -XPOST 127.0.0.1:3333/api/approvals/abc/reject -d '{}'",
      'wget --post-data=\'{"answer":"yes"}\' http://localhost:3333/api/approvals/q1/answer',
      "python3 -c \"import urllib.request as u; u.urlopen(u.Request('http://localhost:3333/api/approvals/a/revise', data=b'{}'))\"",
      "cat ~/.config/zibby/operator-token",
      "echo $ZIBBY_OPERATOR_TOKEN",
    ])("denies %s without raising a request", async (command) => {
      const res = await runHook(cwd, bashEvent(command, cwd), { ZIBBY_INTENT_DIR: "" });
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('"permissionDecision":"deny"');
      expect(await present(requestFile())).toBe(false);
    });

    it("still allows reading the approvals list", async () => {
      const res = await runHook(
        cwd,
        bashEvent("curl -s http://localhost:3333/api/approvals?status=pending", cwd),
      );
      expect(res.stdout).not.toContain('"permissionDecision":"deny"');
    });
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

  it('does NOT gate `echo "rm -rf" > note.txt` as a delete — the rm-rf is echo DATA, not a real rm', async () => {
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
      // A pre-existing file (not the agent's own — see the ownership ledger).
      await fs.writeFile(path.join(target, "scratch.tmp"), "x", "utf8");
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

  it("does not read a quoted `->` or a `/dev/null` inside `$(…)` as a file redirect", () => {
    // Both read-only commands raised overwrite cards in a real pr-review run.
    expect(
      classify(
        `for s in Foo "repo->save"; do echo "== $s: $(git grep -l "$s" -- ':!tests' | tr '\\n' ' ')"; done`,
      ),
    ).toBeNull();
    expect(
      classify('d=$(dirname $(grep -rl "class X" cms 2>/dev/null | head -1) 2>/dev/null); ls $d'),
    ).toBeNull();
    expect(classify('echo "$(date)" >out.txt')?.action).toBe("overwrite");
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

describe("claude approval hook — ownership ledger (agent's own files)", () => {
  let intentDir: string;
  let work: string;
  const ledgerFile = () => path.join(intentDir, "created-files.json");
  const readLedger = async (): Promise<string[]> =>
    JSON.parse(await fs.readFile(ledgerFile(), "utf8").catch(() => "[]"));
  const requestRaised = () =>
    fs
      .access(path.join(intentDir, "intent-request.json"))
      .then(() => true)
      .catch(() => false);
  const env = () => ({ ZIBBY_INTENT_DIR: intentDir });
  /** Pre-approve so a gated call returns immediately; the request file is the signal. */
  const preApprove = () =>
    fs.writeFile(path.join(intentDir, "intent-decision.json"), '{"decision":"allow"}', "utf8");
  const analyze = (command: string, ledger: string[] = []) =>
    analyzeOwnership(command, { cwd: work, ledger, intentDir });

  beforeEach(async () => {
    // realpath: macOS tmpdir is a symlink, and the ledger stores canonical paths.
    intentDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "hook-intent-")));
    work = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "hook-work-")));
  });
  afterEach(async () => {
    await fs.rm(intentDir, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
  });

  it("records a file the agent creates and lets it overwrite and delete it later, ungated", async () => {
    const file = path.join(work, "vtt2txt.py");
    let res = await runHook(work, bashEvent(`echo x > ${file}`, work), env());
    expect(res.stdout).toBe("");
    expect(await requestRaised()).toBe(false);
    expect(await readLedger()).toEqual([file]);

    await fs.writeFile(file, "x");
    res = await runHook(work, bashEvent(`sed -i 's/x/y/' ${file}`, work), env());
    expect(res.stdout).toBe("");
    res = await runHook(work, bashEvent(`rm -f ${file}`, work), env());
    expect(res.stdout).toBe("");
    expect(await requestRaised()).toBe(false);
  });

  it("still gates an overwrite of a file that pre-existed and isn't in the ledger", async () => {
    await fs.writeFile(path.join(work, "notes.md"), "operator data");
    await preApprove();
    await runHook(work, bashEvent("echo x > notes.md", work), env());
    expect(await requestRaised()).toBe(true);
  });

  it("owns everything under a directory the agent created (a script's outputs inside it)", async () => {
    const dir = path.join(work, "kbvtt");
    await runHook(work, bashEvent(`mkdir -p ${dir}`, work), env());
    expect(await readLedger()).toEqual([dir]);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "a.txt"), "written by python");
    expect(analyze(`rm ${dir}/a.txt`, [dir]).exempt).toBe(true);
    expect(analyze(`rm -rf ${dir}`, [dir]).exempt).toBe(true);
  });

  it("records a file created by the Write tool", async () => {
    const file = path.join(work, "scratch.py");
    const res = await runHook(
      work,
      { tool_name: "Write", tool_input: { file_path: file, content: "x" }, cwd: work },
      env(),
    );
    expect(res.stdout).toBe("");
    expect(await readLedger()).toEqual([file]);
  });

  it("denies Write/Edit aimed at the gate's own coordination files", async () => {
    for (const name of ["created-files.json", "intent-decision.json"]) {
      const res = await runHook(
        work,
        {
          tool_name: "Write",
          tool_input: { file_path: path.join(intentDir, name), content: '["/"]' },
          cwd: work,
        },
        env(),
      );
      expect(res.stdout).toContain('"permissionDecision":"deny"');
    }
  });

  it("never treats the coordination files or the intent dir as ownable", () => {
    expect(analyze(`echo '["/"]' > ${intentDir}/created-files.json`).exempt).toBe(false);
    expect(analyze(`rm -rf ${intentDir}`, [intentDir]).exempt).toBe(false);
  });

  it("ignores the body of a cat heredoc (data, not shell) — the real kb-librarian command", async () => {
    const cmd = [
      `mkdir -p ${work}/kbvtt && cat > ${work}/vtt2txt.py <<'EOF'`,
      "import sys,re",
      "for l in open(src):",
      "    m=re.match(r'<v ([^>]*)>(.*?)(</v>)?$',l.strip())",
      "    elif '-->' in l: rm = 1",
      "EOF",
    ].join("\n");
    expect(classify(cmd)?.action).toBe("overwrite");
    expect(analyze(cmd)).toMatchObject({
      exempt: true,
      creates: [path.join(work, "kbvtt"), path.join(work, "vtt2txt.py")],
    });
  });

  it("keeps the body of a heredoc that is executed (bash <<EOF) visible to the gate", () => {
    const cmd = ["bash <<'EOF'", "rm -rf /etc/hosts", "EOF"].join("\n");
    expect(classify(cmd)?.action).toBe("delete");
    expect(analyze(cmd).exempt).toBe(false);
  });

  it("keeps the gate on every target it can't resolve to a literal path", async () => {
    const owned = path.join(work, "own");
    await fs.writeFile(owned, "x");
    const ledger = [owned];
    expect(analyze(`rm ${owned}`, ledger).exempt).toBe(true);
    for (const cmd of [
      `rm $X`,
      `rm ${work}/*.txt`,
      `rm ~other/x`,
      `rm $(echo ${owned})`,
      `cd $D && rm own`,
      `find ${work} -delete`,
      `git clean -fd`,
      `echo ${owned} | xargs rm`,
      `install ${owned} /usr/local/bin/x`,
      `rm ${owned} "unterminated`,
      `cp -t ${work} ${owned}`,
    ]) {
      expect(analyze(cmd, ledger).exempt, cmd).toBe(false);
    }
  });

  it("checks every target of a chain, including the arg after `--` and a non-owned symlink leaf", async () => {
    const owned = path.join(work, "own");
    const foreign = path.join(work, "foreign");
    await fs.writeFile(owned, "x");
    await fs.writeFile(foreign, "operator data");
    const ledger = [owned];
    expect(analyze(`rm ${owned} && rm ${foreign}`, ledger).exempt).toBe(false);
    expect(analyze(`rm ${owned} -- -x ${foreign}`, ledger).exempt).toBe(false);
    expect(analyze(`echo "a > ${owned}" > ${foreign}`, ledger).exempt).toBe(false);
    const link = path.join(work, "link");
    await fs.symlink(foreign, link);
    expect(analyze(`echo x > ${link}`, [owned, link]).exempt).toBe(false);
  });

  it("resolves cp/mv into an existing directory to dest/<basename>", async () => {
    const owned = path.join(work, "own");
    await fs.writeFile(owned, "x");
    await fs.mkdir(path.join(work, "out"));
    // out/ pre-exists, out/own does not → a create, not an overwrite.
    expect(analyze(`cp ${owned} ${work}/out`, [owned])).toMatchObject({
      exempt: true,
      creates: [path.join(work, "out", "own")],
    });
    await fs.writeFile(path.join(work, "out", "own"), "operator copy");
    expect(analyze(`cp ${owned} ${work}/out`, [owned]).exempt).toBe(false);
    // Moving a non-owned file is gated even onto a new path.
    expect(analyze(`mv ${work}/out/own ${work}/new`, [owned]).exempt).toBe(false);
  });

  it("closes the review's bypasses — each would have silently hit a pre-existing file", async () => {
    const foreign = path.join(work, "victim");
    const owned = path.join(work, "own");
    await fs.writeFile(foreign, "operator data");
    await fs.writeFile(owned, "x");
    await fs.mkdir(path.join(work, "tpl"));
    await fs.mkdir(path.join(work, "dest"));
    await fs.mkdir(path.join(work, "outside"));
    await fs.writeFile(path.join(work, "outside", "victim"), "operator data");
    await fs.symlink(path.join(work, "outside"), path.join(work, "lnk"));
    const ledger = [owned, path.join(work, "tpl")];
    for (const cmd of [
      // a quote inside a comment must not pair up and swallow the next line
      `touch new.txt # don't forget\nrm ${foreign}\n# that's it`,
      // an unquoted heredoc body expands $(…) — it is NOT data
      `cat > new.sh <<EOF\n$(rm -f ${foreign})\nEOF`,
      // a line continuation on the heredoc opener line
      `cat <<'EOF' > new.txt \\\n&& rm -f ${foreign}\nbody\nEOF`,
      // zsh clobber override: the target is the NEXT word
      `echo x >! ${foreign}`,
      // BSD cp: trailing slash copies the contents into dest
      `cp -R tpl/ dest`,
      // rm whose targets/cwd come from elsewhere
      `echo ${foreign} | xargs -I % rm %`,
      `xargs rm -f nothere`,
      `git -C ${work} rm victim`,
      // `..` through a symlink resolves physically
      `rm lnk/../outside/victim`,
      // zsh =cmd expansion
      `rm -f =node`,
      // sed scripts that write or execute
      `sed -i 's/a/b/w ${foreign}' ${owned}`,
      `sed -i 's/a/b/e' ${owned}`,
      // GNU cp long flags that change the written path
      `cp --parents ${owned} dest`,
    ]) {
      expect(analyze(cmd, ledger).exempt, cmd).toBe(false);
    }
  });

  it("refuses a hard-linked file and an untrustworthy (linked) ledger", async () => {
    const owned = path.join(work, "own");
    const foreign = path.join(work, "victim");
    await fs.writeFile(foreign, "operator data");
    await fs.link(foreign, owned);
    expect(analyze(`echo x > ${owned}`, [owned]).exempt).toBe(false);

    // A ledger that is a symlink counts as empty — the gate stays.
    await fs.writeFile(path.join(work, "fake.json"), JSON.stringify([foreign]));
    await fs.symlink(path.join(work, "fake.json"), ledgerFile());
    await preApprove();
    await runHook(work, bashEvent(`rm ${foreign}`, work), env());
    expect(await requestRaised()).toBe(true);
  });

  it("denies a literal Bash write onto the ledger, even an ungated append", async () => {
    const res = await runHook(
      work,
      bashEvent(`echo '["/"]' | tee -a ${ledgerFile()}`, work),
      env(),
    );
    expect(res.stdout).toContain('"permissionDecision":"deny"');
  });

  it("does not record a create whose command is still gated (operator may deny it)", async () => {
    await fs.writeFile(path.join(work, "notes.md"), "operator data");
    await preApprove();
    await runHook(work, bashEvent(`echo x > ${work}/new.txt && echo y > notes.md`, work), env());
    expect(await requestRaised()).toBe(true);
    expect(await readLedger()).toEqual([]);
  });

  it("lets plain multi-command sed substitutions through on an owned file (the kb-librarian fix-up)", async () => {
    const owned = path.join(work, "vtt2txt.py");
    await fs.writeFile(owned, "import sys,re");
    const cmd = `sed -i 's/^import sys,re/import sys,re,html/; s/open(dst,.w.).write(.\\\\n.\\.join(out))/open(dst,"w").write(x)/' ${owned}; tail -2 ${owned}`;
    expect(analyze(cmd, [owned]).exempt).toBe(true);
  });

  it("leaves non-file gates (push, PR) untouched even when every path is owned", async () => {
    await preApprove();
    await runHook(work, bashEvent(`echo x > ${work}/new.txt && git push origin main`, work), env());
    expect(await requestRaised()).toBe(true);
  });
});

describe("claude approval hook — free zone (repo + temp dirs)", () => {
  let intentDir: string;
  let repo: string;
  let tmp: string;
  let outside: string;
  const requestRaised = () =>
    fs
      .access(path.join(intentDir, "intent-request.json"))
      .then(() => true)
      .catch(() => false);
  const env = () => ({
    ZIBBY_INTENT_DIR: intentDir,
    ZIBBY_FREE_DIRS: [repo, tmp].join(path.delimiter),
  });
  const preApprove = () =>
    fs.writeFile(path.join(intentDir, "intent-decision.json"), '{"decision":"allow"}', "utf8");
  const analyze = (command: string) =>
    analyzeOwnership(command, { cwd: repo, ledger: [], intentDir, free: [repo, tmp] });

  beforeEach(async () => {
    const mk = async (p: string) => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), p)));
    [intentDir, repo, tmp, outside] = await Promise.all([
      mk("fz-intent-"),
      mk("fz-repo-"),
      mk("fz-tmp-"),
      mk("fz-outside-"),
    ]);
    await fs.mkdir(path.join(tmp, "pr1"));
    await fs.writeFile(path.join(tmp, "pr1", "src.ts"), "old");
    await fs.writeFile(path.join(repo, "a.ts"), "old");
    await fs.writeFile(path.join(outside, "b.ts"), "old");
  });
  afterEach(async () => {
    await Promise.all(
      [intentDir, repo, tmp, outside].map((d) => fs.rm(d, { recursive: true, force: true })),
    );
  });

  it("lets overwrites, moves and deletes inside the repo and temp dirs through", () => {
    expect(analyze(`cd ${tmp}/pr1 && gh api x -H 'A: b' > src.ts; grep -n y src.ts`).exempt).toBe(
      true,
    );
    expect(analyze("echo x > a.ts && mv a.ts c.ts && rm -rf c.ts").exempt).toBe(true);
    expect(analyze(`find ${tmp} -name '*.ts' -delete`).exempt).toBe(true);
    expect(analyze("git clean -fd").exempt).toBe(true);
    expect(analyze(`mkdir -p ${tmp}/new && cd ${tmp}/new && echo x > f`).exempt).toBe(true);
  });

  it("gates any effect reaching outside the zone, even onto a new path", () => {
    expect(analyze(`rm ${outside}/b.ts`).exempt).toBe(false);
    expect(analyze(`echo x > ${outside}/new.txt`).exempt).toBe(false);
    expect(analyze(`cp a.ts ${outside}/`).exempt).toBe(false);
    expect(analyze(`cd ${outside} && echo x > a.ts`).exempt).toBe(false);
    expect(analyze(`find ${outside} -delete`).exempt).toBe(false);
    expect(analyze("pushd /x && rm a.ts").exempt).toBe(false);
  });

  it("asks for a Write outside the zone and stays silent for one inside", async () => {
    const write = (file_path: string) =>
      runHook(
        repo,
        { tool_name: "Write", tool_input: { file_path, content: "x" }, cwd: repo },
        env(),
      );
    const inside = await write(path.join(tmp, "pr1", "src.ts"));
    expect(inside.stdout).toBe("");
    expect(await requestRaised()).toBe(false);

    await preApprove();
    const res = await write(path.join(outside, "b.ts"));
    expect(await requestRaised()).toBe(true);
    expect(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("does not raise a request for a temp-dir overwrite end to end", async () => {
    const res = await runHook(repo, bashEvent(`cd ${tmp}/pr1 && echo x > src.ts`, repo), env());
    expect(res.stdout).toBe("");
    expect(await requestRaised()).toBe(false);
  });
});

describe("classifyEvent — ask_operator (D-ASK)", () => {
  const ask = (question: unknown) =>
    classifyEvent({ tool_name: "mcp__zibby-run__ask_operator", tool_input: { question } }) as {
      action: string;
      context: string;
    };

  it("classifies the question as an operator.question intent", () => {
    const r = ask("  Which env?  ");
    expect(r.action).toBe("operator.question");
    expect(JSON.parse(r.context)).toEqual({
      riskType: "question",
      summary: "Which env?",
      consequence: "The run waits for your answer.",
    });
  });

  it("an empty question is still gated, never fail-open", () => {
    expect(ask("   ").action).toBe("operator.question");
    expect(JSON.parse(ask(undefined).context).summary).toBe("(empty question)");
  });

  it("caps the question at 2000 chars", () => {
    expect(JSON.parse(ask("x".repeat(3000)).context).summary).toHaveLength(2000);
  });
});
