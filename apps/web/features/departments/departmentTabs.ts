/**
 * The `/org/departments/[id]/[tab]` sections (ROUTE-MAP §1). Lives in its own
 * plain (non-`"use client"`) module rather than `DepartmentScreen.tsx`: the
 * owning server page (`app/(company)/org/departments/[id]/[tab]/page.tsx`)
 * needs this array at module init to validate the dynamic segment, and a
 * plain value re-exported from a `"use client"` file is not reliably readable
 * from a server module under the dev bundler's client/server boundary — it
 * can read back as `undefined` (`(DEPARTMENT_TABS as readonly
 * string[]).includes` throwing "not a function") even though a production
 * build works fine. Splitting the pure constant out of the client component
 * file sidesteps the boundary entirely (the same fix ZB-13 applied to
 * `RegistriesScreen`/`Screen` (settings)/`ProjectDetailScreen`).
 */
export const DEPARTMENT_TABS = [
  "team",
  "subtasks",
  "pipelines",
  "handoff",
  "skills",
  "integrations",
  "automations",
  "hooks",
] as const;
export type DepartmentTab = (typeof DEPARTMENT_TABS)[number];
