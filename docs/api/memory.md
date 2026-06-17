# Memory vault

## Co je vault

Vault je Obsidian-kompatibilní složka Markdown souborů — durable paměť ZIBBY napříč sezeními.
Není to vektorová databáze; retrieval je **index-first**: MOC soubory + deskriptivní názvy souborů.

Výchozí umístění: `apps/api/data/vault/`  
Přepsatelné přes `VAULT_DIR` env var.

## Tři tiery

| Tier | Složka | Účel |
|------|--------|------|
| `memory` | `vault/memory/` | Trvalé znalosti — fakta, rozhodnutí, kontext projektu |
| `daily` | `vault/daily/` | Denní log — append-only záznamy co se stalo |
| `knowledge` | `vault/knowledge/` | Tematické poznámky — hloubkové dokumenty |

## Formát poznámky

Každý soubor je `<id>.md` s YAML frontmatter:

```markdown
---
title: Delivery Loop — rozhodnutí o modelu
tags: [architekt, pipeline]
created: 2026-06-01
---

# Delivery Loop — rozhodnutí o modelu

Rozhodli jsme se použít Opus pro Architekta a Kodéra ...

Viz také [[zibby-north-star]], [[projekt-xy]].
```

### Note ID pravidla

- Filesystem-safe basename (bez separátorů cest)
- Regex: `/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/`
- Musí být unikátní napříč všemi tiery
- Validováno `resolveSafeFile` (path traversal ochrana)

## VaultService

**Soubor:** `apps/api/src/memory/vault.service.ts` (12.3 KB)

### Operace

```
GET  /api/memory/notes           seznam (s filtrem tier, full-text search)
GET  /api/memory/notes/:id       detail (title, body, tier, frontmatter, links, backlinks)
POST /api/memory/notes           vytvoření (id, title, tier, body)
PUT  /api/memory/notes/:id       aktualizace (title, body, frontmatter merge)
POST /api/memory/notes/:id/append   append textu na konec
DELETE /api/memory/notes/:id     smazání
```

### Wiki-linky a backlinky

- `[[target]]` v těle poznámky je extrahováno při každém čtení
- Zpětné linky (backlinks) jsou vypočítány on-the-fly skenováním všech souborů
- Bez grafu v paměti — jednoduché a konzistentní s file-based pravdou

### Full-text search

```
POST /api/memory/search
Body: { q: string, tier?: MemoryTier }
```

Prohledá title + body všech poznámek (nebo jen tieru) přes regex.

### Grafy

```
GET /api/memory/graph
```

Vrátí `{ nodes: Note[], edges: { source, target }[] }` pro force-directed vizualizaci.

### Denní poznámka

```
GET /api/memory/daily
```

Vrátí nebo vytvoří poznámku pro dnešní den v tieru `daily`.

## Index / MOC (Map of Content)

Index je speciální poznámka s wiki-linky jako vstupní body:

```
GET  /api/memory/index                    seznam indexů (tier: memory)
POST /api/memory/index/:indexId/link      přidej [[link]] do indexu
```

ZIBBY naviguje vault přes indexy — místo prohledávání všech souborů.

## GroundingService

**Soubor:** `apps/api/src/memory/grounding.service.ts`

Volá se na začátku každého runu (fail-open — výpadek vaultu run neblokuje):

1. Načte North Star poznámku (`zibby-north-star` nebo první MOC v `memory/`)
2. Načte relevantní indexy (vyhledá query v index titlech)
3. Načte několik nedávných poznámek z `daily/`
4. Vrátí spojený markdown kontext → předán agentovi jako `--append-system-prompt`

## RunRecorderModule

**Soubor:** `apps/api/src/memory/run-recorder.module.ts` a `run-recorder.service.ts`

Při dokončení runu (terminal state):
1. Zapíše marker `<!-- run:<runId> -->` do denní poznámky (idempotentní — opakované zápisy jsou bezpečné)
2. Appenduje outcome summary (1–2 věty co run udělal / selhal)
3. Aktualizuje relevantní indexy (pokud run produkoval nový kontext)

## MemoryDistillerModule

**Soubory:** `apps/api/src/memory/memory-distiller.module.ts`,
`memory-distiller.service.ts`, `claude-cli-distiller.ts`

Systémem vlastněné **učení z běhů** — výstupní zrcadlo groundingu. Grounding píše
kontext _dovnitř_ runu, distiller čte poznatky _ven_; agent přitom o žádné paměti
neví (učení NENÍ schopnost agenta). Spouští ho noční [systémová automatizace
`memory-distill`](./automations.md#destilace-paměti-memory-distill).

`MemoryDistillerService.distill()` projde terminální běhy pipeline/agentů/goalů, levný
model (haiku, fail-open) z nich vytáhne trvalé poznatky a uloží je jako jeden noční
digest `distilled-<datum>` v `knowledge/`, přilinkovaný z MOCů dotčených projektů.
Idempotence přes marker `memory-distilled.json` v `cwd` běhu. Detaily viz doc
automatizací.

> Pozn.: dřívější per-agent `learned.md` (kdy si dokumentační agent psal paměť sám)
> byl odstraněn — paměť se sbírá systémově, ne z popisu agenta.

## Izolace mezi projekty (M7)

Běh v projektu A se nikdy nesmí „dosáhnout" na paměť projektu B. Workspace je
izolovaný už strukturálně (per-projekt worktree z `project.path` + explicitní
`--add-dir` allowlist). Únik byl ve **čtecí cestě groundingu**: `compose` používal
`projectId` _aditivně_, zatímco `vault.index()` vracel všechny poznámky bez filtru —
běh v A si tak mohl přes shodu termínů natáhnout MOC projektu B.

Řešení (čistě restriktivní, bez migrace):

- `IndexEntry` nese `project` (vlastníka). Odvozuje ho `ownerProjectOf` z frontmatteru:
  explicitní tag `project: <id>`, nebo `type: project` profilová poznámka (její `id`).
  Poznámka bez vlastníka je **globální** (North Star, `knowledge/`, systémové digesty).
- `visibleToProject(entries, projectId)` zúží kandidáty _před_ term-matchingem: běh vidí
  jen globální poznámky + poznámky svého projektu; neatribuovaný běh vidí jen globální.
- Profilové poznámky (`vault/projects/<id>.md`) se značí `project: <id>`.

## Chybové stavy

| Error | HTTP | Kdy |
|-------|------|-----|
| `NoteNotFoundError` | 404 | ID neexistuje v žádném tieru |
| `InvalidNoteIdError` | 422 | ID obsahuje `/`, `..`, nebo začíná `.` |
| `DuplicateNoteError` | 409 | ID už existuje (i v jiném tieru) |
