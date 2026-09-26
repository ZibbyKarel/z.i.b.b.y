#!/usr/bin/env node
// ZibbyCorp names gate (ZC-05, roadmap invariant I-6): the retired subsystem
// vocabulary (persona ids + "subsystem") must not come back into code. `ledger`
// is a generic word, so only its use as a department id is checked.
import { execFileSync } from "node:child_process";

const run = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    // git grep exits 1 when nothing matches — that is the pass case.
    if (error.status === 1) return "";
    throw error;
  }
};

const EXCLUDES = [":!tools/migrate/**", ":!tools/check-names.mjs"];
const hits = [
  run([
    "grep", "-nIiP",
    String.raw`\b(forge|puls|sentinel|maestro|beacon|scout|herald|loom|codex|hearth)\b|subsyst|podsyst`,
    "--", "apps", "libs", "tools", ...EXCLUDES,
  ]),
  // LEDGER is also a ZibbyCorp UI *section* (ROUTE-MAP §1) — its section id and
  // nav i18n keys are not the retired department id, so those two homes are exempt.
  run([
    "grep", "-nIP", String.raw`["'\`]ledger["'\`]`, "--", "libs/contracts", "apps/web", ...EXCLUDES,
    ":!apps/web/state/config.ts", ":!apps/web/i18n/messages/**",
  ]),
].filter(Boolean);

if (hits.length > 0) {
  console.error("check:names — retired subsystem names found (use departments / employees):\n");
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("check:names — clean");
