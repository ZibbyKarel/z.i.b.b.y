import { bakeoff } from "./bakeoff.ts";
import { doctor } from "./doctor.ts";
import { finalize } from "./finalize.ts";
import { planCheck } from "./plan-check.ts";
import { preflight } from "./preflight.ts";
import { produce } from "./produce.ts";
import { reject } from "./reject.ts";
import { render } from "./render.ts";
import type { Ctx } from "./ctx.ts";

const HELP = `product-factory <command>

  plan check <content-plan.md> [--out plan.json]
  produce <jobs.json> [--report f] [--rounds N] [--pages a-b]
  render [--report f]
  reject <pages e.g. 3,5 (0 = cover)> [--reason text]
  preflight [--report f]
  finalize <listing.md> [--report f]
  doctor
  bakeoff [--prompts f] [--out dir] [--configs model:quantize:steps,...]

Book folder: $PF_BOOK_DIR or $ZIBBY_RUN_DIR/book (default ./book). See README.md.`;

type Command = (argv: string[], ctx: Ctx) => Promise<number>;

export async function main(argv: string[], ctx: Ctx): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return 0;
  }
  const commands: Record<string, Command> = {
    produce,
    reject,
    render,
    preflight,
    finalize,
    doctor,
    bakeoff,
  };
  if (cmd === "plan") {
    if (rest[0] !== "check") throw new Error("usage: product-factory plan check <content-plan.md>");
    return planCheck(rest.slice(1), ctx);
  }
  const run = commands[cmd];
  if (!run) throw new Error(`unknown command "${cmd}" (try --help)`);
  return run(rest, ctx);
}

// Only auto-run as the CLI entry (the shim imports this file; tests import main()).
if (process.argv[1]?.endsWith("product-factory.mjs") || process.argv[1]?.endsWith("cli.ts")) {
  main(process.argv.slice(2), { cwd: process.cwd(), env: process.env }).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(`product-factory: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    },
  );
}
