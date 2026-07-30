---
name: Quick Lookup
phases:
  - id: search
    type: agent
    agent: search-specialist
    consumes: task.md
    produces: sources.md
    model: haiku
    thinking: low
  - id: answer
    type: agent
    agent: research-analyst
    consumes: sources.md
    produces: answer.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: answer.md
    dest: vault
    to: quick-lookup-answer
desc: >-
  Rychlé faktické dohledání a krátká odpověď: co je X, jak funguje Y, kdo je Z,
  kolik stojí, jaká je aktuální verze, existuje na to nástroj. Najdi zdroje →
  shrň do několika odstavců s odkazy. Bez hloubkové analýzy, bez konkurenčního
  srovnání, bez rozsáhlé zprávy. Zjisti, dohledej, ověř, najdi, co je, jak
  funguje, quick lookup, rychlá rešerše, jedna otázka. Na hloubkový výzkum
  z více zdrojů použij `research`; na produktové discovery `product-discovery`.
ownerSubsystem: scout
complexity: light
---

# Quick Lookup

Nejlevnější příčka scoutu: **hledej → odpověz**. Odlehčená verze `research` bez
fáze konkurenčního srovnání a bez syntézní smyčky — pro jednu konkrétní otázku,
na kterou stačí několik odstavců s citacemi.

## Fáze

1. **search** — `task.md` → `sources.md`: najdi relevantní zdroje k otázce
   a zapiš je s odkazy a jednořádkovým výtahem. Cíl je pokrytí otázky, ne
   vyčerpávající bibliografie.
2. **answer** — `sources.md` → `answer.md`: krátká, přímá odpověď ve tvaru
   `# titulek` + tělo. Každé tvrzení nese zdroj. Když zdroje na odpověď
   nestačí, řekne to výslovně a navrhne `research` — nedomýšlí.

Žádná smyčka: když je otázka tak složitá, že by potřebovala iterovat, je to
signál, že měl běžet `research`, ne že se má tahle linka natahovat.

## Výstup

Jeden výstup `type: file` z `answer.md` do trezoru jako nota
`quick-lookup-answer` — odpověď je informace, ne kód, takže nikdy neotevírá PR.
Zůstává jako trvalý artefakt druhého mozku, dohledatelný z indexů.
