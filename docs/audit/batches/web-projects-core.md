BATCH: web-projects-core

[SEVERITY: High] [FILE: apps/web/features/projects/ProfileScreen.tsx:195-685] [CATEGORY: File size / component decomposition]
ProfileScreen je 685 řádků a v jedné funkci kombinuje routing (tab state), 3× duplicitní "controlled-draft vs server-data" stavový vzor (people/autonomy/rhythm), 4 save handlery s transformační logikou a 4 inline JSX bloky (teamPanel, autonomyPanel, rhythmPanel, standupPanel) o desítkách řádků každý.
Rozdělit na ProfileScreen (orchestrace + tabs) + samostatné TeamPanel/AutonomyPanel/RhythmPanel komponenty v `./components/`, po vzoru už existujících ProjectBasicsPanel/ProjectCompanyPanel.

[SEVERITY: High] [FILE: apps/web/features/projects/ProfileScreen.tsx:324-517] [CATEGORY: Duplicitní vzor napříč souborem]
Team/Autonomy/Rhythm/Standup panely jsou psány jako inline JSX konstanty přímo v ProfileScreen, zatímco sesterské sekce (Basics, Company, Integrations, Secrets, PullRequests) jsou už extrahované komponenty v `./components/`. Nekonzistentní vzor v rámci stejné obrazovky.
Extrahovat všechny čtyři panely do vlastních souborů se stejnou konvencí jako ostatní `Project*Panel` komponenty.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:233-303] [CATEGORY: Business logika v komponentě]
Tři téměř identické bloky "local state nebo server data" (`people`/`effectivePeople`, `autonomy`/`effectiveAutonomy`, `rhythm`/`effectiveRhythm`) a čtyři save-handlery (saveBasics/saveTeam/saveAutonomy/saveRhythm) s filtrací/dedupe logikou žijí přímo v komponentě místo v custom hooku.
Vytáhnout do `useProjectProfileForm(id, profileQ.data)` hooku, který zapouzdří draft state + save mutace pro všechny tři sekce.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:112-184] [CATEGORY: Prop drilling]
PersonRow přijímá 9 samostatných label/placeholder/help props místo aby si `t()` z `useTranslations("projects.profile")` volal sám.
Nahradit prop-drilling přímým `useTranslations` uvnitř PersonRow.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:530-537] [CATEGORY: Business logika v komponentě]
Odvozený stav pro clone banner (cloneTarget, showMissingCloneBanner, showClonedFromCloneRoot) je počítán inline v render těle namísto v hooku/pure helperu.
Přesunout do malé pure funkce (např. `resolveCloneBannerState(project, localState)`) nebo do `useProjectLocalStateQuery` jako odvozené pole.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.test.tsx] [CATEGORY: Testové pokrytí]
Test soubor pokrývá basics/team/rhythm/clone/new-project flow, ale neobsahuje žádný test pro Autonomy panel (respond_as toggle, vip_escalation, can_do_alone/always_ask multi-select + saveAutonomy), přestože je to jeden z nejsložitějších bloků byznys logiky v souboru.
Doplnit test(y) pro saveAutonomy pokrývající filtrování prázdných hodnot a undefined-defaulting.

[SEVERITY: Medium] [FILE: apps/web/features/projects/Screen.tsx:140] [CATEGORY: Chybějící typování]
`(cat.glyph as IconName) ?? "code"` je nevalidovaný type cast z libovolného stringu (kategorie z API) na `IconName` — chybí runtime guard.
Přidat guard funkci nebo validaci proti známé množině IconName hodnot s fallbackem.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:102-106] [CATEGORY: Chybějící typování]
`asProjectTab` používá `(value as ProjectTab)` cast namísto type predicate; funkčně bezpečné, ale šlo by bez castu.
Zvážit `function isProjectTab(v: string): v is ProjectTab`.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:69-93] [CATEGORY: Umístění kódu]
AUTONOMY_ACTIONS vokabulář a `actionOptions()` jsou nezávislá čistá doména, ale žijí v 685řádkovém souboru.
Přesunout do `./autonomyActions.ts`.

[SEVERITY: Low] [FILE: apps/web/features/projects/queries/keys.ts:1-22] [CATEGORY: Duplicitní vzor napříč souborem]
Cache-key definice u `useBudgetQuery`/`useCiStatusQuery` jsou vyčleněné do keys.ts (kvůli cyklu s runEvents), zbylých 12 hooků má `getXxxQueryKey` u sebe — nekonzistentní umístění stejného konceptu (zdokumentované).
Ponechat, ale přidat vysvětlující komentář do `queries/index.ts`.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:260-266] [CATEGORY: Business logika v komponentě]
Generování id nového projektu (`slug(body.name) || \`project-${Date.now()}\``) je inline v handleru `saveBasics` — doménová logika (fallback-id strategie) mimo util.
Přesunout do `utils/slug.ts` jako `generateProjectId(name)`.

STATS: 29 zdrojových souborů (3 root, 15 queries, 11 mutations) + test zběžně; 1413 řádků bez testů. Top 3: ProfileScreen.tsx (685), Screen.tsx (171), useProjectIntegrationActivityQuery.ts (50).
