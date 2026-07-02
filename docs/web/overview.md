# Web aplikace — přehled

**Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Tailwind v4, next-intl  
**Port:** 3000  
**Entry point:** `apps/web/app/layout.tsx`

## Routing (App Router)

```
app/
├── layout.tsx              Root server layout
├── page.tsx                Landing → redirect na /overview
├── globals.css             Globální CSS (minimální)
└── (dashboard)/            Route group — dashboard shell
    ├── layout.tsx          Dashboard server layout (AppShell)
    ├── loading.tsx         Suspense fallback
    ├── agents/
    │   ├── page.tsx        Katalog agentů
    │   └── [id]/page.tsx   Detail agenta (editace, pravidla, used-by; N4c)
    ├── hooks/[id]/page.tsx Detail hooku (editace; N4e — mcp/[id] stejně)
    ├── automations/
    │   ├── page.tsx        Automatizace
    │   └── [id]/page.tsx   Detail automatizace (editace, run-now, delete; N4f)
    ├── gates/page.tsx      Gate pravidla
    ├── memory/page.tsx     Vault browser
    ├── overview/page.tsx   Přehled (briefing + aktivita)
    ├── pipelines/
    │   ├── page.tsx        Seznam pipelines
    │   └── [id]/page.tsx   Detail pipeline + history runů
    ├── projects/
    │   ├── page.tsx        Portfolio projektů
    │   ├── [id]/page.tsx   Detail projektu (tým, autonomie, integrace + inbox)
    │   └── [id]/integrations/[integrationId]/page.tsx  Detail integrace (N4h)
    ├── runs/page.tsx       Historie runů
    ├── settings/page.tsx   Nastavení workspace
    └── skills/
        ├── page.tsx        Inventář skills
        └── [id]/page.tsx   Detail skillu (editace; N4d — commands/[id] stejně)
```

Žádné `/approvals`, `/tasks`, `/limits` jako samostatné route — tyto funkce jsou
buď na `/overview` (approvals badge, queued tasks) nebo inline v příslušné doméně.

## Root layout (`app/layout.tsx`)

Server component — načítá locale + messages a mountuje:

1. `next/font/google` — Geist (`--font-sans`) + JetBrains Mono (`--font-mono`)
2. `NextIntlClientProvider` — internacionalizace
3. `<Providers>` — všechny client-side providery

## Providers (`app/providers.tsx`)

Client component (`"use client"`):

```tsx
<QueryClientProvider client={queryClient}>
  {" "}
  // TanStack Query
  <apiClient.ReactQueryProvider>
    {" "}
    // ts-rest client
    <RunEventsProvider>
      {" "}
      // SSE/polling pro run logy
      <DesignSystemProvider theme="dark">
        {" "}
        // dark theme
        <BootSplash>
          {" "}
          // loading screen
          {children}
        </BootSplash>
      </DesignSystemProvider>
    </RunEventsProvider>
  </apiClient.ReactQueryProvider>
</QueryClientProvider>
```

`QueryClient` konfigurace: `staleTime: 30_000`, `refetchOnWindowFocus: false`.

## Dashboard layout (`(dashboard)/layout.tsx`)

Server component — renderuje `AppShell` s children.

## AppShell (`components/layout/AppShell/`)

Client component (`"use client"`):

- Použije `usePathname()` pro odvození aktivní navigace
- Mountuje `CatalogProvider`, `VoiceProvider`, `NewTaskProvider`
- Renderuje `MainLayout` s nav/rail/voice/task sloty

### RightRail = živý log (global)

`RightRail` (`components/layout/RightRail/`) je teď **čistě živý log toho, co server právě dělá**
(`> 10:03  Integration gmail checked for changes`) — viditelný na **každé** stránce. Data jdou přes
SSE (entry se prependuje, viz `prependActivityEntry`) + `useActivityFeedInfiniteQuery` ("Load older"
stránkuje historii dozadu). Co je viditelné / seskupené / skryté řídí **Settings → Activity** config
(`useActivityViewQuery`), grouping je čistá funkce `features/overview/activityLog.ts`.

Approvals + parked runs se přesunuly **z railu do obsahu `/overview`** (`ApprovalsPanel`,
`ParkedRunsPanel`); `/runs` tab i badge u `/runs` zůstávají beze změny.

## Internacionalizace (next-intl)

- Locale v cookie (bez prefix v URL ceste)
- `i18n/request.ts` čte `cookies().get('locale')`
- `NextIntlClientProvider` v root layoutu
- Server: `getTranslations()`, client: `useTranslations()`
- Katalogy: `apps/web/i18n/messages/cs.json` + `apps/web/i18n/messages/en.json`
- Výchozí locale: `cs` (čeština)
- Flat keys: `t('AgentName', { sub: 1 })`
- DS je i18n-agnostický — string props s english defaults; app přepisuje `t()`

## Fonty

| Proměnná      | Font                             | Použití             |
| ------------- | -------------------------------- | ------------------- |
| `--font-sans` | Geist                            | UI text             |
| `--font-mono` | JetBrains Mono (400/500/600/700) | Kód, logy, terminál |

