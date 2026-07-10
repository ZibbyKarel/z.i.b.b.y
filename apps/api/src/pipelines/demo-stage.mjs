// Token-free stand-in for one pipeline stage. Proves the pipeline machinery
// (per-phase child → handoff file → tester loop → aggregate status) without any
// LLM. Reads its handoff input if present, writes its `produces` file, emits
// PROGRESS lines, and can fail on demand so the back-edge / maxRetries fuse is
// testable.
//
// Usage: node demo-stage.mjs <cwd> <phaseId> <producesRel> [consumesRel]
// Tunables: AGENT_DEMO_STEPS, AGENT_DEMO_DELAY_MS,
//           PIPELINE_DEMO_FAIL_PHASES (comma-separated phase ids that exit 1),
//           PIPELINE_DEMO_EMIT_LEARNED (phase id that also writes learned.md, so
//           the memory recorder's delivery trace is exercisable without an LLM),
//           PIPELINE_DEMO_GAP_PHASES (qualify phases that emit <verdict>gap</verdict>
//           once then <verdict>pass</verdict>), PIPELINE_DEMO_DRIFT_PHASES (always
//           emit <verdict>drift</verdict>) — exercising the Phase 45 qualify back-edge.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const [cwd, phaseId, producesRel, consumesRel] = process.argv.slice(2);
const steps = Number(process.env.AGENT_DEMO_STEPS);
const delayMs = Number(process.env.AGENT_DEMO_DELAY_MS);
const failPhases = (process.env.PIPELINE_DEMO_FAIL_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Phase 9: phases that emit the usage-limit line + exit 1 on the FIRST attempt only
// (marker-file in the stage cwd, which is stable across the respawn), so the
// auto-resumed stage succeeds — exercising the pause → resume → finish loop.
const limitPhases = (process.env.PIPELINE_DEMO_LIMIT_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Phase 45: phases that emit a <verdict>gap</verdict> on the FIRST attempt (marker in
// the stable stage cwd), then <verdict>pass</verdict> — exercising the qualify back-edge.
const gapPhases = (process.env.PIPELINE_DEMO_GAP_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Phase 45: phases that ALWAYS emit a <verdict>drift</verdict> — exercising the
// drift → loop.driftTo (re-plan) route. Distinct from gapPhases (which flip to pass).
const driftPhases = (process.env.PIPELINE_DEMO_DRIFT_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Under full-suite CI load (many concurrent NestJS forks, each spawning stage
// children that all touch the filesystem) a bare mkdir/writeFile can transiently
// fail — EMFILE/ENFILE (fd exhaustion), EAGAIN (libuv threadpool saturation), EBUSY.
// A real stage rides that out; the fixture must too. A spurious throw here exits the
// child non-zero, which the runner scores as a stage `error` (not the intended
// pass/gap) — so the qualify/verify back-edge burns a retry on infrastructure noise
// and can PARK a run that should have gone green (the flaky delivery-chain e2e).
// Retry only genuinely transient errno codes; a real error (bad path, ENOSPC) still
// surfaces. This never masks an intentional failure: those exit(1) directly, below.
const TRANSIENT_FS = new Set(["EMFILE", "ENFILE", "EAGAIN", "EBUSY", "ETIMEDOUT"]);
async function withFsRetry(op) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt >= 12 || !TRANSIENT_FS.has(err?.code)) throw err;
      await sleep(10 * (attempt + 1)); // ~10..130ms backoff, <1s worst case
    }
  }
}
const writeFileR = (file, data, opts) => withFsRetry(() => writeFile(file, data, opts));
const mkdirR = (dir, opts) => withFsRetry(() => mkdir(dir, opts));
// A "fired once" marker read: ENOENT means genuinely absent (first attempt); a
// transient error is retried; anything else throws rather than silently reading as
// absent (which would wrongly re-gap / re-fire on every dispatch).
async function readMarker(marker) {
  try {
    return await withFsRetry(() => readFile(marker, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

// "Fired once" markers must survive a re-dispatch of the same phase. Stage
// sandboxes are numbered per dispatch (P1-T1: 01_developer, 03_developer, …),
// so the stage cwd is NOT stable across a loop back-edge or a limit resume —
// the run root (its parent) is.
const runRoot = path.dirname(cwd);

async function main() {
  console.log(`Stage ${phaseId} starting in ${cwd}`);
  console.log("PROGRESS 0");

  if (consumesRel) {
    const input = await readFile(path.join(cwd, consumesRel), "utf8").catch(() => null);
    if (input !== null)
      console.log(`Stage ${phaseId} consumed ${consumesRel} (${input.length} bytes)`);
  }

  // Phase 9: fire the usage-limit line + exit 1 once, BEFORE producing anything (so
  // the work product is never created twice). The marker lives in the run root,
  // which every re-dispatch shares, so the second attempt skips this and succeeds.
  if (limitPhases.includes(phaseId)) {
    const marker = path.join(runRoot, `.limit-fired-${phaseId}`);
    const already = await readMarker(marker);
    if (already === null) {
      await writeFileR(marker, "1", "utf8");
      const reset = Math.floor(Date.now() / 1000) + 2;
      console.error(`Claude AI usage limit reached|${reset}`);
      process.exit(1);
    }
  }

  for (let i = 1; i <= steps; i++) {
    await sleep(delayMs);
    console.log(`PROGRESS ${Math.round((i / steps) * 100)}`);
  }

  if (producesRel) {
    const out = path.join(cwd, producesRel);
    await mkdirR(path.dirname(out), { recursive: true });
    // Phase 45: append a <verdict> tag the runner's qualify gate parses. gapPhases
    // emit `gap` once (marker in the stable run root) then `pass`; driftPhases always
    // emit `drift`. A phase in neither set produces no tag → runner fails closed to gap.
    let verdict = "";
    if (gapPhases.includes(phaseId)) {
      const marker = path.join(runRoot, `.verdict-${phaseId}`);
      const already = await readMarker(marker);
      verdict = `\n<verdict>${already === null ? "gap" : "pass"}</verdict>\n`;
      if (already === null) await writeFileR(marker, "1", "utf8");
    } else if (driftPhases.includes(phaseId)) {
      verdict = `\n<verdict>drift</verdict>\n`;
    }
    await writeFileR(out, `output of ${phaseId} @ ${new Date().toISOString()}\n${verdict}`, "utf8");
    console.log(`Stage ${phaseId} produced ${producesRel}`);
  }

  // Phase 4: the designated stage also emits a deterministic learned.md so the
  // recorder can file it as a knowledge note (no LLM, no clock-dependent body).
  if (
    process.env.PIPELINE_DEMO_EMIT_LEARNED &&
    process.env.PIPELINE_DEMO_EMIT_LEARNED === phaseId
  ) {
    const learned = path.join(cwd, "learned.md");
    await writeFileR(
      learned,
      `# Learned\n\n- Demo learning from stage ${phaseId}: the delivery loop runs end to end.\n`,
      "utf8",
    );
    console.log(`Stage ${phaseId} produced learned.md`);
  }

  if (failPhases.includes(phaseId)) {
    console.error(`Stage ${phaseId} failing on purpose (PIPELINE_DEMO_FAIL_PHASES)`);
    process.exit(1);
  }
  console.log("PROGRESS 100");
}

main().catch((err) => {
  // Surface the errno so a genuine crash (as opposed to an intentional exit(1)) is
  // diagnosable from the stage log — transient FS errors are already retried above.
  console.error(`Stage ${phaseId} crashed: ${err?.code ?? ""} ${err?.message ?? err}`);
  process.exit(1);
});
