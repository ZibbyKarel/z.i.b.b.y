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
    ├── agents/page.tsx     Katalog agentů
    ├── automations/page.tsx Automatizace
    ├── gates/page.tsx      Gate pravidla
    ├── integrations/page.tsx Integrace a kanály
    ├── memory/page.tsx     Vault browser
    ├── overview/page.tsx   Přehled (briefing + aktivita)
    ├── pipelines/
    │   ├── page.tsx        Seznam pipelines
    │   └── [id]/page.tsx   Detail pipeline + history runů
    ├── projects/page.tsx   Portfolio projektů
    ├── runs/page.tsx       Historie runů
    ├── settings/page.tsx   Nastavení workspace
    └── skills/page.tsx     Inventář skills
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
<QueryClientProvider client={queryClient}>        // TanStack Query
  <apiClient.ReactQueryProvider>                  // ts-rest client
    <RunEventsProvider>                           // SSE/polling pro run logy
      <DesignSystemProvider theme="dark">         // dark theme
        <BootSplash>                              // loading screen
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

| Proměnná | Font | Použití |
|---------|------|---------|
| `--font-sans` | Geist | UI text |
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

## Testování

Vitest project: `web`  
Prostředí: jsdom  
Harness: `renderWithProviders` (z `apps/web/test-utils/`)  
Primární selektor: `getByTestId` (podle testId enumů DS komponent)

Spuštění: `pnpm web:test`

Pozor: `apps/web` **není** v kořenovém vitest workspace — spouštět přes `pnpm web:test`,
ne `pnpm test` (kořenový workspace by web přeskočil).
