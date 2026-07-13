BATCH: web-projects-components

[SEVERITY: High] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:401] [CATEGORY: File size]
Soubor má 401 řádků a slučuje pět nesouvisejících sekcí formuláře (logo upload, budget caps, checks, env, delete) do jedné komponenty.
Rozdělit na subkomponenty ProjectLogoField, ProjectBudgetFields, ProjectChecksField (a ponechat env na existujícím KeyValueEditor), řízené přes Controller/watch z rodiče.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:118-137] [CATEGORY: Business logic in component]
handleLogoFile obsahuje validaci typu/velikosti souboru a FileReader side-effect přímo v komponentě místo ve vyčleněném hooku.
Extrahovat do custom hooku (např. useLogoUpload) vracejícího { logo, onFile, clear }.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:62-68] [CATEGORY: Duplication]
fromRows (kolaps KeyValueRow[] na Record, drop prázdných klíčů) je identická s fromRows v ProjectSecretsPanel.tsx:19-24 — stejná logika duplikovaná ve dvou souborech.
Přesunout fromRows/toRows jako sdílený export z KeyValueEditor.tsx nebo do utils.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectCard.tsx:19-64] [CATEGORY: Duplication / generalization]
BudgetBar a CostBar jsou téměř identické (label + used/cap řádek + Progress bar), liší se jen formátováním hodnoty (číslo vs. formatCostUsd) — dvě samostatné komponenty pro tentýž vzor.
Sloučit do jedné LabeledProgressBar s formatValue propem, případně přesunout do DS jako obecný primitiv.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectCard.tsx:93-110] [CATEGORY: Duplication]
Blok pro vykreslení per-status task-stat odkazů (Link + Stat z useProjectTaskStats groups) je téměř totožný s blokem v ProjectRunSummary.tsx:43-55.
Vytáhnout sdílenou komponentu (např. ProjectTaskStatLinks) používanou oběma místy.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectCompanyPanel.tsx:119-193] [CATEGORY: Generalization]
Vzor "empty-state Typography s data-testid" se opakuje třikrát v tomto souboru a znovu v ProjectPullRequestsPanel.tsx a ProjectIntegrationActivityPanel.tsx — ad-hoc inline místo sdílené DS komponenty.
Zvážit jednoduchý EmptyState primitiv v DS (label + testid prop) pro tento opakovaný vzor napříč panely.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectIntegrationsPanel.tsx:50-80] [CATEGORY: Business logic in component]
onCreate a onTest obsahují víckrokovou mutation-orchestraci (podmíněné nastavení credentials, navigace po úspěchu, mapování chyby na toast state) přímo v komponentě.
Zvážit přesun této orchestrace do dedikovaného hooku (např. useCreateIntegrationFlow) v features/integrations.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/KeyValueEditor.tsx] [CATEGORY: Test coverage]
Sdílená, znovupoužívaná komponenta (basics env, secrets) nemá vlastní test soubor — pokrytí existuje jen nepřímo přes ProjectBasicsPanel.test.tsx, který navíc netestuje env řádky vůbec.
Přidat KeyValueEditor.test.tsx pro add/remove/change/secret-masking chování.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectSecretsPanel.tsx, ProjectSelect.tsx, ProjectIntegrationsPanel.tsx] [CATEGORY: Test coverage]
Tři netriviální komponenty v tomto batchi (write-only secrets flow, integrations create/test/toggle flow, project dropdown) nemají žádný test soubor.
Doplnit alespoň smoke/interaction testy pro tyto tři komponenty.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:84-94] [CATEGORY: Business logic in component]
toPositiveInt/toPositiveFloat jsou čisté parsovací funkce definované lokálně v komponentě, ačkoliv jde o obecně použitelnou budget-parsing logiku.
Přesunout do sdíleného utils souboru, pokud se stejný parsing objeví i jinde (např. u company budgetu).

STATS: 17 souborů, 2259 řádků celkem. Top 3: ProjectBasicsPanel.tsx (401), ProjectBasicsPanel.test.tsx (225), ProjectCompanyPanel.tsx (199).
