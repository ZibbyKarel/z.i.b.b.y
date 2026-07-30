---
name: Release Notes
phases:
  - id: collect
    type: agent
    agent: git-workflow-manager
    consumes: task.md
    produces: changes.md
    model: haiku
    thinking: low
  - id: notes
    type: agent
    agent: devops-engineer
    consumes: changes.md
    produces: release-notes.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: release-notes.md
    dest: vault
    to: release-notes
desc: >-
  Sestav poznámky k vydání a changelog ze sloučené práce: co přišlo od posledního
  tagu — commity, merge, uzavřené PR → přehledné release notes po skupinách
  (novinky, opravy, breaking changes) s návrhem verze. Release notes, changelog,
  poznámky k vydání, co je nového, whats new, přehled změn, shrnutí releasu,
  seznam změn, verze, tag. Levná mechanická linka, nic nesahá na kód; plnou
  přípravu vydání s ověřením buildu dělá `release-prep`.
ownerSubsystem: maestro
complexity: light
---

# Release Notes

Nejspodnější příčka maestra: **sesbírej → sepiš**. Dvě fáze, oba kroky
read-only nad historií repa — žádná změna kódu, žádný build, žádný deploy.
Výsledkem je jeden dokument, ne PR.

## Fáze

1. **collect** — `task.md` → `changes.md`: zjisti rozsah vydání (od posledního
   tagu, nebo dle zadání) a vypiš sloučené commity, merge a PR s autory a
   odkazy. Jen fakta z historie; co v historii není, se nedomýšlí.
2. **notes** — `changes.md` → `release-notes.md`: slož poznámky ve tvaru
   `# titulek` + tělo, roztříděné na **Novinky / Opravy / Interní / Breaking
   changes**, s návrhem semver bumpu a jednou větou dopadu na uživatele. Když
   je rozsah tak velký, že si žádá ověření buildu a deploy readiness, řekne to
   výslovně a odkáže na `release-prep` — sám rozsah netahá dál.

Žádná `verify` fáze ani smyčka: linka nic nemění, takže není co ověřovat
exit kódem. Když je vstup neúplný, poznámky to přiznají místo iterace.

## Výstup

Jeden výstup `type: file` z `release-notes.md` do trezoru jako nota
`release-notes` — poznámky jsou informace, ne kód, takže nikdy neotevírají PR.
Zůstávají trvalým artefaktem druhého mozku, dohledatelným z indexů.
