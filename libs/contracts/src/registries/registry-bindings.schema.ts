import { z } from "zod";
import { DepartmentIdSchema } from "../departments/department.schema";

/** The four global-library kinds shown at `/system/registries/[kind]` (ZB-11). */
export const RegistryKindSchema = z.enum(["skills", "mcp", "hooks", "commands"]);
export type RegistryKind = z.infer<typeof RegistryKindSchema>;

/**
 * A registry item's "Bound in" department list, keyed by item id.
 *
 * O-09 — derived, read-only, no new FK: a registry item is "bound in" the
 * departments whose agents (or pipelines, transitively via their agent) use it.
 * `mcp` bindings are read directly off each active agent's `tools` /
 * `optionalTools` grants (an `mcp__<id>__*` / bare `<id>` entry). `skills`,
 * `hooks` and `commands` carry no per-agent reference at all today — the runner
 * materializes every enabled one into EVERY run (`claude-run-command.service.ts`
 * `buildCatalog` / the hooks/commands materializers) — so their honest derived
 * answer is "every department with at least one active employee", not a
 * per-item subset. See `docs/plans/zibbycorp/OPEN-QUESTIONS.md` O-09.
 */
export const RegistryBindingsSchema = z.object({
  skills: z.record(z.string(), z.array(DepartmentIdSchema)),
  mcp: z.record(z.string(), z.array(DepartmentIdSchema)),
  hooks: z.record(z.string(), z.array(DepartmentIdSchema)),
  commands: z.record(z.string(), z.array(DepartmentIdSchema)),
});
export type RegistryBindings = z.infer<typeof RegistryBindingsSchema>;
