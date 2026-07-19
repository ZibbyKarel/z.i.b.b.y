# State management

## TanStack Query (server state)

Version: v5
Everything that comes from the server (API data) lives in TanStack Query — no
global Redux store.

### QueryClient configuration

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s cache before re-fetch
      refetchOnWindowFocus: false, // no automatic re-fetch on window focus
    },
  },
  // Global mutation-error surfacing (Phase 43): any failed mutation — network,
  // server, or contract-schema-drift — emits a toast via toastBus.
  mutationCache: new MutationCache({
    onError: () => toastBus.emit(),
  }),
});
```

### Query hooks — conventions

**File:** `features/<domain>/queries/useXxxQuery.ts`

```typescript
// ✅ Returns the useQuery result directly — never unwrapped to a bare value
export function useAgentsQuery() {
  return apiClient.agents.listAgents.useQuery({
    queryKey: getAgentsQueryKey(),
    select: selectApiResponseBody,
  });
}

// ✅ Query key exported so mutations can invalidate it
export function getAgentsQueryKey() {
  return ["agents"] as const;
}
```

`selectApiResponseBody` (from `state/selectApiResponseBody.ts`) strips the
ts-rest `{ status, body }` envelope — `data` at the call site is the body
directly.

Call site:

```typescript
const { data } = useAgentsQuery();
const agents = data ?? []; // call site supplies its own default
```

### Mutation hooks — conventions

**File:** `features/<domain>/mutations/useXxxMutation.ts`

**Default: `makeInvalidatingMutation`.** Most mutations (56 hooks, the
dominant pattern) are a ts-rest mutation whose only success side effect is
invalidating one query-key family — the shared shape lives in
`state/makeInvalidatingMutation.ts` so the ~40+ hooks stop hand-rolling it:

```typescript
// ✅ The default shape: one ts-rest route + one query key to invalidate
import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

