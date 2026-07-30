---
name: Knowledge Capture
phases:
  - id: distil
    type: agent
    agent: knowledge-synthesizer
    consumes: task.md
    produces: distilled.md
    model: sonnet
    thinking: medium
  - id: place
    type: agent
    agent: context-manager
    consumes: distilled.md
    produces: note.md
    model: haiku
    thinking: low
outputs:
  - type: file
    from: note.md
    dest: vault
    to: knowledge-capture-note
desc: >-
  Zpracuj hromadu materiálu do jedné trvalé noty do trezoru: destiluj podstatu →
  zasaď ji do grafu wikilinky a zapiš do správné MOC. Ulož do paměti, zapiš do
  trezoru, poznamenej si, zapamatuj si to, destiluj, sepiš poznatky, shrň materiál,
  knowledge capture, vault nota, MOC, wikilink, index paměti, druhý mozek.
  Levná linka codexu — vzniká informace, nikdy kód.
ownerSubsystem: codex
complexity: light
---

# Knowledge Capture

Levná příčka codexu: **destiluj → zasaď**. Dvě fáze. Bere jakýkoli objem
materiálu (přepis, dokument, výsledek jiné pipeline, poznámky z běhu) a nechává
po sobě **jednu** notu, která je index-first dohledatelná — ne další nezařazený
soubor.

## Fáze

1. **distil** — `task.md` → `distilled.md`: podstata materiálu — co je trvale
   platné poznání a co jen dobová okolnost. Trvalé jde do noty, dobové se
   zahodí. Každé tvrzení nese zdroj. Když materiál na notu nestačí, řekne to
   výslovně místo nafukování prázdné noty.
2. **place** — `distilled.md` → `note.md`: složí finální notu ve tvaru
   `# titulek` + tělo. Titulek je popisný (index-first dohledávání stojí na
   názvech, ne na vektorech), tělo nese `[[wikilinky]]` na existující noty, které
   si předem přečte v trezoru, a nota se výslovně přihlásí do své **MOC** — plus
   dopíše zpětný odkaz do té MOC, aby nota nezůstala sirotkem.

Žádná `verify` fáze ani smyčka: nic se nemění v kódu, není co ověřovat exit
kódem, a iterace nad destilátem je znak, že materiál patřil do hlubší linky.

## Výstup

Jeden výstup `type: file` z `note.md` do trezoru jako nota
`knowledge-capture-note`. Trezor je pravda uložená v souborech — nota je
lidsky čitelný markdown, žádné vektorové úložiště.
