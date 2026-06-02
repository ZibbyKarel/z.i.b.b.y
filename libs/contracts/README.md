# @zibby/contracts

The **single source of truth** for our internal HTTP APIs, built with
[ts-rest](https://ts-rest.com) + [Zod](https://zod.dev).

There is **no codegen step**. The contract is a plain TypeScript object with Zod
schemas. The NestJS backend (`apps/api`) implements it through `@ts-rest/nest`,
and a future frontend can consume the same object with a `@ts-rest` client —
types flow end-to-end through inference. Change a schema here and the consumers
fail to type-check until they are updated.

```
import { agentsContract, type Agent } from "@zibby/contracts"
```

## Agent model

An agent is `{ id, description?, instructions }`. The `id` is the agent's name
and is used as the file name. The backend persists each agent as a Markdown file
`<id>.md` (Claude skill/agent style): YAML frontmatter (`name`, `description`)
plus the `instructions` as the Markdown body, e.g.

```md
---
name: code-reviewer
description: Reviews pull requests for correctness and style
---

You are a meticulous senior engineer. Review diffs for bugs and clarity.
```

HTTP requests/responses are still JSON — the Markdown shape is a storage detail.

## Layout

- `src/agent.schema.ts` — Zod schemas + inferred types (`Agent`, `CreateAgentInput`, …)
- `src/agents.contract.ts` — `c.router({...})` wiring schemas to routes
- `src/index.ts` — public barrel

Routes are mounted under the `/api` prefix (`pathPrefix` in the router options).

## How to add a new endpoint

1. **Model the data** in `src/agent.schema.ts` (or a new `*.schema.ts` file):
   add/extend the Zod schemas and `z.infer` the TypeScript types.
2. **Add the route** to `agentsContract` in `src/agents.contract.ts`:

   ```ts
   archiveAgent: {
     method: "POST",
     path: "/agents/:id/archive",
     pathParams: z.object({ id: AgentIdSchema }),
     body: z.object({ reason: z.string().optional() }),
     responses: {
       200: AgentSchema,
       404: ErrorSchema,
     },
     summary: "Archive an agent",
   },
   ```

   Always declare the full set of `responses`, including error statuses
   (`404`, `409`, …) — they become part of the type-safe response union.
3. **Export** any new schemas/types from `src/index.ts`.
4. **Implement it** in `apps/api` (`src/agents/agents.controller.ts`). The
   `tsRestHandler(agentsContract, { ... })` object will now show a TypeScript
   error until the new key is implemented.
5. **Cover it** with a contract test (`*.test.ts`) and an e2e test in `apps/api`.

Run `npm run test` (or `npx vitest run --project contracts`) to check the
contract in isolation.

## How to add a whole new resource (new module)

The steps above extend an existing resource. For a brand-new concern — a new
`*.contract.ts` that is not part of `agentsContract` — you also wire a new NestJS
module. The health endpoint is the reference example; follow its shape:

1. **Contract** — `src/<name>.schema.ts` + `src/<name>.contract.ts`
   (`c.router({...}, { pathPrefix: "/api", strictStatusCodes: true })`), exported
   from `src/index.ts`. See `health.schema.ts` / `health.contract.ts`.
2. **Controller** — `apps/api/src/<name>/<name>.controller.ts`, a `@Controller()`
   with one `@TsRestHandler(<name>Contract)` method returning
   `tsRestHandler(<name>Contract, { ... })`. See `health.controller.ts`.
3. **Module** — `apps/api/src/<name>/<name>.module.ts` declaring the controller
   (and any providers/services), then **register it** in
   `apps/api/src/app.module.ts` `imports: [...]`. A controller that isn't in a
   registered module is never mounted. See `health.module.ts`.
4. **Docs** — add the contract to the composed `apiContract` router in
   `apps/api/src/main.ts` so it appears in the generated OpenAPI at `/docs`.
   Children keep their own `/api` prefix; the parent adds none.
5. **Tests** — a contract test in `libs/contracts` and an e2e test in
   `apps/api/test/` (`Test.createTestingModule({ imports: [AppModule] })`, then
   `supertest`). See `health.contract.test.ts` and `test/health.e2e.test.ts`.

Then run the project's standard checks: `npm run lint && npm run typecheck && npm run test`.
