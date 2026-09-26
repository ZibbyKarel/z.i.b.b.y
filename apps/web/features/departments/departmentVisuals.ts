import type { DepartmentId } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";

/**
 * The shared visual vocabulary of a department: which glyph carries its
 * identity. (Formerly also mapped `DepartmentState` to an immersive orb
 * state for the deleted orb map — `DEPARTMENT_ORB_STATE` was removed in
 * ZB-13 along with its only consumer.)
 */

/** One glyph per department identity — verified present in the DS icon set
 * (`libs/design-system/src/assets/icons`). */
export const DEPARTMENT_GLYPH: Record<DepartmentId, IconName> = {
  dev: "code",
  com: "link",
  sec: "shield",
  rnd: "compass",
  rel: "checkpoint",
  inc: "warn",
  ops: "pulse",
  qa: "search",
  knw: "brain",
  fin: "dollar",
  per: "coffee",
};
