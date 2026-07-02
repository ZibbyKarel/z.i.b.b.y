# Phase NC1 — sjednocení confirm-delete dialogu (a rozhodnutí o entity-id)

## Rozhodnutí o entity-id refaktoru: DESCOPE (zaznamenáno)

`docs/plans/entity-id-refactor.md` znovu posouzen (2026-07-02) po dokončení
N1–N5. Verdikt: **teď ne** —

1. Je to celosystémová migrace identity (všechna schémata, sdílené stores,
   cross-refy „referencující téměř vše", VŠECHNY web detail routes z N4 řady
   klíčované dnešními id, backfill) — přesně big-bang, který loop zakazuje.
2. I aditivní první krok (id+slug vedle sebe) vytváří dual-identity limbo,
   které má hodnotu jen když následuje zbytek — půl migrace je horší než žádná.
3. Přínos (rename stabilita) není urgentní: operátor entity prakticky
   nepřejmenovává, slug-as-id drží 50+ fází.
4. Větev `north-star` nese ~20 nezreviewovaných checkpoint commitů — PR brána
   ještě neproběhla; migrace identity patří na čistou větev po review.

Plán zůstává „planned, not started"; vhodný okamžik = po merge této větve,
jako samostatná série malých fází na čerstvém základě.

## Náhradní NC cíl: ConfirmDeleteDialog

N4 řada zanechala **8 kopií** identického confirm-delete Dialogu
(agents/skills/commands/hooks/mcp/automations/integrations DetailScreen +
projects ProfileScreen): stejná struktura (Dialog width=sm, ghost Zrušit,
danger Smazat s loading), liší se jen title/body/ikona/label. Extrakce do
`components/ConfirmDeleteDialog` (title, body, confirmLabel, cancelLabel,
icon, pending, onConfirm, onCancel) + migrace všech 8 míst.

## DoD (testy)

- [ ] `ConfirmDeleteDialog.test.tsx`: renderuje title/body; Confirm volá
      onConfirm (s loading), Cancel + zavření volá onCancel
- [ ] Všech 8 stávajících detail testů (confirm-then-delete asserce) zůstává
      zelených beze změny asercí — důkaz zachování chování
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
