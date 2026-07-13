BATCH: web-components-a

[SEVERITY: High] [FILE: apps/web/components/EmptyState/EmptyState.tsx, apps/web/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx, apps/web/components/DialogTitle/DialogTitle.tsx, apps/web/components/HudCard/HudCard.tsx, apps/web/components/HudPanel/HudPanel.tsx, apps/web/components/Collection/Collection.tsx] [CATEGORY: design-system-promotion]
Šest komponent je čistě prezentačních, skládají se výhradně z DS primitiv (`Card`, `Stack`, `IconTile`, `Typography`, `Grid`…), neobsahují žádnou app-specifickou logiku ani i18n závislost a jsou znovupoužívány napříč 15+ feature moduly. `HudCard` má dokonce komentář "Dumb by design". `libs/design-system` neobsahuje ekvivalent (ověřeno grepem).
Doporučení: přesunout do `libs/design-system` jako generické primitivy/composite komponenty s Storybook + testid enum podle DS konvencí.

[SEVERITY: Medium] [FILE: apps/web/components/CategoryDialog/CategoryDialog.tsx:6] [CATEGORY: coupling/naming]
Komponenta je v docstringu popsána jako "resource-agnostic" a sdílená napříč katalogy (agents, skills, projects), ale natvrdo importuje `AGENT_GLYPHS` z `state/config` místo toho, aby seznam glyphů dostávala jako prop.
Doporučení: přidat prop `glyphs: IconName[]` a volat CategoryDialog s catalog-specifickým seznamem.

[SEVERITY: Medium] [FILE: apps/web/components/DialogFormFooter/DialogFormFooter.tsx:1-35] [CATEGORY: duplicate-pattern]
Na rozdíl od sourozeneckých sdílených dialog komponent (`ConfirmDeleteDialog`, `CategoryDialog`), které dostávají popisky přes props, `DialogFormFooter` si sám volá `useTranslations()` — nekonzistentní vzor ztěžuje promotion do DS (DS má být i18n-agnostic).
Doporučení: sjednotit na prop-driven labels (`cancelLabel`, `saveLabel`, `deleteLabel`) po vzoru `ConfirmDeleteDialog`.

[SEVERITY: Medium] [FILE: apps/web/components/CategoryDialog/CategoryDialog.tsx] [CATEGORY: missing-tests]
Chybí testový soubor — komponenta obsahuje netriviální logiku (duplicate-name guard, glyph picker se stavem, `canSubmit` derivace).
Doporučení: doplnit `CategoryDialog.test.tsx` pokrývající duplicitní jméno, výběr glyphu a submit/cancel.

[SEVERITY: Medium] [FILE: apps/web/components/DialogFormFooter/DialogFormFooter.tsx] [CATEGORY: missing-tests]
Chybí testový soubor — podmíněné renderování Delete tlačítka (`!isNew && onDelete`) a `disabled={!canSave}` logika nejsou ověřeny.
Doporučení: doplnit test pro create/edit režimy a canSave gating.

[SEVERITY: Low] [FILE: apps/web/components/DialogTitle/DialogTitle.tsx] [CATEGORY: missing-tests]
Triviální prezentační komponenta bez testu; nízké riziko, ale znovupoužívaná.
Doporučení: volitelně doplnit render test při promotion do DS.

[SEVERITY: Low] [FILE: apps/web/components/HudPanel/HudPanel.tsx:2] [CATEGORY: type-import]
`CardProps` je importován bez `type` klíčového slova, ačkoliv je použit pouze jako typ (`CardProps["tone"]`).
Doporučení: `import { Card, type CardProps, ... }`.

[SEVERITY: Low] [FILE: apps/web/components/EntityFormModal/EntityFormModal.tsx:58] [CATEGORY: style-consistency]
`open={true}` místo zkráceného booleovského `open`, jak je konzistentně jinde.
Doporučení: sjednotit na `open` shorthand.

STATS: files=24, total_lines=1292, top3=[HudCard.tsx (138), CategoryDialog.tsx (118), EntityFormModal.tsx (92)] — žádný soubor nepřekračuje 300 řádků.
