BATCH: web-skills-commands

[SEVERITY: High] [FILE: apps/web/features/skills/DetailScreen.tsx:52-159, apps/web/features/commands/DetailScreen.tsx:57-155] [CATEGORY: Duplicate pattern]
SkillEditor a CommandEditor jsou téměř identické — stejný isError/isPending/!data guard, stejná PageHeader se Save/Delete/Back tlačítky a testid vzory, stejný ConfirmDeleteDialog wrapper i useFormControls flow, lišící se jen konkrétními poli formuláře.
Extrahovat sdílenou `<DetailScreenShell>`/`useDetailQueryGuard` + `<DetailHeaderActions>` kompozici parametrizovanou title/save/delete callbacky.

[SEVERITY: High] [FILE: apps/web/features/commands/components/CommandTile.tsx:17-53, apps/web/features/skills/components/SkillTile.tsx:14-48] [CATEGORY: Duplicate pattern]
Obě dlaždice mají identickou strukturu (Card>Container>Stack>IconTile+Typography+StatusDot); komentář v CommandTile explicitně říká "Mirrors SkillTile" — liší se jen zdrojem glyfu a druhým řádkem textu.
Vytáhnout generický `<CatalogTile>` composite (DS nebo lokální) se sloty pro glyph/title/subtitle/statusTone.

[SEVERITY: Medium] [FILE: apps/web/features/commands/components/AddCommandModal/AddCommandModal.tsx:10-19, apps/web/features/commands/DetailScreen.tsx:26-35] [CATEGORY: Duplicate validation]
Identické zod schéma (8 polí) je doslovně zkopírované mezi create dialogem a detail screenem.
Přesunout schéma vedle `CommandFormFields.tsx` (např. `commandFormSchema.ts`) a importovat na obou místech.

[SEVERITY: Medium] [FILE: apps/web/features/skills/components/AddSkillModal/AddSkillModal.tsx:11-16, apps/web/features/skills/DetailScreen.tsx:25-30] [CATEGORY: Duplicate validation]
Stejný vzor jako u commands — identické zod schéma duplikované mezi create dialogem a detail screenem.
Přesunout schéma vedle `SkillFormFields.tsx` a sdílet.

[SEVERITY: Medium] [FILE: apps/web/features/commands/DetailScreen.tsx:16] [CATEGORY: Misplaced business logic]
`parseTools` je čistá parsovací utilita, ale je definovaná a exportovaná z `AddCommandModal.tsx` (dialogové komponenty); `DetailScreen.tsx` importuje detail implementace sourozenecké komponenty místo sdíleného utilu.
Přesunout `parseTools` do samostatného `commands/utils/parseTools.ts`.

[SEVERITY: Medium] [FILE: apps/web/features/skills/Screen.tsx:52-104] [CATEGORY: Business logic/render logic in component]
`renderSection` je ~50řádková closure definovaná uvnitř těla `Screen` (rekreovaná při každém renderu), která míchá JSX rendering, empty-state větvení a delete-category akci — fakticky samostatná subkomponenta schovaná jako lokální funkce.
Vytáhnout do samostatné `<SkillCategorySection>` komponenty.

[SEVERITY: Medium] [FILE: apps/web/features/skills/Screen.tsx:34-208, apps/web/features/commands/Screen.tsx:17-107] [CATEGORY: Duplicate pattern]
Obě obrazovky opakují identický `isPending ? QueryLoading : isError ? QueryError : empty ? EmptyState : content` řetězec pro stav načítání katalogu.
Vytáhnout sdílený `<CatalogQueryState>` wrapper/hook použitelný oběma (a dalšími katalogovými screeny).

[SEVERITY: Low] [FILE: apps/web/features/skills/queries/useSkillsQuery.ts:26, apps/web/features/skills/DetailScreen.tsx:61, apps/web/features/skills/Screen.tsx:143] [CATEGORY: Missing/weak typing]
Tři samostatná místa přetypovávají nedůvěryhodný string z API (`glyph`) na `IconName` přes `as`, bez runtime validace.
Zavést jeden sdílený `toIconName(value): IconName` guard s fallbackem.

[SEVERITY: Low] [FILE: apps/web/features/skills/components/SkillFormFields.tsx:33-52, apps/web/features/skills/components/AddSkillModal/AddSkillModal.tsx:43, apps/web/features/skills/DetailScreen.tsx:61] [CATEGORY: Prop drilling / leaky abstraction]
`glyph` žije jako samostatný `useState` mimo RHF formulář (duplikovaně v AddSkillModal i SkillEditor) a `setInstructions` je surový imperativní callback protahovaný dolů, aby dítě mohlo zavolat `form.setValue` zvenčí.
Zaregistrovat `glyph` a merge-import jako reálná pole formuláře (přes `useFormContext` uvnitř `SkillFormFields`).

[SEVERITY: Low] [FILE: apps/web/features/commands/DetailScreen.tsx:21-24, apps/web/features/skills/DetailScreen.tsx:20-23] [CATEGORY: Duplicate pattern]
`CommandDetailScreenTestId` a `SkillDetailScreenTestId` jsou copy-paste enumy s identickými členy `Save`/`Delete`.
Po extrakci sdílené header-actions komponenty sloučit do jednoho sdíleného testid enumu.

[SEVERITY: Low] [FILE: apps/web/features/skills/hooks/useSkillFileList.ts] [CATEGORY: Missing test coverage]
Hook nese reálnou business logiku (filtrování přípon, řazení podle cesty, toggle, merge se separátorem), ale nemá vlastní unit test.
Přidat `useSkillFileList.test.ts` pokrývající drop-filtrování, toggle a merge-separator chování.

[SEVERITY: Low] [FILE: apps/web/features/commands/components/CommandFormFields.tsx, apps/web/features/skills/components/SkillFormFields.tsx] [CATEGORY: Missing test coverage]
Obě sdílené form-fields komponenty (použité na 2 místech každá) nemají vlastní test soubor.
Přidat cílené render testy pokrývající zapojení polí a větve idLocked/tab-switch.

[SEVERITY: Low] [FILE: apps/web/features/skills/components/AddSkillModal/SkillFileList.tsx] [CATEGORY: Missing test coverage]
Prezentační, ale netriviální (odvození folder-path, rendering checked stavu) list komponenta nemá test soubor.
Přidat test pokrývající logiku dělení folder-path a disabled stav import tlačítka.

STATS: 31 souborů (bez testových), 1617 řádků celkem. Top 3: skills/Screen.tsx (208), skills/components/SkillFormFields.tsx (164), skills/DetailScreen.tsx (159).
