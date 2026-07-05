# Plán fáze 06: Sbalovací log u běhu tasku

> **TODO.md #1** — _„sbalovací log u běhu tasku (potřebujeme mít defaultně
> sbalenou část logu, která je o tom který nástroj se použil nebo který script
> běžel)"._
>
> Motivace: log běhu je dnes jeden souvislý proud — vlastní text agenta
> (markdown) je proložený hlučnými bloky spuštěných nástrojů a jejich výstupů
> (`● Bash(pnpm test)` + mnohařádkový `⎿` výstup). Chceme, aby výstup nástroje
> byl **defaultně sbalený**, takže operátor čte hlavně narativ agenta a detail
> nástroje/scriptu si rozklikne, když ho potřebuje.

---

## Zjištění (ověřeno v kódu)

- **Rendering řádků logu je v `RunTranscript.tsx`**
  (`apps/web/features/runs/components/RunTranscript.tsx`). `RunTranscript`
  přebírá `text`, přeparsuje ho přes `parseTranscript` a mapuje segmenty na
  komponentu `Segment` (switch na `seg.kind`).
- **Parser `parseTranscript`** (`apps/web/features/runs/transcript.ts`) vrací
  `TranscriptSegment[]` s variantami `text | thinking | tool | result | system
  | footer`. Klíčové pro nás:
  - `tool` = řádek `● ` (volání nástroje / scriptu — např. `Bash(pnpm test)`),
  - `result` = blok `⎿ ` (výstup nástroje / stdout scriptu, mnohařádkový,
    poskládaný z 5-mezerových pokračovacích řádků).
  V logu jde **`result` bezprostředně za** `tool`, který ho vyvolal.
- **DS má lehký `Pressable`** (`libs/design-system/src/components/Pressable`) a
  precedent ručně dělaného show-more toggle v `RunDetail`'s `TaskDescription`.
  `Accordion`/`AccordionItem` je pro tenhle účel moc těžký (ohraničený box na
  každé volání nástroje by byl vizuálně přeplácaný) — použijeme lehčí inline
  fold.
- **Testy k dotčení:** `RunTranscript.test.tsx` (rendering segmentů) a
  `transcript.test.ts` (parser). Parser sám neměníme, jen přidáme grupovací
  krok nad jeho výstupem — takže `transcript.test.ts` zůstává, přidáme test na
  grupování + fold do `RunTranscript.test.tsx`.

---

## Návrh řešení

### 1. Grupovací krok nad segmenty (`transcript.ts`)

`parseTranscript` **neměníme** (parser zůstává čistý a jeho testy platí).
Přidáme čistou funkci:

```ts
export type TranscriptGroup =
  | TranscriptSegment                                   // vše ostatní beze změny
  | { kind: "toolCall"; tool: string; result?: string }; // ● + navazující ⎿

export function groupTranscript(segments: TranscriptSegment[]): TranscriptGroup[]
```

Logika: projdi `segments`; když narazíš na `tool`, koukni na následující
segment — pokud je `result`, slož je do `{ kind: "toolCall", tool: seg.text,
result: next.text }` a přeskoč `next`; jinak `{ kind: "toolCall", tool:
seg.text }` (nástroj bez výstupu). Osamocený `result` (bez předchozího `tool` —
v praxi vzácné) nech projít jako dnes. Ostatní segmenty projdou beze změny.

### 2. Lehká sbalovací komponenta (`RunTranscript.tsx`)

- Nová interní komponenta `ToolCallSegment({ tool, result })`:
  - **Trigger řádek je vždy vidět**: `●` (accent) + text nástroje (`tool`) —
    přesně jak dnes vypadá `case "tool"`. Přidej vlevo caret `▸`/`▾`
    (collapsed/expanded) a celý řádek udělej klikací přes `Pressable`
    (`role="button"`, `aria-expanded`).
  - **Tělo (`result`) je defaultně sbalené**: `useState(false)`. Po rozkliknutí
    se pod triggerem vyrenderuje blok `result` (stejná mono `Typography` jako
    dnešní `case "result"`).
  - Pokud `result` chybí, caret se nezobrazí a řádek není klikací (není co
    rozbalit) — jen `●` + text.
- `RunTranscript` přejde z `parseTranscript(text).map(Segment)` na
  `groupTranscript(parseTranscript(text)).map(...)`: pro `toolCall` renderuj
  `ToolCallSegment`, pro vše ostatní stávající `Segment`.
- **Follow-tail chování zůstává** (memo na `text`, scroll na `scrollKey`).
  Sbalený stav je lokální per-segment `useState` — nový segment na konci tailu
  se přidá sbalený, existující si drží svůj stav (klíč `key={i}` zůstává).

### 3. Testid + i18n

- Rozšiř `RunTranscriptTestId` o `ToolCall = "run-transcript-tool-call"` a
  `ToolResult` (znovu-použij stávající `Result` testid na tělo, aby stávající
  aserce platily). Trigger dostane `ToolCall` testid; caret vlastní testid
  `ToolCaret`.
- Aria: trigger `aria-expanded`, `aria-label` z i18n (klíč
  `RunTranscript.toggleToolOutput` v `cs`/`en` katalogu, cs default). Pokud
  `RunTranscript` dnes žádné `t()` nemá, drž se vzoru DS (string prop s EN
  defaultem) — nová volitelná propsa `toggleLabel?: string` s defaultem, a
  `RunLogStream` ji naplní přes `useTranslations`. Rozhodni podle toho, co dnes
  dělají sourozední (drž jednu cestu — nemíchej).

### 4. Testy

- `transcript.test.ts` (nebo nový `groupTranscript` blok): `● Bash(x)` +
  `  ⎿ out` → jeden `toolCall` s `result`; osamocený `● foo` → `toolCall` bez
  `result`; text/thinking/system/footer projdou beze změny; dva nástroje po
  sobě se nespojí.
- `RunTranscript.test.tsx`: tělo `result` je **defaultně skryté**; klik na
  trigger ho odhalí (`getByTestId(RunTranscriptTestId.ToolCall)` → click →
  `Result` je vidět); nástroj bez výstupu nemá klikací trigger. Selektory přes
  `getByTestId` (konvence projektu), role/aria jen jako aserce.

---

## Kroky

1. `groupTranscript` + typ `TranscriptGroup` do `transcript.ts` (+ unit testy).
2. `ToolCallSegment` + přepojení mapy v `RunTranscript.tsx`; rozšířit
   `RunTranscriptTestId`; i18n label.
3. Testy `RunTranscript.test.tsx`.
4. `pnpm lint && pnpm typecheck && pnpm test` (web-components projekt) — vše
   zelené.

## Mimo rozsah

- Neměnit serverový formátovač logu (`claude-stream-format.ts`) ani plain-log
  jako source of truth.
- Neřešit persistenci sbaleného stavu mezi reloady (lokální UI stav stačí).
