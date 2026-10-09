---
name: Team KB Ingest
phases:
  - id: scan
    type: agent
    agent: kb-librarian
    consumes: task.md
    produces: plan.md
    model: haiku
    thinking: low
  - id: meetings
    type: agent
    agent: kb-librarian
    consumes: plan.md
    produces: meetings.md
    model: sonnet
    thinking: medium
  - id: compile
    type: agent
    agent: kb-librarian
    consumes: meetings.md
    produces: compiled.md
    model: sonnet
    thinking: high
  - id: report
    type: agent
    agent: kb-librarian
    consumes: compiled.md
    produces: pr.md
    model: haiku
    thinking: low
outputs:
  - type: pr
    from: pr.md
desc: >-
  Zkompiluj nové zdroje týmové znalostní báze do jejího wiki podle vzoru LLM
  wiki: zdroje se nikdy nemění, agent aktualizuje nebo zakládá trvalé články
  (jeden na pojem, odkazuj místo duplikace), doplní řádek do wiki/INDEX.md a
  připíše záznam do _meta/log.md. Přepisy porad (.vtt) shrne do meeting notes.
  Výsledkem je větev a PR do repa báze, merge je na člověku. Team KB ingest,
  znalostní báze týmu, knowledge base, wiki, ingest, přepis porady, meeting
  notes, INDEX, log, devrel-knowledgebase, zpracuj nové zdroje do wiki. Nic
  nepouští do main — PR je brána.
department: knw
complexity: standard
---

# Team KB Ingest

Linka pro týmovou znalostní bázi (git repo prostého markdownu s vlastním
`AGENTS.md`): **zjisti nové → shrň porady → zkompiluj wiki → sepiš PR**. Řídí se
schématem báze, žádné vlastní rozložení si nevymýšlí. Cílový projekt běhu **musí
být repo znalostní báze** (viz `docs/workflows/team-kb-ingest.md`) — PR se
otevírá do repa projektu.

Vstup (`task.md`): id týmu nebo cesta k bázi a případně omezení ("jen porada X").
Prázdný vstup = zpracuj všechno, co ještě není zalogované.

## Fáze

1. **scan** — `task.md` → `plan.md`: přečte `AGENTS.md`, `wiki/INDEX.md`,
   `_meta/log.md`, `team-context.md` a porovná zdroje (`raw/`, `meetings/`,
   `git log`) s tím, co log a `sources` ve wiki už pokrývají. Vydá plán: seznam
   nezpracovaných zdrojů, u každého zda je to porada (přepis `.vtt`) nebo
   materiál, a které existující články se jich nejspíš týkají. Nic nemění. Když
   není co zpracovat, řekne to a běh skončí bez změn.
2. **meetings** — `plan.md` → `meetings.md`: pro každý přepis porady založí
   meeting note (`type: talk`) tam a v tvaru, jak určuje `AGENTS.md` a šablona
   `meeting.md`; zdroj (`.vtt`) zůstane nedotčený a note na něj odkáže.
   Jedna věta na téma, zhruba 4-5 hlavních bodů na hodinu porady, pak ještě
   zkrátit; rozhodnutí, akce a otevřené otázky do vlastních sekcí. Do
   `meetings.md` zapíše, co vzniklo.
3. **compile** — `meetings.md` → `compiled.md`: projde zdroje a meeting notes,
   pro každý pojem aktualizuje existující článek ve `wiki/` (přidá zdroj do
   frontmatteru, zachová stávající obsah) nebo založí nový ze šablony; odkazuje
   `[[wikilinky]]` místo duplikace, rozdělí článek nad ~1500 slov, doplní
   zpětné odkazy a `belongs_to`. Pak jeden řádek na stránku do `wiki/INDEX.md`
   a jeden append do `_meta/log.md` (`agent:zibby`, akce `ingest`). Nakonec
   projede vlastní lint (sirotci, mrtvé odkazy, typ vs. složka, nic nevede do
   `private/`/`inbox/`/`output/`) a výsledek zapíše do `compiled.md`.
4. **report** — `compiled.md` → `pr.md`: `# titulek` + tělo PR: co se zpracovalo,
   které články vznikly/změnily, a povinná sekce **Pro člověka k rozhodnutí**
   (nejisté fakty, konflikty zdrojů, citlivá data k vyřazení, články s
   vyčištěným `verified_by`, návrhy změn schématu nebo `team-context.md`, které
   si agent netroufl udělat). Žádný generický text: co nemá konkrétní obsah, se
   nepíše.

Žádná `verify` fáze: báze nemá testy ani lint příkaz, vlastní lint dělá
**compile**; kvalitu posuzuje člověk nad otevřeným PR.

## Výstup

Jeden výstup `type: pr` z `pr.md`. Běží na větvi `zibby/*`, nikdy do `main`;
PR je brána a merge dělá operátor (Zákon 3).
