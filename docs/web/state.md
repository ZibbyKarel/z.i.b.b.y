# State management

## TanStack Query (server state)

Verze: v5  
Vše co přichází ze serveru (API data) je v TanStack Query — žádné global Redux store.

### Konfigurace QueryClient

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s cache před re-fetch
      refetchOnWindowFocus: false, // bez automatického re-fetch při focusu okna
    },
  },
})
```

### Query hooks — konvence

**Soubor:** `features/<domain>/queries/useXxxQuery.ts`

```typescript
// ✅ Vrátí useQuery výsledek přímo — nekouří do bare value
export function useAgentsQuery() {
  return apiClient.agents.list.useQuery(
    getAgentsQueryKey(),
    {},
    { select: selectApiResponseBody },
  )
}

// ✅ Query key exportován pro invalidaci v mutacích
export function getAgentsQueryKey() {
  return ["agents"] as const
}
```

`selectApiResponseBody` (z `state/selectApiResponseBody.ts`) stripuje ts-rest `{ status, body }`
envelope — `data` na call site je přímo body.

Call site:
```typescript
const { data } = useAgentsQuery()
const agents = data ?? []   // call site dodává výchozí hodnotu
```

### Mutation hooks — konvence

**Soubor:** `features/<domain>/mutations/useXxxMutation.ts`

```typescript
// ✅ Vrátí useMutation výsledek přímo
export function useCreateAgentMutation() {
  const queryClient = useQueryClient()
  return apiClient.agents.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getAgentsQueryKey() })
    },
  })
}
```

Call site:
```typescript
const mutation = useCreateAgentMutation()
mutation.mutate({ body: { name, ... } }, { onSuccess: () => navigate(...) })
mutation.isPending   // boolean pro loading state
mutation.error       // chyba
```

**Nikdy:** `{ ...mutation, doThing: () => mutation.mutate(...) }` wrapper.

Hook's `onSuccess` (invalidace) a call-site `onSuccess` oba proběhnou (hook první).
Invalidaci drž v hooku, UI feedback (navigace, toast) na call site.

### Query key konvence

Každý query soubor exportuje `getXxxQueryKey()` vracející konstantní tuple:

```typescript
export const getAgentsQueryKey = () => ["agents"] as const
export const getAgentQueryKey = (id: string) => ["agents", id] as const
export const getAgentRunsQueryKey = (agentId: string) => ["agents", agentId, "runs"] as const
```

Mutace importují key ze query souboru — žádné duplikování string literálů.

## Local UI state

`useState` / `useReducer` pro formuláře, modal open state, vybraný tab apod.
Žádný global store pro UI state.

## RunEventsProvider

**Soubor:** `features/runs/runEvents.tsx`

Provider pro real-time polling run logů:
- Udržuje polling interval pro každý aktivní run
- Poskytuje `useRunLog(runId)` hook → aktuální log chunks + status
- Pull model (opakované GET `/api/.../log?offset=N`) bez SSE

## ts-rest React Query integrace

`apiClient` z `state/api.ts` poskytuje type-safe React Query hooky přes `@ts-rest/react-query`:

```typescript
// Generováno ts-restem z contract
apiClient.agents.list.useQuery(key, queryParams, queryOptions)
apiClient.agents.create.useMutation(mutationOptions)
```

Typy jsou odvozeny přímo z Zod schémat v `@zibby/contracts` — žádný codegen krok.

## Co nepatří do state

- **API data** → TanStack Query (nikdy useState + useEffect na fetch)
- **URL state** → `useSearchParams` + `useRouter` z Next.js
- **Form state** → React Hook Form (přes `@zibby/forms`)
- **Theme** → `DesignSystemProvider` kontext

## Formuláře

Knihovna: `@zibby/forms` (React Hook Form + Zod adaptér)  
DS primitives pro fieldy: `TextInput`, `Select`, `Textarea` z `@zibby/design-system`

```typescript
const form = useForm<CreateAgentInput>({
  resolver: zodResolver(CreateAgentInputSchema),
})
```
