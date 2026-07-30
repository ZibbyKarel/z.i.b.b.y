---
name: Daily Agenda
phases:
  - id: gather
    type: agent
    agent: personal-assistant
    consumes: task.md
    produces: context.md
    model: haiku
    thinking: low
  - id: agenda
    type: agent
    agent: personal-assistant
    consumes: context.md
    produces: agenda.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: agenda.md
    dest: vault
    to: daily-agenda
desc: >-
  Sestav osobní agendu na den z poznámek, připomínek a kontextu kalendáře: co je
  dnes, co má termín, co se přetahuje ze včerejška, co je jen nápad. Denní agenda,
  co mám dnes, plán dne, moje připomínky, todo na dnes, osobní úkoly, nákupní
  seznam, co jsem si poznamenal, ranní přehled, daily agenda. Osobní domov
  operátora — oddělené od práce a od doručování.
ownerSubsystem: hearth
complexity: light
---

# Daily Agenda

Nejlevnější (a jediná) příčka hearthu: **posbírej → sestav**. Dvě fáze, obě jede
`personal-assistant` — první čte, druhá rozhoduje o pořadí. Doména je **osobní
život operátora**, ne práce: co patří do delivery, releasu nebo klientské
komunikace, sem nepatří a agenda to jen zmíní jako odkaz.

## Fáze

1. **gather** — `task.md` → `context.md`: posbírej vstupy — osobní poličky a
   poznámky v trezoru, otevřené připomínky, termíny a kontext kalendáře na dnes a
   zítra, nedokončené položky z předchozích agend. Jen čtení a jen fakta: co
   nikde není zapsané, se nevymýšlí.
2. **agenda** — `context.md` → `agenda.md`: agenda ve tvaru `# titulek` + tělo,
   rozdělená na **Dnes / Má termín / Přetahuje se / Nápady**. Krátká a
   rozhodnutelná — u položky, která se nedá udělat dnes, se to řekne, místo aby
   se seznam nadouval. Když něco potřebuje rozhodnutí operátora, stojí to na
   začátku jako jedna jasná otázka.

Žádná `verify` fáze ani smyčka: nic se nemění v kódu a nikdo nic neodesílá.
Agenda je návrh dne, ne vykonaný plán.

## Výstup

Jeden výstup `type: file` z `agenda.md` do trezoru jako nota `daily-agenda`.
Agenda je informace, ne kód — nikdy neotevírá PR a nikdy nikomu nic neposílá;
odeslání, potvrzení schůzky nebo cokoli, co operátora zavazuje, zůstává na něm.
