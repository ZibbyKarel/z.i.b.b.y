import { analyze } from "./analyze.ts";
import { decide } from "./decide.ts";
import { prepare } from "./prepare.ts";
import { render } from "./render.ts";
import { savings } from "./savings.ts";
import type { Ctx } from "./ctx.ts";

const HELP = `spend-audit <command>

  prepare <extract.jsonl>     validate, reconcile, dedupe, anonymise -> merchants.md
  analyze <categories.json>   deterministic analyses -> findings.md
  decide  <needs.md>          operator decisions -> research-brief.md
  savings <refuted.md>        savings tiers -> digest.md
  render  <advice.md>         final report -> report.md

State dir: $ZIBBY_RUN_DIR/spend (default ./spend). Output file is written into the cwd.
Env: SPEND_HOUSEHOLD_ACCOUNTS (comma list of raw account numbers flagged as household transfers).
Invalid input: exit 1, message on stderr and in the output file.`;

type Command = (argv: string[], ctx: Ctx) => Promise<number>;

export async function main(argv: string[], ctx: Ctx): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return 0;
  }
  const commands: Record<string, Command> = {
    prepare,
    analyze: (a, c) => analyze(a, c),
    decide,
    savings,
    render,
  };
  const run = commands[cmd];
  if (!run) throw new Error(`unknown command "${cmd}" (try --help)`);
  return run(rest, ctx);
}

// Only auto-run as the CLI entry (the shim imports this file; tests import main()).
if (process.argv[1]?.endsWith("spend-audit.mjs") || process.argv[1]?.endsWith("cli.ts")) {
  main(process.argv.slice(2), { cwd: process.cwd(), env: process.env }).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(`spend-audit: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    },
  );
}
