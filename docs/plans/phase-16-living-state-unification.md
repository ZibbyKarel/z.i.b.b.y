# Fáze 16 — Sjednocení živého stavového jazyka (Chat-UI ⇄ HUD) na úrovni DS

Rozsah: `libs/design-system` (nový kanonický stavový slovník + sdílená „living glow"
primitiva) a přepojení dvou spotřebitelů — `apps/web/components/HudPanel` + DS `Card`
na jedné straně, `apps/web/features/chat/scene/*` + `ChatScreen` hlavička na druhé.
Žádná WebGL koule se nepřepisuje; sjednocuje se SLOVNÍK a ZDROJ, ze kterého oba čerpají.

CLAUDE.md už jako zákon tvrdí „HUD and Chat-UI share one visual language". Dnes to
v kódu NEPLATÍ na úrovni zdroje pravdy: kanonická 5-hodnotová paleta žije rozsypaná
v ~5 kopiích a „živý/animovaný" glow existuje dvakrát (WebGL orb + osiřelé keyframes).

---

## Fáze 0 — Inventura (kdo dnes vlastní definici stavové barvy/pohybu)

| Vlastník | Umístění | Slovník | Statické/Živé |
|---|---|---|---|
| `Card.tone` | `libs/design-system/src/components/Card/Card.tsx` | inline `accent\|ok\|warn\|bad\|run` (BEZ pojmenovaného typu) + `toneBorder`/`toneGlow` | STATICKÉ (color-mix box-shadow) |
| `CornersTone` | tamtéž | exportovaný `accent\|bad\|ok\|warn\|run` (duplikát `Card.tone`) | STATICKÉ |
| `TagTone` | `Tag/Tag.tsx` | `neutral\|accent\|ok\|warn\|bad\|run\|payment\|deletion\|push\|send` (badge+risk superset) | STATICKÉ |
| `DotTone` | `StatusDot/StatusDot.tsx` | `ok\|run\|wait\|bad\|idle\|accent` (přejmenuje warn→wait) | ŽIVÉ (`animate-live` pulse) |
| `RUN_STATE` | `apps/web/features/runs/run.ts` | `FeedStatus → {badge:TagTone, dot:DotTone, glyph, pulse}` | smíšené |
| `RISK_META`/`SEVERITY`/`UiTone` | `apps/web/features/approvals/approval.ts` | `UiTone = accent\|ok\|warn\|bad` + `cssVar` | STATICKÉ |
| `thinkingTone` | `components/RuntimeBadges/RuntimeBadges.tsx` | high→ok, medium→warn, low→neutral | STATICKÉ |
| `SeverityMeter` | `features/approvals/components/SeverityMeter.tsx` | inline `sev.cssVar` box-shadow glow | STATICKÉ |
| `SceneColorToken` | `features/chat/scene/tokens.ts` | **vlastní** `accent\|run\|ok\|bad` + **vlastní** `FALLBACK_HEX_BY_TOKEN` | ŽIVÉ (WebGL) |
| `SceneMode` | `features/chat/scene/sceneTypes.ts` | `idle\|listening\|thinking\|streaming\|tool\|waiting-approval\|error` | ŽIVÉ |
| `modeVisuals.BASE` | `features/chat/scene/modeVisuals.ts` | `SceneMode → OrbTarget{colorToken}` (streaming→run, error/waiting→bad, jinak accent) | ŽIVÉ |
| `ChatScreen` hlavička | `features/chat/components/ChatScreen.tsx` (`ACCENT` konst + `thinking` binární tečka) | ad-hoc | ŽIVÉ-ish |

**Tři jádrové problémy, které tenhle prompt řeší:**

1. **Kanonická 5-hodnotová paleta není JEDEN pojmenovaný DS export.** Je re-deklarovaná
   inline v `Card.tone`, duplikovaná jako `CornersTone`, vnořená do `TagTone`,
   re-odvozená jako `UiTone` v `approval.ts` a **znovu vytvořená s vlastními hex fallbacky
   jako `SceneColorToken`** v chat scéně.
2. **Mapování „bohatší stav → kanonická tón" žije jen v `modeVisuals.ts`** (`colorToken`)
   a `SceneMode` union je chat-privátní — nikde sdíleně zapsané pravidlo.
