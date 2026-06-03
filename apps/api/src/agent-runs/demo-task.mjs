// Token-free stand-in task for the agent runner. Proves the whole run pipeline
// (spawn → capture stdout → persist to a log file → track as running → stop)
// without invoking any LLM. It is what "Agent 007" executes in demo mode; a real
// `claude` CLI executor is a future, pluggable strategy. The runner parses the
// `PROGRESS <n>` lines below to drive the dashboard progress bar.
//
// Usage: node demo-task.mjs <workingDir>
// Tunable for tests via AGENT_DEMO_STEPS and AGENT_DEMO_DELAY_MS.

import { writeFile } from "node:fs/promises"
import * as path from "node:path"

const workDir = process.argv[2] ?? process.cwd()
const steps = Number(process.env.AGENT_DEMO_STEPS ?? 6)
const delayMs = Number(process.env.AGENT_DEMO_DELAY_MS ?? 500)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  console.log(`Agent 007 reporting for duty.`)
  console.log(`Working folder: ${workDir}`)
  console.log("PROGRESS 0")

  // The "simple task": leave a file behind in the folder we were given.
  const marker = path.join(workDir, "agent-007-was-here.txt")
  await writeFile(marker, `Agent 007 ran at ${new Date().toISOString()}\n`, "utf8")
  console.log(`Created ${marker}`)

  for (let i = 1; i <= steps; i++) {
    await sleep(delayMs)
    const pct = Math.round((i / steps) * 100)
    console.log(`Step ${i}/${steps} complete.`)
    console.log(`PROGRESS ${pct}`)
  }

  console.log("Mission accomplished. Signing off.")
  console.log("PROGRESS 100")
}

main().catch((err) => {
  console.error(`Agent 007 failed: ${err?.message ?? err}`)
  process.exit(1)
})
