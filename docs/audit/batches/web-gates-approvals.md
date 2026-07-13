BATCH: web-gates-approvals

[SEVERITY: High] [FILE: apps/web/features/approvals] [CATEGORY: test-coverage]
Celá approvals feature (approval.ts, ApprovalPreview, RiskBadge, SeverityMeter, useApprovalsQuery, useApproveMutation, useRejectMutation) nemá žádný test soubor, přestože jde o schvalovací/zamítací tok s vysokým rizikem (platba/mazání) a `parseApprovalDetail` obsahuje netriviální JSON parsing/fallback logiku.
Doporučení: přidat alespoň unit testy pro `parseApprovalDetail` (fallback na plain text) a smoke test pro `ApprovalPreview` per preview kind.

[SEVERITY: Medium] [FILE: apps/web/features/approvals/approval.ts:79-94] [CATEGORY: typing]
`parseApprovalDetail` po slabé heuristické kontrole (`"preview" in data || "riskType" in data || "summary" in data`) provede `data as ApprovalEnrichment` bez schema validace — malformovaný/neúplný `detail` JSON od runneru projde beze změny a může způsobit, že se pro high-risk schválení (platba/mazání) zobrazí nesprávný nebo neúplný preview.
Doporučení: validovat enrichment JSON přes zod schema místo prostého type-castu.

[SEVERITY: Medium] [FILE: apps/web/features/gates/components/GateRulesSection.tsx:93] [CATEGORY: typing]
`(a.glyph as IconName | undefined) ?? "bot"` castuje libovolný string z API na `IconName` bez validace.
Doporučení: validovat proti známé sadě IconName (whitelist/lookup) místo přímého castu.

[SEVERITY: Medium] [FILE: apps/web/features/approvals/components/ApprovalPreview.tsx:50-52,88,110,123] [CATEGORY: design-system]
Barvy pro diff/cart preview jsou hardcodované jako `rgba(...)` literály místo `var(--color-*)` tokenů, které jinde v obou featurách (RuleCard, RuleParts, SeverityMeter) jsou používány důsledně.
Doporučení: nahradit hardcoded rgba hodnoty semantic color CSS proměnnými (ok/bad/warn dim varianty).

[SEVERITY: Medium] [FILE: apps/web/features/gates/components/RuleCard.tsx:38 a apps/web/features/gates/components/GlobalRuleCard.tsx:76] [CATEGORY: duplication]
Identický vzor `borderLeft: 3px solid meta.cssVar` + `eslint-disable-next-line react/forbid-dom-props` je duplikovaný ve dvou souborech pro totožný účel (barevné odlišení podle decision).
Doporučení: extrahovat do sdílené obálky (např. `DecisionAccentCard`) v `RuleParts.tsx`.

[SEVERITY: Low] [FILE: apps/web/features/approvals/components/ApprovalPreview.tsx:171-172] [CATEGORY: ux-correctness]
Preview kind "command" vykresluje pro KAŽDÝ target ikonu `trash` s tónem `bad`, bez ohledu na skutečnou povahu příkazu — vizuálně naznačuje destrukci i u nedestruktivních akcí, což může matoucím způsobem ovlivnit rozhodování při schvalování.
Doporučení: řídit ikonu/tón podle skutečného risk typu approval, ne staticky "trash"/"bad".

[SEVERITY: Low] [FILE: apps/web/features/gates/queries/useGateRulesQuery.ts:17 a apps/web/features/gates/queries/useSystemPolicyQuery.ts:13] [CATEGORY: duplication]
Oba soubory duplikují stejný jednořádkový custom `select` (`(response) => response.body.rules`) namísto kompozice okolo sdíleného `selectApiResponseBody`.
Doporučení: sjednotit do jedné sdílené utility (např. `selectRulesBody`) v `gates/queries/`.

[SEVERITY: Low] [FILE: apps/web/features/gates/components/RuleModal.tsx:56-112] [CATEGORY: organization]
Čisté transformační funkce (`matchToFields`, `buildMatch`, `leafNode`, `buildResolve`) žijí v souboru komponenty místo v `gate.ts`, kde už existují analogické "read-side" transformace (`matchText`, `flattenResolve`) — logika read/write strany matcheru je rozdělena mezi dva soubory bez zjevného důvodu.
Doporučení: přesunout tyto pure funkce do `gate.ts`, komponenta zůstane jen na renderu formuláře.

[SEVERITY: Low] [FILE: apps/web/features/gates/components/RuleModal.tsx] [CATEGORY: file-size]
292 řádků, těsně pod 300řádkovou hranicí — kombinuje matcher-builder logiku, resolve-leaf editor a celý dialog v jednom souboru.
Doporučení: pokud poroste, vytáhnout resolve-leaf editor (~237-288) do samostatné subkomponenty `ResolveEditor`.

STATS: 29 souborů (27 s obsahem, 2 index re-exporty), celkem 1894 řádků. Top 3: gates/components/RuleModal.tsx (292), gates/components/GateRulesSection.tsx (224), approvals/components/ApprovalPreview.tsx (200).
