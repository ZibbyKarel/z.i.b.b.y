import type { HandoffRule } from "@zibby/contracts";
import type { DropdownTone } from "@zibby/design-system";

/** Tier → tone, mirroring the autonomy contract's own colors (silent = ok,
 * act-then-report = run, surface-and-wait = warn). Shared between the read-only
 * `HandoffRuleRow` (a `Tag`) and the editable `HandoffRuleEditor` (a toned
 * `Dropdown`) so a rule's tier reads the same color in both states. */
export const TIER_TONE: Record<HandoffRule["tier"], DropdownTone> = {
  1: "ok",
  2: "run",
  3: "warn",
};
