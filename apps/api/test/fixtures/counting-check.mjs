#!/usr/bin/env node
// Deterministic "fails N times, then passes" verifier for the goal-loop e2e: a
// marker file holds the invocation count. Exits 1 (red) until it has failed
// `failTimes` times, then exits 0 (green) on every later run. Mirrors a fix
// landing after a few iterations without any real toolchain.
//
// usage: counting-check.mjs <marker-file> <failTimes>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const marker = process.argv[2];
const failTimes = Number(process.argv[3] ?? "1");
if (!marker) {
  console.error("usage: counting-check.mjs <marker-file> <failTimes>");
  process.exit(2);
}
const seen = existsSync(marker) ? Number(readFileSync(marker, "utf8").trim() || "0") : 0;
const next = seen + 1;
writeFileSync(marker, `${next}\n`);
if (next > failTimes) {
  console.log(`check passed (invocation ${next})`);
  process.exit(0);
}
console.error(`check failed (invocation ${next} of ${failTimes})`);
process.exit(1);
