---
name: CI Triage
phases:
  - id: read
    type: agent
    agent: devops-incident-responder
    consumes: task.md
    produces: failure.md
    model: haiku
    thinking: low
  - id: verdict
    type: agent
    agent: sre-engineer
    consumes: failure.md
    produces: triage.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: triage.md
    dest: vault
    to: ci-triage-verdict
desc: >-
  Přišel červený běh CI: přečti log, najdi selhávající job a krok, zařaď příčinu
  (flake, skutečná regrese, infrastruktura, závislost, konfigurace) a vydej krátký
  verdikt s navrženým vlastníkem a dalším krokem. Červené CI, spadl build, padají
  testy, failed run, CI failure, triage pipeline, proč to spadlo, zelená se
  nevrátila, GitHub Actions. Levná a rychlá linka pro srdeční tep — neopravuje,
  jen zařadí. Živý incident řeší `incident-response`.
ownerSubsystem: puls
complexity: light
---

# CI Triage

Nejspodnější příčka pulsu: **přečti → zařaď**. Dvě fáze, oba kroky read-only.
Linka běží na srdečním tepu, takže je záměrně levná — cílem je _zařazení a
vlastník_, ne oprava.

## Fáze

1. **read** — `task.md` → `failure.md`: z odkazu na běh nebo z přiloženého logu
   vytáhni selhávající workflow, job, krok a první skutečnou chybu (ne kaskádu
   následných). Přidej commit, větev a to, zda stejná chyba padá opakovaně.
   Ničemu se nepřipisuje příčina, která v logu není.
2. **verdict** — `failure.md` → `triage.md`: krátký verdikt ve tvaru `# titulek` +
   tělo — **kategorie** (flake / regrese / infrastruktura / závislost /
   konfigurace), **jistota**, **navržený vlastník** (subsystém nebo agent) a
   **jeden další krok**. Když log na zařazení nestačí, řekne to výslovně a řekne,
   co dohledat — nedomýšlí.

Žádná `verify` fáze ani smyčka: triage nic nemění, takže není co ověřovat exit
kódem, a iterovat nad jedním logem by jen prodražilo tep.

## Výstup

Jeden výstup `type: file` z `triage.md` do trezoru jako nota
`ci-triage-verdict` — verdikt je informace, ne kód, takže nikdy neotevírá PR.
Opravu spustí operátor samostatně (`quick-fix` nebo `patch`) podle navrženého
vlastníka.
