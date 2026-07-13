BATCH: web-tasks-core

[SEVERITY: Critical] [FILE: apps/web/features/tasks/hooks/useTaskClassification.ts:94-99] [CATEGORY: React Anti-pattern]
Direct setState volání v těle hooku (render time) místo v useEffect; "adjust state on prop change" pattern se implementuje synchronně bez efektu. Řádky 94-99 se měly balit do useEffect s závislostí na `proposedGoalKey`.
Přesuň setState volání do useEffect s explicitní závislostí na `proposedGoalKey`, nebo použij derived state pattern.
POZN. ORCHESTRÁTORA: render-time "adjust state during render" JE oficiálně dokumentovaný React pattern (react.dev: "Adjusting state when a prop changes") — severity pravděpodobně nadsazená, ověřit při agregaci; skutečný problém je spíš duplikace tohoto vzoru na 3 místech bez sdíleného hooku.

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:114-123] [CATEGORY: React Anti-pattern]
Stejná chyba jako v useTaskClassification: setState volání v render body (řádky 120-123 se volají během render, ne v efektu).
Přesuň do useEffect s závislostí na `proposedGrantsKey`.
POZN. ORCHESTRÁTORA: viz pozn. výše — vzor je legální, problém je duplikace bez `useSeededState` abstrakce.

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:471-482] [CATEGORY: React Anti-pattern]
setState volání v render body pro injected target. Komentář (467-470) obhajuje jako "React's pattern".
Přesuň setState volání (řádky 472-481) do useEffect s závislostí na `injectedTarget`, respektive `prevInjectedTarget`.
POZN. ORCHESTRÁTORA: viz pozn. výše.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:1] [CATEGORY: Component size]
Komponenta má 1099 řádků. Mention dropdown (řádky 954-1029), file attachment tiles (řádky 887-912), suggestion chips (řádky 1033-1049) jsou samostatné UI unitky ideální pro extrakci.
Rozděl CommandLine na menší komponenty: MentionDropdown (~80 řádků), AttachmentTiles (~50 řádků), SuggestionChips (~30 řádků).

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:54-99] [CATEGORY: Prop drilling]
Interface TaskCommandLineProps má 30+ properties. Mnohé jsou pass-through do CommandLine (rows, maxRows, placeholder, label, atd.), jiné jsou task-specifické.
Seskup pass-through properties do objektu (CommandLineOptions) a task-specific do jiného; nebo vytvoř type mapping helper.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:55-150] [CATEGORY: Prop drilling]
CommandLineProps má 18+ properties. Těžko se pamatuje, které jsou povinné. `renderTrailing` callback (147-149) je ad-hoc pattern.
Zvážit: group properties do objektů (draft, actions, ui).

[SEVERITY: Medium] [FILE: apps/web/features/tasks/hooks/useTaskSubmit.ts:88-89] [CATEGORY: Type safety]
Parameter `res` v callbacku `handleCreateTaskSuccess` nemá explicitní typ.
Přidej explicitní type annotation.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:70-71] [CATEGORY: Duplicitní state pattern]
`checkedGrants` / `seededGrantsKey` pattern (řádky 70-71, 114-123) je stejný jako v useTaskClassification (`seededKey`). Mělo by to být v custom hooku `useSeededState` nebo `usePropToStateSync`.
Extrahuj do custom hooku.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:471-495] [CATEGORY: State coherence]
Inject target pattern (471-482) je setState v renderu, ale `onInjectedTargetConsumed` callback (489-495) je v efektu čtoucím text z closure bez dependency — nesoulad dvou polovin téhož flow.
Sjednotit obě akce do jednoho místa s explicitními dependencies.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:256-278] [CATEGORY: Vyčlenitelné utility]
CARET_MIRROR_PROPS array (256-278) je 20+ property stringů pro DOM měření; measureCaretRect ~40 řádků logiky přímo v souboru komponenty.
Vytvoř `utils/caretMeasure.ts` s `measureCaretRect` a CARET_MIRROR_PROPS jako export.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/hooks/useTaskClassification.ts:45-165] [CATEGORY: Complex logic]
Hook má 165 řádků s komplexní logikou: dispatch mutation, debounce, loop state management, target picker logic.
Rozděl do dvou hooků: `useClassifyTask` (dispatch) + `useTaskClassificationState` (ui state).

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:86-90] [CATEGORY: Computed state duplication]
`paths` se počítá v NewTaskDialog (useMemo) a předává do useTaskClassification — není jasné, která strana je kanonická.
Vyjasnit vlastnictví výpočtu paths.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:202-205] [CATEGORY: Code style]
Funkce `computeRows` je lokální drobný helper použitý v inline výrazu.
Přesuň do `task.ts` utility functions, aby byla znovupoužitelná a testovatelná.

[SEVERITY: Low] [FILE: apps/web/features/tasks/mutations/index.ts] [CATEGORY: Barrel export pattern]
Mutations re-exportovány z index.ts, queries index.ts pokrývá jen část hooků — nekonzistence.
Sjednotit barrel exporty.

STATS: ~25 zdrojových souborů (4 root + 4 hooks + 1 query + 5 mutations + 11 components), ~4200 LOC bez testů. Top 3: CommandLine.tsx (1099), TaskCommandLine.tsx (375), NewTaskDialog.tsx (215). Critical 3 / High 3 / Medium 5 / Low 3.
