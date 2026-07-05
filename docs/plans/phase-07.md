# Plán fáze 07: Logo projektu (nahrání místo glyphu, glyph jako fallback)

> **TODO.md #2** — _„u projektů chceme mít možnost místo glyphu nahrát logo a
> zobrazit ho na kartě projektu. Glyph bude jako fallback."_

---

## Zjištění (ověřeno v kódu)

- **Karta projektu** `apps/web/features/projects/components/ProjectCard.tsx`
  renderuje `HudCard` s natvrdo `glyph="code"` (řádek 86). Sem přijde logo.
- **`HudCard`** (`apps/web/components/HudCard/HudCard.tsx`) je app-komponenta
  (ne v `libs/design-system`), vede vizuál přes `IconTile glyph={glyph ?? "bot"}`.
- **`IconTile`** (`libs/design-system/src/components/IconTile/IconTile.tsx`) je
  DS primitiv: bordovaný čtverec/kruh s pevnou px velikostí
  (`style={{ width: px, height: px }}` — DS-interní inline style, povolený).
  **Renderuje `children` místo glyphu**, když jsou předány. To je páka pro
  vložení obrázku.
- **Editační formulář projektu** `ProjectBasicsPanel.tsx` (`onSave(body:
  ProjectBasicsBody)`) je jediné místo úprav (žádný dialog) — tvoří i vytváří
  (`isNew`). Sestavuje `ProjectBasicsBody` v `onSubmit`. `ProfileScreen.tsx` ho
  mapuje na create/update mutaci.
- **Schéma** `libs/contracts/src/projects/project.schema.ts`: `ProjectSchema`
  (žádné logo pole). `CreateProjectSchema`/`UpdateProjectSchema` odvozené.
  Projekty se ukládají do registru `_projects.json` (backend), **žádný upload
  endpoint neexistuje**.

## Rozhodnutí o uložení (explicitní — dle DNA „files are source of truth")

Logo ukládáme jako **data-URI (base64) string na entitě projektu** (`logo?:
string`), ne přes nový multipart/upload endpoint. Důvody: personal-scale (pár
projektů), žádná nová statická cesta ani file-serving, registr JSON zůstává
source of truth. **Cena / omezení:** base64 se čte v `GET /projects`. Proto
**tvrdý strop velikosti** (odmítni logo > ~200 KB v base64) a validace, že jde
o `data:image/*`. _Deferred (mimo rozsah):_ přesun na file-storage + statické
servírování, kdyby logo byla zátěž.

## Rozhodnutí o DS (explicitní — „add to DS vs local")

Obrázkový režim patří do DS primitivu, ne do app kódu (apps/web nesmí psát
vlastní Tailwind/inline-style na DOM). **Rozšíříme `IconTile`** o obrázkový
režim — kohézní, protože IconTile už je ten vedoucí vizuál a už řídí velikost/
radius/shape.

---

## Návrh řešení

### 1. Contract (`project.schema.ts`)

Přidej na `ProjectSchema`:
```ts
/** Optional custom logo as a data URI (data:image/*;base64,…). Fallback: glyph.
    Capped ~200 KB to bound the registry read; absent → the default glyph shows. */
logo: z.string().startsWith("data:image/").max(280_000).optional(),
```
(280 000 znaků base64 ≈ ~200 KB binárně.) `Create/UpdateProjectSchema` to
zdědí automaticky (jsou odvozené). Nic dalšího v API se nemění — storage service
persistuje celou entitu.

### 2. DS `IconTile` — obrázkový režim

- Nové volitelné props: `src?: string`, `alt?: string`.
- Když je `src` a nedošlo k chybě načtení → renderuj `<img src alt>` vyplňující
  dlaždici: `width:100%; height:100%; object-fit:cover` + zděděný radius/shape
  (přes `cn`/style uvnitř DS — povoleno). Jinak stávající glyph/children.
- **Fallback na chybu:** interní `useState(hasError)`; `<img onError>` →
  `hasError=true` → vyrenderuj glyph. Takže rozbité/nevalidní logo spadne na
  glyph, přesně jak TODO chce.
- Testid: přidej `IconTileTestId.Image`.
- **Story + test** (DS má povinné story/testy): story s `src` i fallback;
  test — `src` renderuje img se správným `alt`; `onError` přepne na glyph;
  bez `src` je glyph. Selektory `getByTestId`.

### 3. `HudCard`

- Nová volitelná propsa `logoSrc?: string` (+ `logoAlt?: string`, default =
  `title`). Předej do `IconTile src={logoSrc} alt={logoAlt} glyph={glyph ??
  "bot"}`. Když `logoSrc` chybí → beze změny (glyph).

### 4. `ProjectCard`

- Předej `logoSrc={project.logo}` do `HudCard` (glyph zůstává `"code"` jako
  fallback). `logoAlt={project.name}`.

### 5. Upload UI v `ProjectBasicsPanel`

- Přidej řízený „logo" blok: náhled (současné/nově vybrané logo v `IconTile
  src=...`) + tlačítko „Nahrát logo" (skrytý `<input type="file"
  accept="image/*">` odpálený z DS `Button`/`Pressable`) + „Odebrat".
- Handler: `FileReader.readAsDataURL(file)` → validace `type.startsWith("image/")`
  a výsledná délka ≤ strop (jinak toast/chyba přes stávající mechanismus) →
  ulož do lokálního `useState(logo)`.
- Rozšiř `ProjectBasicsBody` o `logo?: string`; v `onSubmit` přidej `logo:
  logo || undefined`. Mount-key `key={project?.id ?? "new"}` už resetuje stav.
- **Žádný raw `<input>` se stylem** — input skrytý (vizuálně) přes DS
  container/utility; klik proveď programově z DS tlačítka. Řádkový `style` na
  DOM jen s `// eslint-disable-next-line react/forbid-dom-props` a komentářem,
  pokud DS nemá ekvivalent (drž se vzoru HudCard line-clamp).

### 6. `ProfileScreen`

- Přidej `logo` do mapování `ProjectBasicsBody` → create/update tělo (projde do
  mutace jako každé jiné pole).

### 7. i18n

- Klíče `projects.fields.logo`, `projects.fields.logoUpload`,
  `projects.fields.logoRemove`, `projects.fields.logoTooLarge` (cs default + en).

---

## Kroky

1. Contract: `logo` na `ProjectSchema` (+ ověř, že Create/Update dědí).
2. DS `IconTile`: `src`/`alt` obrázkový režim + fallback + testid + story +
   test.
3. `HudCard.logoSrc` → IconTile.
4. `ProjectCard` předá `project.logo`.
5. `ProjectBasicsPanel`: upload blok + `ProjectBasicsBody.logo` + onSubmit.
6. `ProfileScreen`: passthrough `logo`.
7. i18n cs/en.
8. Testy (DS IconTile, ProjectCard/HudCard render s logem, ProjectBasicsPanel
   upload happy-path + too-large).
9. `pnpm lint && pnpm typecheck && pnpm test` zelené.

## Mimo rozsah

- Nový upload/multipart endpoint ani statické servírování (deferred).
- Ořez/resize obrázku na klientu (jen validace mime + strop velikosti).
