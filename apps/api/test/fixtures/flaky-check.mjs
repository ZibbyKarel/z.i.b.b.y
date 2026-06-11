#!/usr/bin/env node
// Deterministic "fails once, then passes" check for the verify-phase e2e: the
// first invocation creates the marker file and exits 1 (red checks); every
// later invocation finds it and exits 0 (green). Mirrors a fix landing between
// verify attempts without any real toolchain.
import { existsSync, writeFileSync } from "node:fs"

const marker = process.argv[2]
if (!marker) {
  console.error("usage: flaky-check.mjs <marker-file>")
  process.exit(2)
}
if (existsSync(marker)) {
  console.log("check passed")
  process.exit(0)
}
writeFileSync(marker, `seen at ${new Date().toISOString()}\n`)
console.error("check failed (first run)")
process.exit(1)