3. **„Živý/animovaný glow" existuje dvakrát**: (a) WebGL scéna (orb), (b) osiřelé
   `v-glow-idle`/`v-glow-hot`/`v-breath` keyframes (dnes už je čte jen `dockLayer.ts`).
   DS `Card`/`HudPanel` „živý" (`tone`) režim je přitom čistě STATICKÝ (`toneGlow`
   color-mix, žádná animace). `ChatScreen` hlavička má vlastní inline `ACCENT`+`thinking`.

Pozn.: Fáze 14/15 (chat living interface, 3D wireframe orb) už proběhly — realita se
odchýlila od původního zadání (orb je dnes WebGL scéna, ne inline CSS `ChatOrb.tsx`).
Podstata sjednocení ale platí beze zbytku a je o to naléhavější: scéna si zavedla
VLASTNÍ `SceneColorToken` + hex tabulku místo aby čerpala z DS.

---

## Fáze 1 — Jeden kanonický stavový slovník v DS

Nový soubor `libs/design-system/src/tokens/stateTone.ts`:

- `export type StateTone = "accent" | "ok" | "warn" | "bad" | "run"` — JEDINÝ
  sémantický zdroj pravdy „v jakém stavu něco je".
- `export const STATE_TONES: readonly StateTone[]` — pořadí pro iteraci/stories.
- `export const stateToneVar: Record<StateTone, string>` → `var(--color-<tone>)`.
- `export const stateToneHex: Record<StateTone, string>` → kanonické hex fallbacky
  (hex z globals.css: accent `#5b8def`, ok `#3fcf8e`, warn `#f0b429`,
  bad `#ff6b6b`, run `#7aa5f8`).
- `export function resolveStateToneHex(tone): string` — přečte computed CSS var
  jednou a cachuje (přesun logiky z `scene/tokens.ts#resolveSceneTokens`, aby WebGL
  i cokoli jiného četlo z JEDNOHO místa; scéna se na to přepojí ve Fázi 3).

Přepojení typů (žádný nový enum, jen zúžení na kanonický):
- `Card.tone` typ → `StateTone`; `CornersTone` → `export type CornersTone = StateTone`
  (alias, zpětně kompatibilní). Export `StateTone` z `libs/design-system/src/index.ts`.
- `approval.ts#UiTone` → `Extract<StateTone, "accent"|"ok"|"warn"|"bad">` (dokumentovat,
  že `run` se v UI tónu sbaluje na accent — chování beze změny).

Explicitní mapování bohatších chat stavů na 5 kanonických (zapsané v kódu jako
`SceneMode → StateTone` a v dokumentaci Fáze 4):
`idle/listening/thinking/tool → accent`, `streaming → run`,
`waiting-approval/error → bad`. (`done → ok`, `composing → accent` pro budoucí
konzumenty — pravidlo v doc.) Realizuje se retypováním `modeVisuals.colorToken`
na `StateTone` ve Fázi 3.

Commit: `phase 16.1: canonical StateTone as single DS source of truth`.

---

## Fáze 2 — Animovaná dimenze jako DS schopnost (`LivingGlow` + `Card living`)

1. **Tone-parametrizace keyframes** (`libs/design-system/src/theme/globals.css`):
   `v-glow-idle`/`v-glow-hot` dnes hardcodují `rgba(91,141,239,…)` (accent). Přepsat
   je na `color-mix(in srgb, var(--living-color, var(--color-accent)) X%, transparent)`
   — default zůstává accent, takže **stávající volání (`dockLayer.ts`) se nemění**,
   ale keyframe je nově tón-parametrizovatelný přes `--living-color`. `v-breath`
   (scale/opacity) je tón-agnostické, zůstává.

2. **Nová DS primitiva `LivingGlow`** (`src/components/LivingGlow/`):
   - Props: `tone?: StateTone` (default accent), `intensity?: "idle" | "hot"`
     (→ `v-glow-idle` vs `v-glow-hot`), `breathe?: boolean` (přidá `v-breath`),
     `radius?`, děti/overlay pozadí. Nastaví `--living-color: var(--color-<tone>)`
     přes DS `style` passthrough (jediné dynamické CSS var, povolený vzor).
   - `LivingGlowTestId` enum + `data-testid`, `data-tone`, `data-intensity`.
   - `respektuje prefers-reduced-motion` (`motion-reduce:animate-none`).
   - Test (`getByTestId`, tón/intensity jako asserty), story (všech 5 tónů × idle/hot),
     export z `index.ts`. (dle design-system SKILL.)

