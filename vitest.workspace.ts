// Each project owns its environment: the design-system runs under jsdom + React,
// while contracts and the NestJS api run under node (the api adds SWC so NestJS
// decorator metadata is emitted). The `web` project runs node and is scoped to
// the i18n catalog checks only (its component tests stay out — see its config).
// `web-components` runs apps/web's component tests under jsdom + React, scoped to
// components/** so the legacy feature tests stay out.
// `npm test` (vitest run) executes them all.
const projects = [
  "./libs/design-system/vitest.config.ts",
  "./libs/forms/vitest.config.ts",
  "./libs/contracts/vitest.config.ts",
  "./apps/api/vitest.config.ts",
  "./apps/web/vitest.config.ts",
  "./apps/web/vitest.components.config.ts",
]

export default projects
