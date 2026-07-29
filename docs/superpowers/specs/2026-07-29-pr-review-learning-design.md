# Učení z code-review komentářů na PR — v1 (paměť)

**Datum:** 2026-07-29
**Zdroj:** `TODO.md`, bod 1
**Rozsah:** v1 = pouze paměť. Automatická oprava komentářů na otevřeném PR je v2 a tento spec ji nepokrývá.

---

## Problém

Dnes se učení zastaví na hranici větve. Když někdo na PR napíše review komentář, ZIBBY ho
přečte, opraví a **zahodí**. Přitom je to nejkvalitnější signál, jaký systém má: ručně
olabelovaná data o tom, co je na téhle konkrétní codebase správně. Stejná výtka se tak může
opakovat na každém dalším PR.

Cíl v1: **stejnou výtku dostat do systémového promptu budoucích runů daného projektu** — aby
ji ZIBBY neopakovala. Nic víc.

## Rozhodnutí (co bylo na výběr a co se vybralo)

| Otázka                             | Rozhodnutí                                                  | Proč                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ze kterých PR a od koho            | **Všechny komentáře na PR, která otevřela ZIBBY**           | víc dat než jen komentáře operátora; cizí text je ošetřený Law-4 obálkou + schvalováním                                |
| Kdy vzniká pravidlo                | **Návrh až po 2. výskytu, pak schválení operátorem**        | doslovně TODO ("pokud se to bude vícekrát opakovat"); přijatá cena je, že jednorázový silný komentář čeká na opakování |
| Rozsah pravidla                    | **Per-projekt, s možností povýšit na globální**             | M7 izolace; pravidlo z jednoho klientského repa nesmí řídit ostatní                                                    |
| Kdy se sbírá                       | **Noční system automation `review-learn`**                  | jedna pohyblivá součástka, vzor `memory-distill` / `pattern-extract` / `gap-detect`; v1 nepotřebuje real-time          |
| Jak se pravidlo dostane do promptu | **Vlastní store + vlastní vždy-groundovaná vault poznámka** | jediná varianta, která má kam dát globální pravidla a nezasahuje do sdíleného `ProjectSchema`                          |

Zamítnuté varianty: auto-adopce po N výskytech (rozbíjí Law 4 — text z PR by přepisoval
chování bez souhlasu operátora); pole `reviewRules` na `ProjectSchema` (zásah do silně
sdíleného kontraktu a globální pravidla nemají kam); přilepení do `.md` agenta Kodér
(rozbíjí per-projekt rozsah a znemožňuje lifecycle).

---

## Architektura

Nový modul `apps/api/src/review-learning/` — rodina "noční systémový pas, který něco navrhne
operátorovi", vedle `patterns/`, `gaps/`, `agent-factory/`.

```
noční `review-learn`
   │
   ├── ZibbyPrLocator ....... která PR otevřela ZIBBY (artifacts + task outcomes)
   ├── ReviewCommentFetcher . GitHub REST, repo-wide `since` kurzor
   ├── ReviewCommentDistiller `claude -p`, komentáře → věty pravidel (proti známým slugům)
   ├── ReviewRulesStore ..... lifecycle, počty, výskyty
   ├── ReviewRuleFlowService  approval kind `review-rule` (Tier-3)
   └── ReviewRulesVaultService render aktivních pravidel → vault
                                     │
                          GroundingService (+2 řádky) → systémový prompt runu
```

### Datový model

`.zibby/data/review-rules/<projectId>.json` + `_global.json`, jeden soubor na projekt,
stejný tvar jako `gate-rules.storage.service.ts`.

```ts
interface ReviewRule {
  id: string; // slug, stabilní identita pravidla ("no-any-in-ts")
  scope: "project" | "global";
  rule: string; // JEDNA rozkazovací věta, ≤160 znaků — co dělat příště
  rationale?: string; // jeden řádek proč
  status: "observed" | "proposed" | "active" | "retired";
  occurrences: Occurrence[]; // { commentId, prUrl, commentUrl, author, at, excerpt }
  approvalRef?: string; // approval, který pravidlo aktivoval
  createdAt: string;
  updatedAt: string;
}
```

`count` není samostatné pole — je to `occurrences.length`. Soubor navíc drží `cursor`
(ISO `since` pro daný repozitář).

`occurrences[].commentId` je **namespacovaný podle zdroje**, protože id z různých GitHub
endpointů si mohou kolidovat: `rc-<id>` (inline review komentář), `ic-<id>` (konverzační
komentář), `rv-<id>` (tělo review).

Pravidlo povýšené na globální se **přesune** z `<projectId>.json` do `_global.json` i se
svými výskyty. Destilace i dedup proto konzultují sjednocení pravidel projektu a globálních —
jinak by po povýšení vznikl duplikát pod stejným slugem.

