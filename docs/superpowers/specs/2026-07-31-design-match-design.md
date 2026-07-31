# design-match — pixel-perfect implementace designu z Claude artifactů

**Datum:** 2026-07-31
**Stav:** schválený návrh, čeká na implementační plán

---

## Problém

V `design/Z.I.B.B.Y/` leží jedenáct designových mockupů — HTML artifacty z Claude
(React 18 UMD + Babel standalone, sdílené moduly v `zibby/*.jsx`, Geist a
JetBrains Mono z Google Fonts, tmavé pozadí `#0b0e13` / `#05070a`). Když se z nich
implementuje UI v `apps/web` nebo `libs/design-system`, výsledek **není spolehlivě
1:1**. Rozdíl je typicky v hodnotách, které se z obrázku nedají odhadnout: 14px
místo 16px, `gap` o dva pixely vedle, jiný odstín textu, jiný shadow spread.

Příčina je metodická, ne o snaze: implementuje se podle **dojmu z obrázku**, ne
podle **naměřených čísel** — přestože design je živý DOM, ze kterého se přesná
čísla dají vytáhnout.

## Řešení v jedné větě

Skill, který designový mockup **změří** přes Playwright (`getComputedStyle` +
`getBoundingClientRect`), implementuje proti naměřeným číslům, a teprve pak
screenshotem a pixel diffem ověří shodu — v ohraničené smyčce, která při
nekonvergenci zaparkuje artefakt pro člověka.

---

## Rozhodnutí (schválená)

| #   | Otázka                          | Rozhodnutí                                                                                                                        |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Čím se měří shoda?              | **Extrakce computed styles z design DOM → `spec.json`, implementace proti číslům, pixel diff jako kontrola.** Ne odhad z obrázku. |
| 2   | Jak se pojmenuje výřez designu? | **Volný popis + inventura.** Skill nabídne číslované kandidáty s náhledy, operátor potvrdí. Mockupy nemají stabilní selektory.    |
| 3   | Naměřená hodnota bez DS tokenu? | **Design je pravda — vždy se zavede nový token.** Diff má dojít na nulu.                                                          |
| 4   | Nekonvergující smyčka?          | **Bounded loop + park.** Max 5 kol, detekce thrashingu, kompletní artefakt pro člověka.                                           |

### Poznámka k rozhodnutí 3

Volba „design je pravda" byla učiněna vědomě, s uvedeným rizikem růstu DS.
Návrh ji nijak neomezuje, přidává jen dvě věci, které ji drží čitelnou:

- **Sémantické pojmenování.** Nový token se pojmenuje podle role v designu
  (`--zt-fg-secondary`), nikdy podle hexu (`--zt-fg-c9d4e8`).
- **Viditelný bloat.** `tokens.md` vede u každého nového tokenu vedle sebe
  nejbližší existující token a ΔE / Δpx. Pozdější konsolidace tak má podklad.

Zápis nových tokenů do `libs/design-system` je **gate** — mění se sdílený systém,
takže se seznam předloží ke schválení před zápisem.

---

## Architektura

### Tvar

Projektový skill `.claude/skills/design-match/`, volaný `/design-match`.

```
/design-match "design/Z.I.B.B.Y/ZIBBY Roadmap.html" "karta epicu" --route /roadmap
/design-match "design/Z.I.B.B.Y/ZIBBY Velin-D.html" "orb subsystému"
```

```
.claude/skills/design-match/
  SKILL.md
  scripts/
    measure.mjs     # F1 + F2 — inventura výřezů a extrakce computed styles
    shoot.mjs       # F4 — screenshot appky (story | route | mask)
    compare.mjs     # F5 — pixelmatch + re-měření app DOM → delta report
  references/
    computed-props.md   # whitelist CSS vlastností a zdůvodnění
    scene-recipes.md    # jak postavit Storybook story / seed / mask
```

**Dělba práce:** deterministickou práci dělají skripty, model dělá rozhodnutí.
Kdyby měřil model z obrázku, jsme zpátky u odhadování. Skript vrátí číslo.
Vedlejší efekt je úspora tokenů — do kontextu jde `spec.json`, ne screenshoty
v každém kole.

### Datový tok