## API klient (`state/api.ts`)

ts-rest klient generovaný z `@zibby/contracts`:

- Typ-safe HTTP volání
- Poskytuje `ReactQueryProvider` pro hooky
- Základní URL: `http://localhost:3333` (konfigurovatelné přes env)

## Features (domain moduly)

```
features/
├── agents/         CRUD agentů, spouštění runů
├── approvals/      Fronta schválení
├── automations/    Cron/event triggery
├── gates/          Katalog gate pravidel
├── goals/          Loop engine — goal definice + běhy (maker ⇄ verifier)
├── health/         Systémový zdravotní stav
├── integrations/   Kanálové adaptery (email, Slack)
├── limits/         Budget zobrazení
├── memory/         Editor vault poznámek
├── notifications/  In-app notifikace
├── overview/       Briefing + aktivita feed
├── pipelines/      Pipeline editor + history
├── projects/       Portfolio projektů
├── runs/           Historie runů + log viewer
├── settings/       Nastavení workspace
├── skills/         Inventář skills
├── tasks/          Nový task dialog (taby: Standardní task / Loop) + plánovač
└── voice/          Voice interaction (hooks)
```

Každý feature modul má:

```
features/<domain>/
  queries/      ← hooks (useXxxQuery.ts), re-export z queries/index.ts
  mutations/    ← hooks (useXxxMutation.ts), re-export z mutations/index.ts
  components/   ← domain composites (nikdy DS primitives)
```

## Importy a hranice modulů

**Veřejný povrch feature = její barrel.** Každá feature, kterou konzumují jiné
features, vystavuje `features/<domain>/index.ts`, který re-exportuje její **datovou
vrstvu** (`queries` + `mutations`; `runs` navíc re-exportuje SSE/log hooky z
`runEvents`/`useRunLogStream`). Cross-feature import jde přes barrel:

```ts
// ✅ přes veřejný povrch
import { useAgentsQuery } from "../agents";
// ❌ sahání do vnitřností cizí feature
import { useAgentsQuery } from "../agents/queries/useAgentsQuery";
```

Barrel **nikdy** nere-exportuje `Screen` — stáhl by celý view-graf do každého
konzumenta a vrátil cykly (přesně jako DS `CodeBlock ↔ index`).

**Záměrné úzké deep importy se ponechávají:** dependency-free soubory s cache
klíči (`agents`/`pipelines`/`runs` `queries/keys.ts`) a SSE fan-out v
`runs/runEvents.tsx`. Existují právě proto, aby zůstaly cycle-safe — proto se
importují napřímo, ne přes barrel.

**Path alias `@/*` → `apps/web/*`** (definováno v `tsconfig.base.json`, zrcadleno
jako Vite alias v obou vitest configech a ve Storybooku, protože Vite nečte
tsconfig `paths`). Nové importy mimo vlastní feature pište přes `@/…`; stávající
relativní `../../…` se ponechávají, dokud se na ně nesáhne.

**Cycle guard:** `pnpm check:cycles` (madge přes `apps/web`, ignoruje type-only
importy a `libs/`, viz `.madgerc`) + CI job `cycles`. Graf `apps/web` je acyklický
a má takový zůstat. (`eslint-plugin-import-x` `no-cycle` v téhle ESLint 9
flat-config sestavě tiše nefunguje — proto madge.)

### Feature vs. service

„Feature" je přetížený pojem — ne každá má vlastní route:

- **Route features** (mají `Screen.tsx` + segment v `(dashboard)/`): agents,
  automations, gates, memory, overview, pipelines, projects, runs, settings,
  skills (+ `gates` je route-only, bez nav položky).
- **Shared services** (bez `Screen`, konzumované jinými features / mountované v
  chrome): approvals, goals, health, integrations, limits, research, system,
  chat, tasks, notifications.

### Otevřené následné úklidy

- **Enforcement hranic** (`no-restricted-paths` / `eslint-plugin-boundaries`)
  zatím není — migrace je záměrně neúplná (část sites žije v rozpracované práci
  + úzké key importy). Zavést, až se strom usadí.
- **Umístění feature-local hooků** je nejednotné: `hooks/` subdir (chat, skills)
  vs. flat v rootu feature (runs, automations, projects, notifications). Vybrat
  jeden směr.
- `state/forms.ts` nese `// TODO: split this file into correct module`.
- `@/*` je v `tsconfig.base.json` (sdíleném) → i `libs/` by `@/` resolvovaly na
  apps/web; čistší domov je `apps/web/tsconfig.json` (za cenu duplikace `@zibby/*`
  paths). Drobnost, ne blocker.

## Testování

Vitest project: `web`  
Prostředí: jsdom  
Harness: `renderWithProviders` (z `apps/web/test-utils/`)  
Primární selektor: `getByTestId` (podle testId enumů DS komponent)

Spuštění: `pnpm web:test`

Pozor: `apps/web` **není** v kořenovém vitest workspace — spouštět přes `pnpm web:test`,
ne `pnpm test` (kořenový workspace by web přeskočil).
