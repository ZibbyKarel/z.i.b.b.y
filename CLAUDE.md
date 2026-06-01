# z.i.b.b.y — project conventions

Design system + Next.js app. Stack: Next.js 15 App Router, React 19, TanStack Query,
**Tailwind v4** (CSS-first `@theme`), TypeScript, NX monorepo.

---

## Monorepo structure

```
libs/
  design-system/     ← tokens, Provider, primitives, generic components, chrome
apps/
  web/               ← Next.js App Router; imports from DS, never writes its own Tailwind classes
                        domain composites live in apps/web/features/<domain>/components/
  api/               ← Node backend
```

---

## Design system

The DS (`libs/design-system`) is the **default source of UI primitives** for all generated components.
The app composes UI from DS — it does not create its own primitives.

- When a needed primitive **doesn't exist**, decide explicitly: add it to DS, or keep the UI local in the app (domain composite). Never leave the decision implicit.

See `.claude/skills/design-system/SKILL.md` for all DS conventions (tokens, components, Tailwind v4, tests, Storybook, a11y).

---

## Routing

App Router route group `(dashboard)`. Context home/work = `?ctx=work` query param.

- `/` → redirect to `/overview`
- `/(dashboard)/layout.tsx` — server layout: Providers + `DashboardChrome`
- `DashboardChrome` — `"use client"`, reads `useSearchParams()` (under `<Suspense>`), provides `DashboardContext`
- Each page = `page.tsx` in its own segment
- `/pipelines/[id]` — pipeline detail (client, reads `useDashboardStore()`)
- `hrefWithCtx(href, ctx)` — helper that appends `?ctx=` to nav links

---

## i18n (next-intl)

- Locale in cookie, no path prefix: `i18n/request.ts` reads `cookies().get('locale')`
- `NextIntlClientProvider` in root `app/layout.tsx`
- Server: `getTranslations()`, client: `useTranslations()`
- Catalogs: `apps/web/messages/{cs,en}.json`, flat keys `t('Key', { sub: 1 })`
- DS is i18n-agnostic — string props with English defaults; app overrides with `t()`

---

## TanStack Query

Hooks live per-domain in `apps/web/features/<domain>/queries.ts`, not in `libs/`.

---

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess`
- No `any` — use `unknown`, `satisfies`, or generics
- Props interface: `<Component>Props`, always export
- Types next to implementation (not in a separate `types.ts` unless shared)

---

## After each code generation

Run these three commands in order after generating or modifying any code files:

```bash
npm run lint       # ESLint auto-fix (acts as project formatter)
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

Fix all errors before reporting the task as done. Do not skip steps.

---

## Never do

- Write `forwardRef` (React 19 — ref-as-prop)
- Use `any` in TypeScript
- Add query hooks to `libs/` without a clear sharing reason
- Commit `.claude/settings.local.json` (it's in `.gitignore`)

---

## graphify

This project has a graphify knowledge graph at `graphify-out/`.

Rules:

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
