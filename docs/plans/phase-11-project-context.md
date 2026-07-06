# Fáze 11 — Multi-projektový kontext v UI

## Nálezy z investigace (Fáze 0)

- **Vault izolace už existuje** přes `project:` frontmatter tag +
  `ownerProjectOf()` filtr (`apps/api/src/memory/vault.service.ts`) — žádné
  multi-root vaulty se nezavádí.
- **Žádný ProjectContext/Provider v `apps/web` neexistuje** — výběr projektu dnes nic
  nescopuje. `apps/web/features/projects/` má queries/mutations a Screen;
  `AppShell` (`apps/web/components/layout/AppShell/AppShell.tsx`, `"use client"`)
  mountuje `CatalogProvider` + `VoiceProvider` + `NewTaskProvider` a odvozuje aktivní
  nav z `usePathname()`.
- **Runs UI konzumuje `taskRuns.listTaskRuns`** (`features/runs/queries/useRunsQuery.ts`)
  a `TaskRunSchema` (libs/contracts/src/tasks/task-run.schema.ts:117) **už má
  `projectId?: string`** — do `AgentRunSchema`/`PipelineRunSchema` se projectId
  NEPŘIDÁVÁ (nesou jen volné labely `project`/`projectPath`; runs stránka je nečte
  přímo). Bod 4 Fáze 0 je tím zodpovězen: pole existuje tam, kde ho UI potřebuje.
- Cookie vzor: `locale` cookie čtená v `apps/web/i18n/request.ts` přes
  `cookies()` — stejný přístup (bez path prefixu) použít pro aktivní projekt.

## Rozhodnutí

1. **Cíl je UX přepnutí kontextu, ne datová izolace** — filtruje se klient-side nad
   daty, která už nesou atribuci (`projectId`, `project:` tag). Bez nových
   bezpečnostních mechanismů.
2. **Aktivní projekt = appwide state `activeProjectId: string | null`** (`null` =
   „Všechny projekty", default). Persistence v cookie `activeProject` (SameSite=Lax,
   dlouhá expirace), čtená při mountu Provideru — přežije navigaci i reload.
3. **Při aktivním projektu se zobrazují jen položky atribuované tomuto projektu**;
   neatribuované položky jsou vidět jen ve „Všechny projekty". Přepínač je vždy po
   ruce, takže nic není „ztraceno".
4. **Interakční gramatika**: přepínač je JEDNA komponenta na JEDNOM místě v
   `AppShell` (chrome vedle navigace/topbaru — implementátor umístí konzistentně s
   existujícím layoutem `MainLayout` sloty), na všech obrazovkách stejně. Žádná nová
   stránka, žádný dialog.

## Kroky

### 1. ProjectProvider

- `apps/web/features/projects/context/ProjectProvider.tsx` (`"use client"`):
  `ProjectContext` s `{ activeProjectId, setActiveProject }`. Čtení/zápis cookie
  `activeProject` (document.cookie, žádná nová dependency). Export hook
  `useActiveProject()` (throw mimo provider — vzor ostatních providerů v repu).
- Mount v `AppShell` vedle `CatalogProvider` (ne v root `providers.tsx` — projekt je
  dashboardová záležitost).
- Validace: pokud cookie ukazuje na projekt, který už neexistuje (proti
  `useProjectsQuery`), chovat se jako `null` (neresetovat cookie agresivně).

### 2. Přepínač v AppShell

- Komponenta `ProjectSwitcher` (domain composite v
  `apps/web/features/projects/components/`), složená z DS primitiv (existující
  select/dropdown/menu primitivum v `libs/design-system` — pokud vhodné primitivum
  chybí, rozhodnout explicitně dle CLAUDE.md; preferovat existující).
- Obsah: „Všechny projekty" + seznam z `useProjectsQuery` (jméno projektu). Aktivní
  volba viditelná trvale (ne jen v otevřeném menu). Testy přes testId enum vzor.

### 3. Scoping segmentů

Filtrovat klient-side v Screen/feature vrstvě (ne v query hoocích — cache zůstává
sdílená a přepnutí projektu je okamžité):

- **runs**: `RunView`/`TaskRun.projectId` — filtrovat v `features/runs/Screen.tsx`
  (příp. v místě, kde se `useRunsQuery` výsledek zpracovává). Ověřit, že
  `useRunsQuery`'s `RunView` mapování `projectId` propaguje — pokud ne, přidat do
  mapování (čistě FE typ).
- **memory**: notes nesou `project:` frontmatter — ověřit, co vrací memory list
  endpoint (`libs/contracts/src/memory/memory.contract.ts`); pokud payload frontmatter
  projekt nenese, rozšířit response schema o volitelné `project` pole (server ho čte
  přes `ownerProjectOf()` — už existuje) a filtrovat klient-side. Kontrakt-first.
- **agents / pipelines**: agenti a pipelines jsou katalog, ne per-projekt data —
  scopovat jen pokud schémata nesou projektovou atribuci; pokud ne, segmenty nechat
  nefiltrované (rozhodnutí zapsat do commit message, ne vymýšlet nové vazby).
- **gates**: schvalovací fronta — filtrovat položky, které nesou `projectId` ref
  (approval/activity refs); bez atribuce → vidět jen ve „Všechny projekty".
- Každý filtrovaný Screen ukáže decentní indikaci aktivního filtru (např. existující
  chip/badge DS komponentou), aby prázdný seznam nebyl matoucí.

### 4. i18n

- Nové stringy do `apps/web/i18n/messages/{cs,en}.json` (flat klíče), DS komponenty
  zůstávají i18n-agnostické.

### 5. Testy

- ProjectProvider: čtení/zápis cookie, default null, neznámý projekt → null.
- ProjectSwitcher: render voleb, přepnutí volá setActiveProject (testId selektory,
  role/ARIA jen jako asserty).
- Scoping: aspoň runs Screen — s aktivním projektem renderuje jen atribuované runy.

## Definition of done

`pnpm lint && pnpm typecheck && pnpm test` zelené; přepnutí projektu přežije reload
a navigaci; žádná změna backendových schémat kromě případného volitelného `project`
pole v memory list response (kontrakt-first).
