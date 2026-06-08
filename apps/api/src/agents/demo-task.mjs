// Token-free stand-in task for the agent runner. Proves the whole run pipeline
// (spawn → capture stdout → persist to a log file → track as running → stop)
// without invoking any LLM. It is what "Agent 007" executes in demo mode; a real
// `claude` CLI executor is a future, pluggable strategy. The runner parses the
// `PROGRESS <n>` lines below to drive the dashboard progress bar.
//
// Variant B mid-run gate: when AGENT_DEMO_INTENT carries a JSON IntendedAction, the
// task announces it with an `INTENT {json}` line partway through and then BLOCKS
// until the runner writes `intent-decision.json` into the working folder. On
// `allow` it performs the gated effect (a second marker file); on `deny` it aborts
// with a non-zero exit. With AGENT_DEMO_INTENT unset it behaves as a plain run.
//
// Usage: node demo-task.mjs <workingDir>
// Tunable for tests via AGENT_DEMO_STEPS, AGENT_DEMO_DELAY_MS and AGENT_DEMO_INTENT.

import { readFile, rm, writeFile } from "node:fs/promises"
import * as path from "node:path"

const workDir = process.argv[2] ?? process.cwd()
const steps = Number(process.env.AGENT_DEMO_STEPS)
const delayMs = Number(process.env.AGENT_DEMO_DELAY_MS)
const intent = process.env.AGENT_DEMO_INTENT

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll the runner's decision file (set by the gate) until it appears or we time out. */
async function waitForDecision() {
  const file = path.join(workDir, "intent-decision.json")
  const deadline = Date.now() + 10 * 60 * 1000
  for (;;) {
    const raw = await readFile(file, "utf8").catch(() => null)
    if (raw !== null) {
      // Consume it so a later INTENT in the same run waits for a fresh decision.
      await rm(file, { force: true }).catch(() => {})
      try {
        return JSON.parse(raw).decision === "allow" ? "allow" : "deny"
      } catch {
        return "deny"
      }
    }
    if (Date.now() > deadline) return "deny"
    await sleep(200)
  }
}

/** Run `count` progress steps over the [from, to) step range, logging PROGRESS. */
async function runSteps(from, to) {
  for (let i = from; i <= to; i++) {
    await sleep(delayMs)
    const pct = Math.round((i / steps) * 100)
    console.log(`Step ${i}/${steps} complete.`)
    console.log(`PROGRESS ${pct}`)
  }
}

async function main() {
  console.log(`Agent 007 reporting for duty.`)
  console.log(`Working folder: ${workDir}`)
  console.log("PROGRESS 0")

  // The benign "simple task": leave a marker file in the folder we were given. This
  // always happens — it is not the gated, external-effect action.
  const marker = path.join(workDir, "agent-007-was-here.txt")
  await writeFile(marker, `Agent 007 ran at ${new Date().toISOString()}\n`, "utf8")
  console.log(`Created ${marker}`)

  // First half of the work runs unconditionally.
  const half = Number.isFinite(steps) ? Math.floor(steps / 2) : 0
  await runSteps(1, half)

  if (intent) {
    // Announce the external-effect action and block on the runner's decision.
    process.stdout.write(`INTENT ${intent}\n`)
    const decision = await waitForDecision()
    if (decision !== "allow") {
      console.error("Intended action denied — aborting.")
      process.exit(1)
    }
    // The gated effect happens only once allowed: a second, distinct marker file.
    const receipt = path.join(workDir, "payment-done.txt")
    await writeFile(receipt, `Action executed at ${new Date().toISOString()}\n`, "utf8")
    console.log(`Created ${receipt}`)
  }

  // Remaining work after the gate.
  await runSteps(half + 1, Number.isFinite(steps) ? steps : 0)

  console.log("Mission accomplished. Signing off.")
  console.log("PROGRESS 100")
}

main().catch((err) => {
  console.error(`Agent 007 failed: ${err?.message ?? err}`)
  process.exit(1)
})
