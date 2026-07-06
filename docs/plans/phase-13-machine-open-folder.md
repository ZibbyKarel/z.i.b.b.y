# Fáze 13 — Nová machine akce: otevřít složku (`open-folder`)

## Nálezy z investigace (Fáze 0)

- Machine vrstva UŽ EXISTUJE a je plně gatovaná:
  `libs/contracts/src/machine/machine.schema.ts` má discriminated union
  `MachineActionSchema` se dvěma variantami (`rename-files`, `open-maps`);
  `apps/api/src/machine/machine.service.ts` je `ResumableRunner` pro approval kind
  `machine` (propose → dry-run `plan()` + Tier-3 approval → operátorův approve →
  `resume()` → `execute()`; reject → `cancel()`); `MachineActionStore` persistuje
  záznamy (files are the source of truth).
- `open-maps` je vzor pro low-risk akci: `plan()` vrací
  `{ preview: [], gateAction: "maps.open", detail, risk: "low" }`, `execute()` volá
  injektovatelný `UrlOpener` (macOS `open`, testy injektují stub).
- Chat surface: `apps/api/src/chat/chat-tools.service.ts` má `proposeRename` /
  `proposeOpenMaps`, registrované jako MCP tools v
  `apps/api/src/chat/chat-mcp.controller.ts` (ř. ~141, ~155).

## Rozhodnutí

1. **Žádný nový schvalovací mechanismus** — třetí varianta unionu projde stávajícím
   approvals flow beze změny.
2. **Risk `"low"`, gateAction `"fs.open"`** (zadání) — otevření okna Finderu nic
   nemodifikuje; dry-run jen ověří existenci adresáře.
3. **Fail-closed preview**: neabsolutní cesta nebo neexistující/ne-adresář →
   `MachineActionRejectedError` (422), stejný vzor jako `previewRenames`.

## Kroky

### 1. Kontrakt (`libs/contracts/src/machine/machine.schema.ts`)

- `OpenFolderActionSchema = z.object({ kind: z.literal("open-folder"), path: z.string().min(1) })`
  (+ JSDoc: otevře složku ve správci souborů operátora; reversibilní, ale pořád
  gatované — nic se na stroji nespouští potichu). Přidat do
  `MachineActionSchema` unionu, exportovat typ, doplnit contract test
  (validní akce, prázdná path selže, union rozlišuje kind).

### 2. `MachineService`

- `plan()`: case `"open-folder"` — `path.isAbsolute` check, `fs.stat` musí být
  adresář (nic nemodifikuje), jinak `MachineActionRejectedError`. Vrací
  `{ preview: [], gateAction: "fs.open", detail: \`Open folder: ${path}\`, risk: "low" }`.
- `execute()`: case `"open-folder"` — před akcí re-verify (`fs.stat` adresář — svět
  se mohl pohnout), pak `this.opener(action.path)` (macOS `open /cesta` otevře
  Finder; `UrlOpener` typ/jméno případně zobecnit komentářem, signatura sedí).
  Vrací summary `opened folder ${path}`.
- Testy vedle stávajících machine testů: propose vytvoří proposed záznam s approval,
  reject nechá disk netknutý, approve zavolá opener právě jednou s cestou,
  neexistující složka → 422/refused, execute po smazání složky mezi propose a
  approve → `failed` záznam (fail-closed), idempotence resume.

### 3. Chat surface

- `ChatToolsService.proposeOpenFolder(path: string)` — analogicky k
  `proposeOpenMaps` (česká odpověď, `MachineActionRejectedError` → zpráva, ne pád).
- `chat-mcp.controller.ts`: registrace MCP toolu (`propose_open_folder` — držet
  konvenci pojmenování ostatních dvou), zod input `{ path }` s popiskem.
- Testy chat-tools: úspěch vrací potvrzení s cestou, rejected guard vrací zprávu.

### 4. UI (jen pokud existuje enumerace kinds)

- Grep `rename-files`/`open-maps` v `apps/web` — pokud fronta schválení/aktivity
  renderuje per-kind texty či ikony, doplnit `open-folder` (i18n cs+en). Pokud UI
  renderuje generic detail string, žádná změna.

## Definition of done

`pnpm lint && pnpm typecheck && pnpm test` zelené; `open-folder` jde navrhnout přes
MCP tool i přímé API, čeká v approval frontě, approve otevře složku, reject nic
neprovede; `rename-files`/`open-maps` chování beze změny.