3. **`Card` `living?: boolean`**: když `tone && living`, místo statického `toneGlow`
   box-shadow vykreslí sdílenou animovanou glow vrstvu (`LivingGlow` uvnitř, absolutně
   umístěná pod obsahem). Bez `living` = dnešní statické chování beze změny.

Commit: `phase 16.2: LivingGlow DS primitive + tone-parametrized glow keyframes`.

---

## Fáze 3 — Přepoj oba spotřebitele na sdílené primitivy

**HUD strana:**
- `HudPanel` dostane `live?: boolean` → předá do `Card living`. Živé panely
  (running / awaiting-approval / system alert) tak dostanou STEJNOU animovanou glow
  jako orb, ne matný statický ring.
- (Ověřit callsites HudPanel s `tone` — `live` je opt-in, default false, nic se
  nerozbije.)

**Chat strana:**
- `scene/tokens.ts`: `SceneColorToken` → `import type { StateTone }` alias
  (`Extract<StateTone,"accent"|"run"|"ok"|"bad">`), smazat privátní
  `FALLBACK_HEX_BY_TOKEN`/`CSS_VAR_BY_TOKEN`, `resolveSceneTokens` deleguje na DS
  `resolveStateToneHex`. `CATEGORY_COLORS` (agentní taxonomie) je jiná osa — zůstává.
- `scene/modeVisuals.ts`: `OrbTarget.colorToken: StateTone`; mapování beze změny hodnot.
- `scene/dockLayer.ts`: `v-glow-hot` volání může nastavit `--living-color` per tón
  (nepovinné; default accent funguje).
- `ChatScreen.tsx` hlavička: nahradit inline `ACCENT` konstantu + `thinking` binární
  tečku sdílenou `StatusDot` primitivou řízenou kanonickým `mode → StateTone`
  (mapování z Fáze 1). Odstranit lokální `ACCENT`.

Commit: `phase 16.3: rewire HUD + chat consumers onto shared StateTone/LivingGlow`.

---

## Fáze 4 — Zapiš to

- Nový `libs/design-system/src/theme/LIVING-STATE.md`: kanonický 5-hodnotový
  `StateTone`, tabulka „kde staticky (Tag/Corners border, StatusDot matný,
  Card.toneGlow) × kde animovaně (LivingGlow, StatusDot pulse, orb)", mapování
  bohatých stavů (SceneMode/RunState/Risk) → 5 kanonických, a **pravidlo**: každá
  nová „je tohle živé a v jakém je stavu" komponenta bere `StateTone` + `LivingGlow`,
  nevymýšlí třetí paralelní systém.
- Krátká sekce/odkaz v `.claude/skills/design-system/SKILL.md`.

Commit: `phase 16.4: document the living-state contract`.

---

## Pořadí, verifikace, reporting

- 16.1 → 16.2 → 16.3 → 16.4; každá fáze samostatný commit, po každé fázi
  `pnpm lint && pnpm typecheck && pnpm test` zelené a krátký report co se sjednotilo.
- Po Fázi 3 `graphify update .`.
- Tenhle plán je základ pro Fáze 14/15 — ty už proběhly, takže 16 je návazný
  refaktor, který je sjednotí na jeden zdroj (ne přepis od nuly).

## Definition of done

Existuje JEDEN pojmenovaný `StateTone` exportovaný z DS, který používá Card, Corners
i chat scéna (přes DS hex resolver — žádná druhá hex tabulka); existuje JEDNA sdílená
`LivingGlow` DS primitiva reuse-ující `v-glow-*`/`v-breath` keyframes, kterou zapínají
HUD (`Card living`/`HudPanel live`) i chat (hlavička/scéna čerpají z téhož slovníku);
`ChatScreen` už nemá lokální `ACCENT`; kontrakt je zapsaný v `LIVING-STATE.md`.
`pnpm lint && pnpm typecheck && pnpm test` zelené po každé fázi.
