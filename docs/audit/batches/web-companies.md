BATCH: web-companies

POZN. ORCHESTRÁTORA: dva nálezy níže označené jako Critical jsou reálně High/Medium (extrakce komponenty a duplikace UI komponenty nejsou bezpečnostní/produkční riziko) — při agregaci normalizovat. Duplikace PersonRow napříč companies/projects je ale potvrzená i z batche web-projects-core (PersonRow + 9 label props tam hlášen nezávisle).

[SEVERITY: Critical] [FILE: apps/web/features/companies/DetailScreen.tsx:53-110] [CATEGORY: Component size / Extraction]
PersonRow komponenta (58 řádků) je definovaná v DetailScreen.tsx a měla by být extrahovaná do samostatného souboru. Sníží se tím velikost DetailScreen z 339 na ~280 řádků. (Reálná severity: Medium)
Vytvořit `components/PersonRow.tsx`, přesunout PersonRow i PersonRowProps, importovat v DetailScreen.

[SEVERITY: Critical] [FILE: apps/web/features/companies/DetailScreen.tsx:53-110, apps/web/features/projects/ProfileScreen.tsx:127-176] [CATEGORY: Code duplication]
PersonRow komponenta se opakuje v companies/DetailScreen.tsx i v projects/ProfileScreen.tsx (identický kód). Měla by být extrahovaná do sdíleného místa. (Reálná severity: High)
Vytvořit sdílený PersonRow v `apps/web/components/` a importovat z obou míst.

[SEVERITY: High] [FILE: apps/web/features/companies/DetailScreen.tsx:204-219] [CATEGORY: Prop drilling]
PersonRow přijímá 11 propů (labely/placeholdery) pokaždé ze `useTranslations()` v rodičovi. PersonRow by měl přímo volat `useTranslations("companies")`, místo aby je přijímal jako props.
Přesunout `useTranslations()` do PersonRow, zjednoduší se callsite ze 14 propů na 3 (person, onChange, onRemove).

[SEVERITY: High] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:35-45, apps/web/features/projects/components/ProjectBasicsPanel.tsx:85-96] [CATEGORY: Code duplication]
Funkce `toPositiveInt()` a `toPositiveFloat()` se opakují na dvou místech s identickým kódem.
Vytvořit `apps/web/utils/budgetParsers.ts` a importovat v obou panelech.

[SEVERITY: High] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:102-119, apps/web/features/projects/components/ProjectBasicsPanel.tsx:120-140] [CATEGORY: Code duplication]
Transformace budgetových polí (parsování stringů na budget objekt) se opakuje mezi Company a Project BasicsPanel.
Vytvořit utility `buildBudgetFromValues(values)` v `utils/budgetTransform.ts`, sdílet oběma panely.

[SEVERITY: High] [FILE: apps/web/features/companies/DetailScreen.tsx:239, apps/web/features/companies/LinkProjectDialog.tsx:40] [CATEGORY: Code duplication / Pattern]
Filtrování projektů se opakuje: DetailScreen filtruje `companyId === id`, LinkProjectDialog `companyId !== companyId`.
Vytvořit `projectFilters.ts` s `getLinkedProjects(projects, companyId)` a `getUnlinkedProjects(projects, companyId)`.

[SEVERITY: Medium] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:1-238] [CATEGORY: Component size]
CompanyBasicsPanel je 238 řádků (blízko 300). Obsahuje 7 form fields pro budget (řádky 174-219), které by mohly být extrahované do `BudgetFieldsPanel` subkomponenty.
Vytvořit `components/BudgetFieldsPanel.tsx`, extrahovat řádky 167-219.

[SEVERITY: Medium] [FILE: apps/web/features/companies/DetailScreen.tsx:167] [CATEGORY: Magic string]
Prefix "company-" ve fallback id (`slug(body.name) || company-${Date.now()}`) je hardkódnutý — stejný vzor jako `project-${Date.now()}` v projects (hlášeno v web-projects-core).
Sdílet `generateEntityId(prefix, name)` util.

STATS: 18 souborů (9 production, 9 testů), 876 řádků production kódu. Top 3: DetailScreen.tsx (339), CompanyBasicsPanel.tsx (238), LinkProjectDialog.tsx (108).