```
design.html ──measure.mjs──▶ spec.json + design.png
                                  │
                    tokens.md ◀───┤  (mapování na DS, gate na nové tokeny)
                                  │
                       implementace (DS komponenta | app composite)
                                  │
                    shoot.mjs ────▶ app.png
                                  │
                  compare.mjs ────▶ diff.png + delta report
                                  │
                        ┌─────────┴─────────┐
                   shoda?                 ne → další kolo (max 5)
                        │                        │
                     hotovo                    park
```

---

## Fáze

### F1 · Zaměření

Playwright otevře mockup přes `file://`, počká na mount — `#root` má potomky
**a** `document.fonts.ready` je resolved. Viewport 1440×900, DPR 2 (stejný na obou
stranách; DPR se nikdy nemíchá).

Inventura: projde DOM, vyfiltruje viditelné bloky ≥ 24×24 px (mimo `html`/`body`),
seřadí fuzzy shodou operátorova popisu proti `className`, `textContent` a
`data-*` atributům, top 5 ořízne do náhledových PNG a vypíše číslované menu
s rozměry a pozicí. Operátor potvrdí číslo.

```
Inventura regionů (1440×900):
  [1] div.epic-card        328×156 @ (24,180)   ▸ r1.png
  [2] div.epic-card-header 328× 40 @ (24,180)   ▸ r2.png
  [3] section.board-col    360×812 @ (12,120)   ▸ r3.png
  [4] div.epic-row         328× 28 @ (36,240)   ▸ r4.png
```

**Preflight fontů.** F1 zároveň ověří, že obě strany mají shodnou font stack
(rodina, váhy, `font-display`, subset). Mockupy tahají Geist a JetBrains Mono
z Google Fonts; pokud je appka servíruje jinak (`next/font`, jiný subset,
fallback), diff nikdy nesedne a smyčka bude honit rozdíl, který není v kódu.
Při neshodě se zastaví **hned**, ne až v pátém kole.

**Preflight CDN.** Mockupy tahají React UMD, Babel standalone a `three.js`
z unpkg/cdnjs. Bez sítě se nevykreslí vůbec — a prázdný screenshot vypadá jako
validní vstup. Skill si assety při prvním běhu nacachuje lokálně
(`.design-match/.cdn-cache/`) a přepíše `<script src>` na cache. Selže-li to,
fail-fast s jasnou hláškou místo tichého prázdného snímku.

### F2 · Měření

Na potvrzeném uzlu a jeho potomcích (do konfigurovatelné hloubky, default 4):

- `getComputedStyle` přes **whitelist** vlastností, ne všech ~340: box model,
  typografie, barvy, border / radius / shadow, flex / grid, transform / opacity /
  transition. Whitelist a zdůvodnění žije v `references/computed-props.md`.
- `getBoundingClientRect` relativně k rootu výřezu → geometrie nezávislá na tom,
  kde výřez na stránce leží.
- Pseudo-elementy `::before` / `::after` — v mockupech nesou dekorace (linky,
  tečky, gradientní okraje), které by se jinak ztratily.

Výstup: `spec.json` (strom uzlů, každý s rolí odvozeným jménem) a `design.png`
(screenshot výřezu při shodném viewportu a DPR).

### F3 · Mapování tokenů

Načte DS tokeny z `libs/design-system` (`@theme` bloky, Tailwind v4 CSS-first).
Pro každou naměřenou hodnotu:

- **přesná shoda** → použije se existující token
- **jinak** → navrhne se nový token, pojmenovaný sémanticky podle role

`tokens.md` vede u každého nového tokenu nejbližší existující + ΔE (barvy) nebo
Δpx (rozměry), aby byl růst DS viditelný.

**Gate:** seznam nových tokenů se předloží ke schválení před zápisem do DS.

### F4 · Implementace

**Cíl zápisu se rozhodne explicitně** (podle `CLAUDE.md` — nikdy implicitně):

- existuje odpovídající DS primitiv → composite v
  `apps/web/features/<domain>/components/`
- primitiv chybí → předloží se volba _přidat do DS_ vs. _držet lokálně_

**Scéna pro screenshot** — tři režimy, v tomto pořadí preference:

| Režim                                         | Kdy                                                                   | Jak                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **C — Storybook** (default pro DS komponenty) | komponenta jde vyrenderovat izolovaně                                 | story s props odpovídajícími mockupu, screenshot story iframu                                                 |
| **A — seed + routa**                          | testuje se kompozice celé stránky                                     | seed fixture do `.e2e-data`, boot app + api přes stávající `playwright.config.ts` webServer, screenshot routy |
| **B — mask** (fallback)                       | blok nejde deterministicky naseedovat (relativní časy, live countery) | `screenshot({ mask: [...] })`                                                                                 |

Maskované regiony se **vždy** vypíšou v reportu. Nikdy se nemaskuje tiše —
maskovaný region je nezkontrolovaná plocha a musí to být vidět.

### F5 · Smyčka

Screenshot appky při identickém viewportu a DPR → pixelmatch proti `design.png`.

**Delta report je dvouvrstvý** — a tohle je jádro celého skillu:

1. **pixel diff** řekne _kde_ (souřadnice, plocha, intenzita)
2. **re-měření app DOM proti `spec.json`** řekne _proč_
   (`node header: gap 12px vs 16px`)

Oprava je tím adresná, ne hádaná. Bez druhé vrstvy je pixel diff jen červená
mapa bez příčiny a smyčka se zacyklí.

**Ukončovací podmínky:**

- **hotovo** = diff < 0.5 % **a** žádný souvislý odlišný region > 4×4 px
- **strop** = 5 kol
- **thrashing** = pokles diffu za kolo < 20 % relativně → stop dřív

```
kolo 1  diff 18.4 %  → 32 delt opraveno
kolo 2  diff  4.1 %  → 11 delt
kolo 3  diff  1.2 %  →  4 delty
kolo 4  diff  0.9 %  →  pokles jen 25 %… hranice
kolo 5  diff  0.8 %  →  pokles 11 %  ▶ STOP (thrash)
```

**Park** zapíše kompletní artefakt, ne prázdné „nepovedlo se":

```
.design-match/<slug>/
  spec.json      naměřený design
  tokens.md      mapování + nové tokeny + ΔE
  design.png     výřez mockupu
  app.png        poslední stav implementace
  diff.png       diff maska
  report.md      nevyřešené delty s příčinou
  round-*.json   historie kol
```

`.design-match/` se přidá do `.gitignore`.

---

## Kalibrace

Než se skill pustí na nový výřez, spustí se na komponentu, která už je
implementovaná dobře, a změří se zbytkový diff.

- vrátí-li ~0 → harness je čistý
- vrátí-li 0.8 % → je to **šum měření** (antialiasing, subpixel hinting, DPR) a
  musí se pojmenovat dřív, než se podle něj začne opravovat kód

Bez kalibrace nejde odlišit chybu implementace od chyby přístroje. Kalibrační
běh je součástí implementace skillu, ne volitelný krok.

---

## Testování

- **Skripty** (`measure.mjs`, `shoot.mjs`, `compare.mjs`) mají smoke testy proti
  jednomu zafixovanému mockupu — inventura vrací očekávané kandidáty, extrakce
  vrací očekávané hodnoty pro známý uzel, pixelmatch vrací 0 pro identický vstup.
- **Skill jako celek** se ověří kalibračním během (viz výše).
- Testy nespouštějí síť — CDN cache je předpokladem, ne součástí testu.

## Error handling

| Situace                              | Chování                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| mockup se nevykreslí (CDN, JS chyba) | fail-fast s hláškou; nikdy neposílat prázdný screenshot dál |
| font stack se liší                   | zastavit v F1, vypsat obě stacky                            |
| popis nesedí na žádný region         | vypsat top 10 kandidátů, ať operátor vybere ručně           |
| dev server neběží (režim A)          | spustit přes `playwright.config.ts` webServer, jinak fail   |
| smyčka nekonverguje                  | park s artefaktem (viz F5)                                  |

---

## Co je mimo rozsah

- **Animace a motion.** Skill porovnává statické snímky. Mockupy obsahují
  `@keyframes` a three.js scény; jejich shoda se neověřuje.
- **Responzivita.** Jeden viewport (1440×900) na běh. Jiný breakpoint = jiný běh.
- **Interakční stavy.** Hover / focus / active nejsou v v1. Přidatelné později
  jako varianty scény.
- **Automatická konsolidace tokenů.** `tokens.md` dává podklad, konsolidaci dělá
  člověk.