export const useCreateAgentMutation = makeInvalidatingMutation(
  apiClient.agents.createAgent.useMutation,
  getAgentsQueryKey,
);
```

`makeInvalidatingMutation(useRouteMutation, getKey)` returns a hook that
calls `useQueryClient()` and wires `onSuccess` to invalidate `getKey()` —
the returned hook still returns the `useMutation` result directly, so call
sites are unaffected either way.

**Escape hatch: hand-written `onSuccess`.** Reach for a plain
`apiClient.<domain>.<op>.useMutation({ onSuccess: ... })` (with your own
`useQueryClient()`) only when the invalidation doesn't fit "one zero-arg key
getter" — e.g.:

- **Multiple keys to invalidate** — `useCreateTaskMutation` refreshes the
  unified runs feed, the running-agents list _and_ the scheduled-task queue;
  `useGenerateBriefingMutation` refreshes the briefing key and the activity
  feed.
- **A key that depends on the mutation's variables** — `useUpdateCommandMutation`
  reads the updated `id` off `onSuccess`'s second argument to invalidate both
  the list and that single command's own key; `useCloneProjectMutation` does
  the same for a cloned project's id.
- **A broader/prefix invalidation** — `useCreateNoteMutation` invalidates the
  whole `["memory"]` key (graph + any open note + search) in one move, wider
  than any single `getXxxQueryKey()`.
- **A cross-domain key that isn't itself a zero-arg getter** — several
  `runs`-adjacent mutations (`useDeleteAgentRunMutation`,
  `useResumeGoalRunMutation`) invalidate `allTaskRunsKey`, a shared constant
  rather than a `getKey()` function.

```typescript
// ✅ Escape hatch: multiple keys, one keyed off the mutation's own variables
export function useUpdateCommandMutation() {
  const qc = useQueryClient();
  return apiClient.commands.updateCommand.useMutation({
    onSuccess: (_data, { params: { id } }) => {
      qc.invalidateQueries({ queryKey: getCommandsQueryKey() });
      qc.invalidateQueries({ queryKey: getCommandQueryKey(id) });
    },
  });
}
```

Call site (identical either way):

```typescript
const mutation = useCreateAgentMutation()
mutation.mutate({ body: { name, ... } }, { onSuccess: () => navigate(...) })
mutation.isPending   // boolean for loading state
mutation.error       // error, if any
```

**Never:** a `{ ...mutation, doThing: () => mutation.mutate(...) }` wrapper.

The hook's own `onSuccess` (invalidation) and a call-site `onSuccess` both
fire (hook first). Keep invalidation in the hook; keep UI feedback
(navigation, toast) at the call site.

### Query key conventions

Every query file exports a `getXxxQueryKey()` returning a constant tuple:

```typescript
export const getAgentsQueryKey = () => ["agents"] as const;
export const getAgentQueryKey = (id: string) => ["agents", id] as const;
export const getAgentRunsQueryKey = (agentId: string) => ["agents", agentId, "runs"] as const;
```

Mutations import the key from the query file — no duplicated string
literals.

## Local UI state

`useState` / `useReducer` for forms, modal open state, selected tab, and
similar. No global store for UI state.

## RunEventsProvider — unified SSE channel

**File:** `features/runs/runEvents.tsx`

`RunEventsProvider` opens a single `EventSource` to the API's multiplexed
`GET /api/events` endpoint and turns each event into a targeted query
invalidation, rather than polling:

- Merges five scopes into one stream: `agent-runs`, `pipeline-runs`,
  `goal-runs`, `channel-items`, `activity`
- Each event is a thin signal (`{ scope, runId, status }` or, for the
  activity scope, `{ scope: "channel-items"/"activity", ... }` with the full
  entry) — "this family changed, refetch"; the channel is not the source of
  truth, the list endpoints are
- `useRunEventsConnected()` exposes whether the channel is currently
  connected. While connected, the individual run queries drop their own
  polling intervals and rely on stream-driven invalidation; when disconnected
  (no provider, SSE blocked by a proxy, mid-reconnect) they fall back to
  their original self-gating polls, so the dashboard degrades gracefully
  instead of going stale
- `EventSource` handles reconnection itself (resuming via `Last-Event-ID`);
  the provider only tracks connectivity
- Mounted once, high in the tree (`app/providers.tsx`)

This is the concrete implementation of the "SSE for live streams, polling for
state" DNA rule — see `docs/api/events.md` for the server side of the channel.

## ts-rest React Query integration

`apiClient` from `state/api.ts` provides type-safe React Query hooks via
`@ts-rest/react-query`:

```typescript
// Generated by ts-rest from the contract — one options object, not positional args
apiClient.agents.listAgents.useQuery({ queryKey, ...queryParams, ...queryOptions });
apiClient.agents.createAgent.useMutation(mutationOptions);
```

Types are derived directly from the Zod schemas in `@zibby/contracts` — no
codegen step.

## What doesn't belong in state

- **API data** → TanStack Query (never `useState` + `useEffect` for fetching)
- **URL state** → `useSearchParams` + `useRouter` from Next.js
- **Routes** → statically typed via Next's `typedRoutes: true`
  (`next.config.mjs`). Route constants (`state/config.ts` — `NAV_ITEMS`,
  `SETTINGS_ITEM`, …) have an `href` of type `Route` from `next`, so a typo in
  `<Link href>` / `router.push()` fails `tsc`. Types are generated into
  `.next/types` (`next typegen` or any dev/build run); non-literal strings
  built from contract values are cast `as Route`.
- **Form state** → React Hook Form (via `@zibby/forms`)
- **Theme** → `DesignSystemProvider` context

## Forms

Library: `@zibby/forms` (React Hook Form + a Zod adapter)
DS field primitives: the `form/` components in `@zibby/design-system`
(`TextInputField`, `SelectField`, `TextAreaField`, `ToggleField`, and the
rest — see `docs/libs/design-system.md`)

```typescript
const form = useForm<CreateAgentInput>({
  resolver: zodResolver(CreateAgentInputSchema),
});
```
