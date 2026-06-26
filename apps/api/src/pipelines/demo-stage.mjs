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

async function main() {
  console.log(`Stage ${phaseId} starting in ${cwd}`);
  console.log("PROGRESS 0");

  if (consumesRel) {
    const input = await readFile(path.join(cwd, consumesRel), "utf8").catch(() => null);
    if (input !== null)
      console.log(`Stage ${phaseId} consumed ${consumesRel} (${input.length} bytes)`);
  }

  // Phase 9: fire the usage-limit line + exit 1 once, BEFORE producing anything (so
  // the work product is never created twice). The marker lives in the stage cwd,
  // which the resume path reuses, so the second attempt skips this and succeeds.
  if (limitPhases.includes(phaseId)) {
    const marker = path.join(cwd, `.limit-fired-${phaseId}`);
    const already = await readFile(marker, "utf8").catch(() => null);
    if (already === null) {
      await writeFile(marker, "1", "utf8");
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
    await mkdir(path.dirname(out), { recursive: true });
    // Phase 45: append a <verdict> tag the runner's qualify gate parses. gapPhases
    // emit `gap` once (marker in the stable stage cwd) then `pass`; driftPhases always
    // emit `drift`. A phase in neither set produces no tag → runner fails closed to gap.
    let verdict = "";
    if (gapPhases.includes(phaseId)) {
      const marker = path.join(cwd, `.verdict-${phaseId}`);
      const already = await readFile(marker, "utf8").catch(() => null);
      verdict = `\n<verdict>${already === null ? "gap" : "pass"}</verdict>\n`;
      if (already === null) await writeFile(marker, "1", "utf8");
    } else if (driftPhases.includes(phaseId)) {
      verdict = `\n<verdict>drift</verdict>\n`;
    }
    await writeFile(out, `output of ${phaseId} @ ${new Date().toISOString()}\n${verdict}`, "utf8");
    console.log(`Stage ${phaseId} produced ${producesRel}`);
  }

  // Phase 4: the designated stage also emits a deterministic learned.md so the
  // recorder can file it as a knowledge note (no LLM, no clock-dependent body).
  if (
    process.env.PIPELINE_DEMO_EMIT_LEARNED &&
    process.env.PIPELINE_DEMO_EMIT_LEARNED === phaseId
  ) {
    const learned = path.join(cwd, "learned.md");
    await writeFile(
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
  console.error(`Stage ${phaseId} crashed: ${err?.message ?? err}`);
  process.exit(1);
});
