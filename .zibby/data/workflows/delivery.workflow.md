---
name: Delivery
phases:
  - id: architekt
    type: agent
    agent: architect
    consumes: task.md
    produces: plan.md
    model: opus
    thinking: high
  - id: koder
    type: agent
    agent: fullstack-developer
    consumes: plan.md
    produces: implementation.md
    model: sonnet
    thinking: medium
  - id: review
    type: agent
    agent: code-reviewer
    consumes: implementation.md
    produces: review.md
    model: opus
    thinking: high
    qualify: true
    loop:
      to: koder
      maxRetries: 3
      escalate: true
      then: park
      driftTo: architekt
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: n-9
    type: agent
    agent: test-automator
    consumes: review.md
    produces: test-automator.md
    model: sonnet
    thinking: medium
    qualify: true
    loop:
      to: koder
      maxRetries: 2
      escalate: true
      then: park
      driftTo: architekt
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: dokumentator
    type: agent
    agent: documentation-engineer
    consumes: test-automator.md
    produces: docs.md
    model: sonnet
    thinking: low
    prompt: |-
      Write docs.md: the pull request description. Line 1 is `# <title>`, the rest is the PR body. ZIBBY pushes the branch and opens the PR from this file, so only write the file.

      1. Look in the target repo for how PRs are written, in this order: a repo skill about PRs (`.agents/skills/*pr*/SKILL.md`, `.claude/skills/*pr*/SKILL.md`, or a PR section in AGENTS.md / CLAUDE.md), then `.github/pull_request_template.md` or `.github/PULL_REQUEST_TEMPLATE*`.
      2. If a skill exists, Read it and follow its title style, body template and guidelines exactly. Fill every placeholder from the real diff (`git diff <base>...HEAD`, `git log`) and from the previous phases; write "None." for a section with nothing to say, never delete a heading. Skip the skill's mechanics (push, `gh pr create`, labels, learnings, stats scripts) — ZIBBY does that. Never invent values the skill wants generated (stats, durations, token counts): leave those out.
      3. If there is only a template, fill it the same way.
      4. If there is neither, write in English: title `<TICKET-KEY>: <imperative summary of the change>` (match the style of recent PRs: `gh pr list --state all --limit 10`), body with Why, What, Test Plan.

      Rules: the title and body describe the code change, not the documentation work — never a title like "Documentation — ...", never a commit SHA in the title. Use real class, file and command names. Test Plan lists the checks that were actually run (with results, from test-automator.md) and the ones that were not. Write in English unless the repo's skill or template says otherwise.
outputs:
  - type: pr
    from: docs.md
desc: >-
  Postav, oprav nebo implementuj feature či bug v projektu — build, fix,
  implement a feature or bug; deliver, postavit, opravit, implementovat, dodat,
  rozbitý test, failing test.
avatar: assets/delivery.png
department: dev
complexity: deep
---

# Delivery

Doručovací smyčka ZIBBY: **Architekt → Kodér ⇄ Code-Review ⇄ Testy → Dokumentátor**.
Kodér i testovací agent spouští **vlastní zdokumentované kontroly cílového repa**
(z jeho CLAUDE.md / AGENTS.md / README / package skriptů) a hlásí výsledky — ZIBBY
žádné ověřovací skripty nedrží. Poslední kontrolou před PR jsou **review i n-9
hodnotící brány** (`qualify`). Runner
si z jejich výstupu přečte verdikt (`<verdict>pass|gap|drift</verdict>`) a podle něj
rozhodne, ne podle exit kódu procesu. Chybějící tag se počítá jako `gap` —
fail-closed. Ohraničený stavový automat: opakuje s eskalací, a místo mlácení hlavou
o zeď zaparkuje pro lidskou poznámku.

## Fáze

1. **architekt** — `task.md` → `plan.md`: rozpad zadání na kroky a kontrakt změn.
2. **koder** — `plan.md` → `implementation.md`: provede změny v cílovém projektu,
   pak **spustí vlastní zdokumentované kontroly repa** (CLAUDE.md / AGENTS.md /
   README / package skripty) a opraví je do zelené, než označí práci za hotovou. Co spustil a s jakým
   výsledkem zapíše do shrnutí; co nedokázal dotáhnout do zelené, přizná.
3. **review** — `implementation.md` → `review.md`: oponentura, a **brána**
   (`qualify: true`). `pass` pustí práci dál; `gap` (chybí část zadání) ji vrátí
   Kodérovi; `drift` (řešení míří jinam) ji vrátí až **Architektovi** na přeplánování
   — Kodér se z verdiktu „míříš jinam" sám vykopat nemůže. Eskalace zvedá
   model/thinking, vyčerpání → park.
4. **n-9** — `review.md` → `test-automator.md`: doplní a spustí testy, a je to
   rovněž **brána** (`qualify: true`) se stejnou logikou verdiktu — `gap` zpět
   Kodérovi, `drift` Architektovi, vyčerpání → park. Spouští kontroly
   repa podle jeho vlastní dokumentace a hlásí výsledky. Bez ní byl reviewerův
   souhlas poslední kontrolou před PR.
5. **dokumentator** — `test-automator.md` → `docs.md`: popis PR
   (`docs.md` má tvar `# titulek` + tělo — to je vstup pro PR výstup). Dokumentátor
   nejdřív hledá v cílovém repu skill / šablonu pro PR (`.agents/skills/*pr*`,
   `.claude/skills/*pr*`, `.github/pull_request_template.md`) a řídí se jimi;
   bez nich píše anglicky (`<TICKET>: <shrnutí>` + Why / What / Test Plan).

## Výstup

Co se stane s hotovou prací **nedělá žádný agent** — je to výstup nakonfigurovaný
na úrovni workflow (`outputs`). Tato workflow má jeden výstup `type: pr`: systém
z `docs.md` složí titulek + tělo a otevře PR jediným gated řetězcem
`git push -u origin <branch> && gh pr create …`. Push i otevření PR jsou Tier-3:
běh zaparkuje na schválení. **PR je brána** — vše před ním se už stalo na větvi
`zibby/*`, a bránu vynucuje systém, ne dobrá vůle agenta.

Handoff je vždy jeden soubor; selhání předává ocas logu jako kontext dalšímu
pokusu (plus případnou poznámku operátora po resume).