### Stavový automat

```
observed ──(2. výskyt)──▶ proposed ──(approve)──▶ active
                             │
                             └──(reject)──▶ retired
```

- `observed` — 1 výskyt, jen se počítá, nikde se nezobrazuje
- `proposed` — zaparkovaný Tier-3 approval
- `active` — renderuje se do vault poznámky, groundne se do každého runu projektu
- `retired` — už nikdy se nenavrhne, ale **dál se na něj deduplikuje**, takže třetí výskyt
  téhož operátora nespamuje

Povýšení `scope: "project" → "global"` je samostatná akce na už aktivním pravidle, ne součást
approvalu — gate je binární a má takový zůstat.

### Identita pravidla (dedup)

Nejkritičtější část návrhu. Slug nevymýšlí regex ani hash textu — volný text se
nededuplikuje shodou řetězců a naivní čítač by se nikdy nedostal na dvojku.

Destilační prompt dostane s dávkou komentářů **seznam už existujících pravidel projektu
(slug + věta)** a jeho úkolem je buď vrátit existující slug (= inkrement výskytu), nebo razit
nový. Dedup tedy dělá model proti známému slovníku.

### Zdroj "ZIBBY PR"

Sjednocení dvou zápisů, které v systému už existují — žádné hádání podle autora:

- artifacts registry: `kind: "pr"`, `producedBy.projectId` (píše `pipeline-runner.service.ts:1496`)
- `task.outcome.pr` (píše `task-scheduler.service.ts:1497`)

---

## Ingest a destilace

### Trigger

Nový kind `review-learn` v `SchedulerService.dispatch` vedle `memory-distill` /
`pattern-extract` / `gap-detect`, jednou za noc, ref `review-rules:<počet nových pozorování>`.
Nula nového kódu v heartbeatu.

### Sběr

Per projekt s GitHub integrací, token přes `resolveGithubToken` stejně jako `MaestroService`:

| Endpoint                                   | Co přinese                                  | Cena                                   |
| ------------------------------------------ | ------------------------------------------- | -------------------------------------- |
| `GET /repos/{repo}/pulls/comments?since=`  | inline review komentáře nad řádky kódu      | 1 volání / repo                        |
| `GET /repos/{repo}/issues/comments?since=` | konverzační komentáře pod PR                | 1 volání / repo                        |
| `GET /repos/{repo}/pulls/{n}/reviews`      | těla review ("changes requested, protože…") | 1 / PR, strop 20 nejnovějších ZIBBY PR |

První dva jsou repo-wide se `since`. Třetí `since` neumí — těla review se proto filtrují
až lokálně (`submitted_at > cursor`) a deduplikují přes `rv-<id>` jako každý jiný komentář.
Výsledek se profiltruje na čísla PR ze sjednocení artifacts + task outcomes. **Komentáře od samotné ZIBBY se zahazují** — jinak by se učila ze
svých vlastních odpovědí.

`MAX_COMMENTS_PER_PASS = 60`. Přebytek se nezahazuje: kurzor se posune jen po poslední
zpracovaný komentář (řazeno podle `created_at`) a zbytek dojede příští noc — zalogováno, ne
potichu.

### Destilace

Nová `ReviewCommentDistiller` vedle `ClaudeCliDistiller`, stejný tvar: `spawnClaudeCli`,
30s timeout, výstup validovaný zodem s `.catch()` fallbacky, takže jeden pokažený záznam
nezabije dávku.

```ts
{
  observations: [{ slug, rule, rationale, scopeHint: "project" | "global", actionable: boolean }];
}
```

`actionable: false` (LGTM, poděkování, otázka, diskuse o zadání) se zahodí. `scopeHint` je
jen nápověda pro operátora — rozsah určuje on.

### Law 4

Tělo každého komentáře jde přes `envelopeInbound` (`shared/text/untrusted-envelope`),
systémový prompt destilleru říká, že obsah je **data, ne instrukce**, a výstupní schéma je
uzavřené: model může vyprodukovat jedině větu pravidla. Nemá jak cokoli spustit, aktivovat
ani zapsat. Mezi cizím textem v PR a chováním ZIBBY stojí zod schéma a schválení operátora —
to je důvod, proč v1 nikdy neaktivuje sama.

### Replay-safety

Kurzor se posune jen po úspěšné destilaci. Nezávisle na tom se každý komentář před započtením
ověří proti `occurrences[].commentId` napříč projektem. Dvakrát spuštěný pas tedy nikdy
nenafoukne počty.

---

## Schválení a doručení

### Approval

