// Each project owns its environment: the design-system runs under jsdom + React,
// while contracts and the NestJS api run under node (the api adds SWC so NestJS
// decorator metadata is emitted). `npm test` (vitest run) executes them all.
const projects = [
  "./libs/design-system/vitest.config.ts",
  "./libs/contracts/vitest.config.ts",
  "./apps/api/vitest.config.ts",
]

export default projects
