# Fáze 15 — ChatOrb jako skutečná 3D wireframe koule (Varianta B, react-three-fiber)

Rozsah: ÚZKÝ — pouze `apps/web/features/chat/components/ChatOrb.tsx` (+ nový
sourozenecký soubor pro WebGL scénu), minimální úprava call-situ v `ChatScreen.tsx`
(odvození dvou nových stavů) a nové závislosti `three` + `@react-three/fiber`.
Žádná změna agent identity, run karet, streamu ani HUD. Trillion referenční dojem
(/p/cosmic-orb-ui): drátěná 3D koule, která dýchá/deformuje se a mění barvu podle
stavu konverzace, na měkkém nebula pozadí. Chat je textový (žádný audio vstup),
takže deformace je řízená stavem konverzace, ne mikrofonem.

**Varianta B je operátorem explicitně odsouhlasená** — skutečná 3D deformovatelná
koule přes react-three-fiber, tj. vědomé přijetí nové závislosti a bundle nákladu.
Mitigace nákladu: lazy-load přes `next/dynamic({ ssr: false })`, three.js se stáhne
až při prvním otevření chat overlaye, HUD bundle se nemění.

## Nálezy z investigace (Fáze 0)

- **ChatOrb už NENÍ binární** — Fáze 14 zavedla
  `ChatOrbMode = "idle" | "listening" | "thinking" | "streaming" | "tool"`,
  render-only, řízený z `ChatScreen.tsx` (ř. ~216) čistě z
  `useChatStream` + `sendMessage.isPending` + `hasDraft` composeru. Zadání téhle
  fáze („jen idle/thinking") je v tomhle bodě zastaralé; „composing" ze zadání ≈
  existující `listening`. Reálné rozšíření = **přidat `waiting-approval` a `error`**.
- **`useChatStream`** už nese `error: string | null` (terminal `error` frame) —
  error mód orbu jde odvodit bez nového stavu; k tomu `sendMessage.isError`.
- **Signál pro waiting-approval EXISTUJE**: `TaskRunStatusSchema`
  (`libs/contracts/src/tasks/task-run.schema.ts`) obsahuje `awaiting-approval`,
  `parked` i `held`; `usePipelineRunQuery(runRef)`
  (`features/pipelines/queries/usePipelineRunQuery.ts`) ho už dnes čte pro
  `ChatRunCard` a je SSE-invalidovaná + 1s poll. `runRef` je na
  `ChatToolEvent.runRef` (optional).
- **Žádná 3D knihovna v repu** — ani three, ani r3f, ani framer-motion.
  React 19 + Next 15 ⇒ `@react-three/fiber@^9` (React 19 kompatibilní) + `three`
  (aktuální minor; typy jsou součástí `three` od r160+ přes `@types/three` — doplnit
  jako devDependency, three samotné typy neshipuje).
- **Testy běží v jsdom (vitest)** — WebGL kontext neexistuje. `ChatScreen.test.tsx`
  mountuje celý screen včetně orbu; orb tedy MUSÍ mít ne-WebGL render cestu, jinak
  testy spadnou. Selektory jdou přes `ChatOrbTestId.Root` + `data-mode`.
- **Tokeny** (globals.css): `--color-accent` #5b8def, `--color-accent-glow`,
  `--color-run` #7aa5f8 + `-glow`, `--color-bad` #ff6b6b + `-glow`, `--color-ok`.
  CSS custom property NEJDE přímo do WebGL uniformu — hodnoty se přečtou jednou
  přes `getComputedStyle(document.documentElement)` při mountu Canvasu (téma je
  statické dark), s hex fallbacky.
- **Keyframes `v-*`** v `libs/design-system/src/theme/globals.css` (ř. 357+) používá
  i zbytek voice sekce (`v-mode-in` na ChatScreen) — **nemazat**; orb jich po
  přechodu na 3D většinu přestane používat, ale úklid keyframes není v rozsahu.
- ChatOrb má file-level `eslint-disable react/forbid-dom-props` s odůvodněním —
  vzor se zachovává, žádné nové per-line disables.

## Rozhodnutí

1. **Závislosti: jen `three` + `@react-three/fiber`** (+ `@types/three` dev).
   Žádné `@react-three/drei` (potřebujeme jednu geometrii a jeden shader — drei
   by byl balast), žádný noise balíček (simplex noise = ~40 řádek GLSL inline).
2. **Struktura souborů**: `ChatOrb.tsx` zůstává veřejná komponenta (stejná cesta,
   stejné testid, `data-mode`). Uvnitř:
   - `ChatOrb.tsx` — wrapper `<div>` (testid, `data-mode`, 264px box), nebula CSS
     vrstva, `BrandIcon` overlay uprostřed, `next/dynamic(() => import("./ChatOrbSphere"), { ssr: false, loading: Fallback })`.
   - `ChatOrbSphere.tsx` — `"use client"`, r3f `<Canvas>` + wireframe koule.
   - Fallback (a zároveň jsdom/test render): statické jádro — radial-gradient disk
     s border glow (dnešní „core orb" bez SVG orbit) — takže testy nikdy nemountují
     WebGL a vizuálně nedojde k prázdnému flashi před doběhnutím dynamic importu.
3. **Koule**: `IcosahedronGeometry(radius≈78, detail 3)` + `ShaderMaterial`
   s `wireframe: true`. Vertex shader: 3D simplex noise
   `pos + normal * noise(pos * freq + time * speed) * amp` — „dýchání"/deformace.
   Fragment shader: barva uniform + fresnel-ish útlum k okraji. Pomalá kontinuální
   rotace (useFrame). Canvas `gl={{ alpha: true, antialias: true }}`, průhledné
   pozadí, `dpr` cap 2.
4. **Stavový union se ROZŠIŘUJE, nepřepisuje**:
   `ChatOrbMode = "idle" | "listening" | "thinking" | "streaming" | "tool" | "waiting-approval" | "error"`.
   Zpětně kompatibilní — existující volání se nemění, `MODE_VISUALS` lookup vzor
   zůstává (nové parametry: `color`, `noiseAmp`, `noiseSpeed`, `rotationSpeed`,
   `glow`, `pulse`).
5. **Odvození nových módů v ChatScreen** (priorita shora):
   `error` ← `stream.error !== null || sendMessage.isError`;
   `waiting-approval` ← poslední `runRef` z tool eventů (stream + poslední
   zprávy) a `usePipelineRunQuery(runRef)` vrací status
   `awaiting-approval | parked | held`;
   dál dnešní řetěz `tool → streaming → thinking → listening → idle` beze změny.
   Žádný nový state strom — jen rozšíření existujícího výrazu + jedna už existující
   query (stejná, kterou používá ChatRunCard, takže cache je sdílená).
6. **Barvy podle stavu** (jen existující tokeny):
   - `idle` — tlumený accent (nízká intenzita, pomalé dýchání)
   - `listening` — accent, o stupeň probuzenější (dnešní vzor)
   - `thinking` — plný `--color-accent`, rychlejší deformace
   - `streaming` — `--color-run`, nejrychlejší tok
   - `tool` — accent + výrazný puls (ekvivalent dnešních ripple ringů)
   - `waiting-approval` — `--color-bad` na nízké intenzitě, pomalý varovný puls
   - `error` — `--color-bad` plný
   **Přechody barev: `THREE.Color.lerp` v `useFrame`** (plynulé ~0.6s), ne React
   interpolace. (Zadáním navržená CSS transition na custom properties se na WebGL
   uniform nedá aplikovat — CSS přechod se použije na nebula vrstvě, viz bod 7.)
7. **Nebula pozadí**: CSS vrstva ve wrapperu (ne shader) — rozostřený radial
   gradient VĚTŠÍ než 264px box (`inset` záporný, ~-100px, `filter: blur`),
   kombinace `--color-accent-glow` + `--color-run-glow`; intenzita/odstín per mode
   přes inline CSS custom properties (`--orb-nebula-a/-b`) s `transition` — tady
   CSS přechod podle zadání dává smysl. Dýchání reuse `v-breath`/`v-glow-idle`.
8. **BrandIcon zůstává středem** (ZIBBY identita) — HTML overlay nad Canvasem,
   opacity/glow per mode jako dnes (`iconOpacity` v lookupu).
9. **`prefers-reduced-motion`**: deformace amplituda → ~0, rotace minimální,
   nebula puls vypnutý (media query v CSS, `useReducedMotion` ekvivalent přes
   `matchMedia` v Canvasu).
10. **Testy**: `ChatOrb` dostane vlastní `ChatOrb.test.tsx` (wrapper renderuje
    testid + `data-mode` pro všech 7 módů, fallback jádro přítomné);
    `ChatScreen.test.tsx` rozšířit o odvození `error` a `waiting-approval`
    (mock `usePipelineRunQuery` už v souboru je kvůli ChatRunCard). Žádné
    WebGL mocky — Canvas se v jsdom nikdy nemountuje (dynamic import).
11. **eslint**: file-level disable vzor zachovat v obou souborech (bespoke
    WebGL/inline dynamické hodnoty), žádné per-line disables.

## Kroky

### 15.1 — Závislosti + skeleton (commit 1)
- `pnpm add three @react-three/fiber --filter @zibby/web`,
  `pnpm add -D @types/three --filter @zibby/web` (root lockfile update).
- `ChatOrbSphere.tsx`: Canvas + statická wireframe koule (bez deformace),
  accent barva.
- `ChatOrb.tsx`: wrapper + dynamic import + fallback jádro; SVG orbity a ripple
  odstraněny (nahrazuje je koule), testid/data-mode/264px box zachovány.
- Testy stále zelené (jsdom vidí jen fallback).

### 15.2 — Deformace + nebula (commit 2)
- Vertex shader simplex noise (amp/speed uniformy), fresnel fragment, rotace.
- Nebula CSS vrstva s `--orb-nebula-*` + transition + breath.
- `prefers-reduced-motion`.

### 15.3 — Plný stavový set + barvy (commit 3)
- Union rozšířit o `waiting-approval` + `error`; `MODE_VISUALS` doplnit o barvu
  a dynamiku per mode (bod 6); `Color.lerp` přechody.
- `ChatScreen.tsx`: odvození `error` + `waiting-approval` (bod 5), minimální diff.
- BrandIcon opacity/glow per mode.

### 15.4 — Testy + vizuální ověření (commit 4)
- `ChatOrb.test.tsx` (nový) + rozšíření `ChatScreen.test.tsx`.
- Vizuální ověření přes dev server: dočasná dev-only preview stránka se všemi
  7 módy vedle sebe → Playwright screenshoty → stránka se PŘED finálním commitem
  smaže (není součást dodávky).
- `pnpm lint && pnpm typecheck && pnpm test` zelené; `graphify update .`.

## Akceptační kritéria

- Orb je skutečná 3D drátěná koule (rotace, noise deformace), ne ploché SVG orbity.
- Všech 7 módů vizuálně ověřeno screenshoty; barvy odpovídají bodu 6, přechody
  plynulé.
- three.js NENÍ v initial bundle HUD (dynamic import, ověřit `pnpm web:build`
  route metriky).
- Testy, lint, typecheck zelené; žádná změna mimo `features/chat` + package.json
  + lockfile (+ tenhle plán).
