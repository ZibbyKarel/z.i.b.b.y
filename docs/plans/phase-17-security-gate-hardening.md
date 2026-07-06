# Fáze 17 — Zpevnění bezpečnostní brány (approval-hook classifier + HoldButton)

Zdroj: systémový audit (artifact ca029212, 2026-07-06), priority P0 #1 a #2 —
jediné dva nálezy dotýkající se autonomního jednání systému. Oba nálezy byly
nezávisle ověřeny proti kódu (4 verifikační agenti, 2026-07-06).

Rozsah: `apps/api/src/runner/claude-approval-hook.mjs` (+ jeho test) a
`libs/design-system/src/components/HoldButton/` (+ testy, story, testid enum).

---

## Ověřený stav (nepřepisovat, jen kontext)

**Approval hook** (`claude-approval-hook.mjs`):
- `classify()` (ř. 258–266) dělí příkaz na segmenty a zkouší tři matchery
  (`classifyGit` ř. 147–183, `classifyGh` ř. 186–202, `isDestructive` ř. 100–105).
- `classifyGh` dnes chytá JEN `gh pr create` → `pr.open` a `gh pr merge` → `pr.merge`.
  Jakýkoli `gh api …` vrací `null` → `main()` na ř. 381 `process.exit(0)` → příkaz
  běží bez brány (fail-open). Komentář na ř. 34–38 tuto díru sám přiznává
  („does NOT catch … `gh api … -X PUT …/merges`").
- Timeout rozhodnutí je fail-CLOSED (ř. 394–397) a `Task` delegace se klasifikuje
  vždy — fail-open je jen Bash klasifikace. Toto chování zachovat.
- Test fail-open defaultu existuje: `claude-approval-hook.test.ts:88-93`.

**HoldButton** (`HoldButton.tsx`):
- 900ms hold (ř. 24), pointer i klávesnice (Space/Enter držené, ř. 110–117) —
  klávesová cesta EXISTUJE, ale všechny cesty vyžadují nepřerušené ~900ms držení.
  Krátký klik/stisk = rollback (ř. 90–95). Žádná ne-časová alternativa.
- Používá se v `apps/web/features/runs/components/RunApprovalGate.tsx:109`
  (jen `highRisk`) a `apps/web/features/agents/components/ApprovalCard/ApprovalCard.tsx:115`.
  Pro vysoce rizikové schválení (platba/mazání) je hold JEDINÝ mechanismus —
  problém pro motorická omezení, switch-access a hlasové ovládání (WCAG 2.5.1/2.2.1).

---

## 17.1 — Approval hook: gating zápisových `gh api` volání

Cíl: známé mutační vzory `gh` přestat propouštět, přitom NEZMĚNIT celkový
fail-open kontrakt pro neznámé příkazy (vědomé designové rozhodnutí, zůstává
zdokumentované v hlavičce souboru; plný capability-based posun „ask by default"
je změna autonomní ergonomiky → samostatné operátorské rozhodnutí, mimo fázi).

V `classifyGh` doplnit větev pro `gh api <path> …`:

1. Mutační metoda: `-X`/`--method` s hodnotou `PUT|POST|PATCH|DELETE`
   (case-insensitive), NEBO přítomnost field flagů, které implikují POST:
   `-f`, `-F`, `--field`, `--raw-field`, `--input`.
2. Cílené mapování na existující intenty (sémantická shoda):
   - path obsahující `/merges` → intent `pr.merge` (REST merge = merge).
   - `POST` na path končící `/pulls` → intent `pr.open`.
3. Ostatní mutační `gh api` → nový generický intent (např. `gh.api_write`).
   PŘED zavedením nového druhu intentu prozkoumat, jak intenty tečou dál:
   kde je union/schéma druhů intentů (kontrakty? runner typy?), jak je čte
   gate-evaluator, POLICY floor a web (labely v approvals UI, `HIGH_RISK_TYPES`
   z fáze 31). Nový druh zapojit všude konzistentně (cs/en label, tone).
   Pokud by nový druh znamenal nepřiměřený zásah do kontraktů, je přijatelný
   fallback klasifikovat obecný mutační `gh api` jako `pr.merge`-ekvivalentní
   nejbližší existující druh s poznámkou v kódu — rozhodnout podle nálezu,
   rozhodnutí zapsat do commit message.
4. `GET`/`--paginate` bez mutační metody a bez field flagů zůstává nepoklasifikované
   (čtení je Tier-1).
5. Aktualizovat „Denylist honesty" komentář (ř. 34–38): `gh api` mutace už
   chytáme; zbylé přiznané díry ponechat vyjmenované.

Testy (`claude-approval-hook.test.ts`), minimálně:
- `gh api repos/o/r/pulls/1/merges -X PUT` → request s intentem merge, gate čeká.
- `gh api repos/o/r/pulls -f title=x` (implicitní POST) → gated.
- `gh api repos/o/r/pulls --method DELETE` → gated.
- `gh api repos/o/r/pulls` (čisté GET) → projde bez requestu (fail-open default trvá).
- Řetězení: `ls && gh api …/merges -X PUT` → gated (segmentace už existuje).

Commit: `phase 17.1: gate mutating gh api calls in approval hook classifier`.

## 17.2 — HoldButton: ne-časová alternativa potvrzení (arm → confirm)

Cíl: zachovat hold jako primární gesto, přidat rovnocennou diskrétní cestu
bez požadavku na souvislé držení či časové okno.

Chování:
- Dokončený hold (900ms) → `onConfirm` — beze změny.
- NOVĚ: diskrétní aktivace (klik/tap ukončený před dokončením holdu, nebo
  krátký stisk Space/Enter) místo tichého rollbacku přepne do stavu **armed**.
- Ve stavu armed další diskrétní aktivace (klik nebo Space/Enter) → `onConfirm`.
- Disarm: `Escape` nebo `blur`. ŽÁDNÝ časový limit na druhou aktivaci
  (timing-free — proto ne „dvojklik s oknem").
- Vizuál armed: stejný danger tón, progress ring plný/pulzující nebo ekvivalent
  v existujícím vizuálním jazyce komponenty; label se přepne na nový prop
  `armedLabel` (default anglicky, např. „Press again to confirm" — DS je
  i18n-agnostický; konzumenti v apps/web dodají cs překlad přes props, pokud
  RunApprovalGate/ApprovalCard labely překládají už dnes, jinak nechat default).
- A11y: armed stav oznámit (aria-live="polite" text nebo `aria-label` swap),
  `aria-pressed` nepoužívat (není toggle) — spíš popisný text.

Implementace:
- Rozšířit `HoldButtonTestId` enum o armed část(i) a navázat `data-testid`.
- Testy `getByTestId`-first (konvence DS): arm klikem, confirm druhým klikem,
  disarm Escape, disarm blur, hold cesta beze změny, klávesová arm/confirm cesta.
- Storybook: přidat story pro armed stav.
- Zkontrolovat oba konzumenty (RunApprovalGate, ApprovalCard) — nový prop je
  optional s defaultem, takže by neměli potřebovat změnu; pokud mají cs labely,
  doplnit `armedLabel` překlad.

Commit: `phase 17.2: HoldButton discrete arm→confirm path (timing-free a11y alternative)`.

## Ověření fáze

`pnpm lint && pnpm typecheck && pnpm test` zelené (fáze 45 memory: typecheck
volat přímo tsc -p pro apps/web pokud rtk maskuje). Žádný push — commit only
(Zákon 3, PR je brána).
