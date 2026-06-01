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
