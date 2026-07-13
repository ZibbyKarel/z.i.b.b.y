BATCH: web-app-shell

[SEVERITY: Medium] [FILE: apps/web/features/memory/mutations/useCreateNoteMutation.ts:1] [CATEGORY: Missed pattern]
`useCreateNoteMutation` invalidates `["memory"]` key with boilerplate query-client code; identical pattern to ~40 other mutations but reinvents instead of using `makeInvalidatingMutation`.
Refactor to `makeInvalidatingMutation(apiClient.memory.createNote.useMutation, () => ["memory"])` to match convention.

[SEVERITY: Medium] [FILE: apps/web/features/memory/mutations/useUpdateNoteMutation.ts:1] [CATEGORY: Missed pattern]
`useUpdateNoteMutation` invalidates `["memory"]` key with boilerplate query-client code; same pattern as create-mutation.
Refactor to use `makeInvalidatingMutation` helper.

[SEVERITY: Low] [FILE: apps/web/app (root)] [CATEGORY: Missing boundary]
No `error.tsx` in app root or `(dashboard)` segment — App Router best practice recommends error boundaries at segment boundaries.
Add `app/error.tsx` and optionally `app/(dashboard)/error.tsx`.

[SEVERITY: Low] [FILE: apps/web/state/makeInvalidatingMutation.ts:24] [CATEGORY: Type inference]
Generic `TResult` on the returned hook function is inferred but never explicitly constrained; queries with uncommon response shapes might pass through without static validation.
Add constraint mirroring the `useMutation` return shape for tighter type safety.

STATS: 47 souborů (34 app/ pages/layouts + 5 state + 6 utils + 2 hooks + request.ts + domain.ts), 817 řádků. App shell je celkově čistý — page.tsx soubory jsou tenké wrappery.
