// Token-free stand-in for one pipeline stage. Proves the pipeline machinery
// (per-phase child → handoff file → tester loop → aggregate status) without any
// LLM. Reads its handoff input if present, writes its `produces` file, emits
// PROGRESS lines, and can fail on demand so the back-edge / maxRetries fuse is
// testable.
//
// Usage: node demo-stage.mjs <cwd> <phaseId> <producesRel> [consumesRel]
// Tunables: AGENT_DEMO_STEPS, AGENT_DEMO_DELAY_MS,
//           PIPELINE_DEMO_FAIL_PHASES (comma-separated phase ids that exit 1).

import { mkdir, readFile, writeFile } from "node:fs/promises"
import * as path from "node:path"

const [cwd, phaseId, producesRel, consumesRel] = process.argv.slice(2)
const steps = Number(process.env.AGENT_DEMO_STEPS)
const delayMs = Number(process.env.AGENT_DEMO_DELAY_MS)
const failPhases = (process.env.PIPELINE_DEMO_FAIL_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  console.log(`Stage ${phaseId} starting in ${cwd}`)
  console.log("PROGRESS 0")

  if (consumesRel) {
    const input = await readFile(path.join(cwd, consumesRel), "utf8").catch(() => null)
    if (input !== null) console.log(`Stage ${phaseId} consumed ${consumesRel} (${input.length} bytes)`)
  }

  for (let i = 1; i <= steps; i++) {
    await sleep(delayMs)
    console.log(`PROGRESS ${Math.round((i / steps) * 100)}`)
  }

  if (producesRel) {
    const out = path.join(cwd, producesRel)
    await mkdir(path.dirname(out), { recursive: true })
    await writeFile(out, `output of ${phaseId} @ ${new Date().toISOString()}\n`, "utf8")
    console.log(`Stage ${phaseId} produced ${producesRel}`)
  }

  if (failPhases.includes(phaseId)) {
    console.error(`Stage ${phaseId} failing on purpose (PIPELINE_DEMO_FAIL_PHASES)`)
    process.exit(1)
  }
  console.log("PROGRESS 100")
}

main().catch((err) => {
  console.error(`Stage ${phaseId} crashed: ${err?.message ?? err}`)
  process.exit(1)
})