Nový approval kind `review-rule`, registrovaný jako `agent-proposal`
(`this.approvals.register("review-rule", this)` v `ReviewRuleFlowService`). Druhý výskyt
pravidla zaparkuje approval; payload ukáže větu pravidla, odůvodnění a **oba výskyty
s odkazy na konkrétní komentáře** — aby šlo posoudit, z čeho se to naučilo.

- **approve** → `active`, rozsah `project`
- **reject** → `retired`

### Doručení do promptu

`ReviewRulesVaultService` po každé změně stavu přerenderuje (fire-and-forget jako
`ProjectVaultService`):

- `vault/projects/<id>-review-rules.md` — frontmatter `project: <id>`, aby M7 izolace
  (`ownerProjectOf`) pravidlo nikdy nepustila do runu jiného projektu
- `vault/review-rules.md` — globální, bez vlastníka

A dva řádky v `GroundingService.compose`:

```
  await add(NORTH_STAR_ID)
  await add(SELF_KNOWLEDGE_ID)
+ await add(GLOBAL_REVIEW_RULES_ID)
  ... shelf, MOCs, wikilink hop ...
  if (input.projectId) await add(input.projectId)
+ if (input.projectId) await add(reviewRulesIdFor(input.projectId))
```

Tím je uzavřená smyčka, kvůli které to celé je: schválené pravidlo je od té chvíle
v systémovém promptu **každého** runu daného projektu, bez ohledu na term-matching.

### Rozpočet promptu

Renderuje se max 25 aktivních pravidel, řazeno podle poslední posily; přetečení se
**zaloguje** (`NOTE_BUDGET` by ho jinak uřízl potichu). Automatické stárnutí pravidel v1
nedělá — strop plus ruční retire stačí; vrátit se k tomu má smysl, až nějaký projekt na 25
narazí.

### UI

v1 nepřidává jedinou stránku. Approval se objeví ve stávající approvals ploše, pravidla jsou
čitelná jako poznámky na `/memory`.

Přijatá cena: pozorování s jedním výskytem (`observed`) nejsou nikde vidět a čekají na
opakování. Ruční povýšení "tenhle jeden komentář je důležitý" přijde s panelem na detailu
projektu ve v1.1.

---

## Chybové chování

Žádná větev nesmí shodit run ani noční pas:

| Selže                                          | Co se stane                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GitHub fetch (429/403/výpadek)                 | projekt se přeskočí, `log.warn`, **kurzor se neposune**                                             |
| Destiller (timeout / nevalidní JSON)           | prázdná pozorování, kurzor se neposune, zaloguje se; retry je bezpečný díky dedupu přes `commentId` |
| Chybějící / rozbitý store                      | čte se jako prázdný, jako `gate-rules.storage.service`                                              |
| Projekt bez GitHub integrace nebo bez ZIBBY PR | no-op, ref `review-rules:0`                                                                         |
| Chybějící vault poznámka s pravidly            | `GroundingService.add()` ji už dnes v `catch` přeskakuje                                            |

Poslední řádka je principiální: pravidla jsou **posilující, ne blokující**. Když paměť
selže, ZIBBY píše kód hůř — ne vůbec.

---

## Testy

Žádná síť: `fetchImpl` se injektuje jako v `MaestroService`, distiller se stubne jako
`ClaudeCliDistiller` ve stávajících testech. Vše proti dočasnému `ZIBBY_DATA_DIR` — na
tomhle se už jednou spálilo reálné `.zibby/data`.

- **Store** — druhý výskyt překlopí `observed → proposed`; `retired` už nikdy nenavrhne;
  tentýž `commentId` dvakrát nezvýší počet
- **Kurzor** — posune se jen po úspěšné destilaci; přetečení přes strop 60 dojede příští pas
- **Filtr** — počítají se jen komentáře na ZIBBY PR; vlastní komentáře ZIBBY se zahodí
- **Render** — strop 25 pravidel + zalogované přetečení; frontmatter nese `project:`
- **Destiller** — zod fallbacky: chybějící `scopeHint`, přehnaně dlouhé `rule`, neznámý slug
- **Grounding** — rozšířit `grounding.service.test.ts`: oba nové id se načtou, a pravidlo
  projektu A se **nikdy** neobjeví v runu projektu B (M7)
- **e2e** — approve → pravidlo aktivní a jeho věta je v souboru poznámky; reject → `retired`,
  v poznámce nic

---

## Co v1 vědomě nedělá

- neopravuje komentáře automaticky (v2)
- neaktivuje žádné pravidlo bez schválení operátorem
- nemá vlastní stránku v UI
- nemá automatické stárnutí pravidel
- neučí se z PR, která neotevřela ZIBBY
- nesbírá review, která nemají ani inline komentář, ani tělo (prázdné approve)
