import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { IsoDateTimeSchema } from "../common.schema";
import { DepartmentIdSchema } from "../departments/department.schema";

/**
 * Allowed shape of an employee/employee-name `id` — same filename-safe
 * restriction as `AgentIdSchema` (an employee is persisted as `employees/<id>.json`,
 * a name pool entry lives inside the single `employee-names.json` manifest but
 * keeps the same id shape for consistency).
 */
export const EMPLOYEE_ID_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

export const EmployeeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(EMPLOYEE_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

export const EmployeeNameIdSchema = EmployeeIdSchema;

/** `active` holds the lease-eligible pool; `fired` is a kept, read-only archive. */
export const EmployeeStatusSchema = z.enum(["active", "fired"]);
export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>;

/**
 * D-015 — an employee is a hired INSTANCE of an agent (the position): a process
 * to the agent's program. Its identity is its name + live state + run history;
 * its prompt and memory are inherited from the position (`agentId`), so there is
 * no per-employee memory field here. Belongs to exactly one department. Firing is
 * soft (`status: "fired"`) — the record (and its run history, elsewhere) stays as
 * an archive; the name it held returns to the pool (`EmployeeName.employeeId`
 * cleared).
 */
export const EmployeeSchema = z.object({
  id: EmployeeIdSchema,
  name: z.string().min(1).max(64),
  /** The position this employee holds — a stored agent id. */
  agentId: AgentIdSchema,
  department: DepartmentIdSchema,
  status: EmployeeStatusSchema,
  hiredAt: IsoDateTimeSchema,
  firedAt: IsoDateTimeSchema.optional(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

/**
 * Body accepted by `hireEmployee` (`POST /api/departments/:id/employees`). `name`
 * is optional — a random free name from the pool is used when omitted. The
 * department comes from the path, not the body.
 */
export const CreateEmployeeSchema = z.object({
  agentId: AgentIdSchema,
  name: z.string().min(1).max(64).optional(),
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

/**
 * Body accepted by `updateEmployee` — rename (must pick a free name) and/or move
 * department. `agentId`/`status` are not editable through this route (status
 * changes only through hire/fire).
 */
export const UpdateEmployeeSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  department: DepartmentIdSchema.optional(),
});
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

/**
 * A name-pool entry. `employeeId` is set while an active employee holds the
 * name — absent means the name is free to hire with. The pool is a small,
 * operator-editable "table" (System → Registries → Names), not a closed enum:
 * CRUD lives on `employee-names.json`.
 */
export const EmployeeNameSchema = z.object({
  id: EmployeeNameIdSchema,
  name: z.string().min(1).max(64),
  employeeId: EmployeeIdSchema.optional(),
});
export type EmployeeName = z.infer<typeof EmployeeNameSchema>;

export const CreateEmployeeNameSchema = z.object({ name: z.string().min(1).max(64) });
export type CreateEmployeeNameInput = z.infer<typeof CreateEmployeeNameSchema>;

export const UpdateEmployeeNameSchema = z.object({ name: z.string().min(1).max(64).optional() });
export type UpdateEmployeeNameInput = z.infer<typeof UpdateEmployeeNameSchema>;

/**
 * The O-04 agent-state vocabulary (`docs/plans/zibbycorp/OPEN-QUESTIONS.md`),
 * reused for an employee's derived state rather than invented fresh — an
 * employee IS the thing O-04 describes, now that a position is staffed by
 * instances instead of being the runnable unit itself. `EmployeesService`
 * derives it server-side (unlike O-04's client-side `deriveAgentState`) because
 * the input — the in-memory `EmployeeAllocator` lease table — never reaches the
 * client on its own.
 */
export const EmployeeStateSchema = z.enum([
  "working",
  "thinking",
  "blocked",
  "error",
  "done",
  "idle",
]);
export type EmployeeState = z.infer<typeof EmployeeStateSchema>;

/**
 * An employee's position, projected for display: the agent's name and a
 * best-effort "title". `Agent` carries no dedicated `title` field yet (see
 * `docs/plans/zibbycorp/OPEN-QUESTIONS.md` O-03, additive and out of this
 * phase's scope) — `title` is filled from the agent's `category` in the
 * meantime, which is the closest existing "what this position does" label.
 */
export const EmployeePositionSchema = z.object({
  id: AgentIdSchema,
  name: z.string(),
  title: z.string().optional(),
});
export type EmployeePosition = z.infer<typeof EmployeePositionSchema>;

/**
 * An employee plus everything the roster/detail UI needs to render it without a
 * second round trip: its derived `state`, the run it is currently leased to
 * (when working/blocked), the title of that run's task (when known), and its
 * position's display shape.
 */
export const EmployeeWithStateSchema = EmployeeSchema.extend({
  state: EmployeeStateSchema,
  currentRunId: z.string().optional(),
  currentTaskTitle: z.string().optional(),
  position: EmployeePositionSchema,
});
export type EmployeeWithState = z.infer<typeof EmployeeWithStateSchema>;

/** Query accepted by `listEmployees` — every filter optional and combinable (AND). */
export const EmployeeQuerySchema = z.object({
  department: DepartmentIdSchema.optional(),
  agentId: AgentIdSchema.optional(),
  status: EmployeeStatusSchema.optional(),
});
export type EmployeeQuery = z.infer<typeof EmployeeQuerySchema>;
