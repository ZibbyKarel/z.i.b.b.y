---
name: Incident Response
phases:
  - id: triage
    type: agent
    agent: incident-responder
    consumes: task.md
    produces: triage.md
    model: sonnet
    thinking: medium
  - id: investigate
    type: agent
    agent: devops-incident-responder
    consumes: triage.md
    produces: root-cause.md
    model: sonnet
    thinking: high
  - id: review
    type: agent
    agent: sre-engineer
    consumes: root-cause.md
    produces: cause-verdict.md
    model: opus
    thinking: high
    qualify: true
    loop:
      to: investigate
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: opus
          thinking: high
  - id: mitigation
    type: agent
    agent: sre-engineer
    consumes: cause-verdict.md
    produces: mitigation.md
    model: sonnet
    thinking: medium
  - id: report
    type: agent
    agent: incident-responder
    consumes: mitigation.md
    produces: incident-report.md
    model: haiku
    thinking: low
outputs:
  - type: file
    from: incident-report.md
    dest: vault
    to: incident-report
desc: >-
  Živý incident: triage závažnosti a dopadu → vyšetření skutečné příčiny s
  oponenturou → plán zmírnění a trvalé opravy → zpráva k incidentu. Incident,
  výpadek, produkce je dole, nefunguje to, degradace, outage, postmortem, root
  cause, hoří to, kritická chyba, service down, mitigace, eskalace. Hloubková
  linka pro puls; na pouhé zařazení červeného CI stačí `ci-triage`.
ownerSubsystem: puls
complexity: deep
---

# Incident Response

Nejvyšší příčka pulsu: **triage → vyšetření ⇄ oponentura → zmírnění → zpráva**.
Pět fází s kvalifikační bránou nad příčinou — dokud příčina neobstojí, plán
zmírnění se nepíše, aby se nemírnil symptom.

## Mandát a hranice

Linka **vyšetřuje a připravuje**; sama nic neodvratného neprovede. Nasazení
hotfixu, restart produkce, rollback nebo změna konfigurace prostředí jsou Tier-3
kroky, které plán popíše a operátor provede. Vyšetření je read-only nad logy,
kódem a konfigurací; když je potřeba víc, řekne to a zaparkuje.

## Fáze

1. **triage** — `task.md` → `triage.md`: co se děje, závažnost, rozsah zásahu
   (koho a co se to týká), časová osa prvních signálů, co je _ověřený fakt_ a co
   jen hypotéza. Nejdřív se popíše symptom, ne příčina.
2. **investigate** — `triage.md` → `root-cause.md`: skutečná příčina — od symptomu
   k mechanismu, s důkazem u každého kroku (log, commit, konfigurace). Kde důkaz
   chybí, hypotéza se označí jako hypotéza.
3. **review** — `root-cause.md` → `cause-verdict.md`: oponentura příčiny. Fáze je
   `qualify`: nese `<verdict>`. `pass` znamená „příčina je podložená a vysvětluje
   všechna pozorování“. Cokoli jiného vrací práci na **investigate** (2× s
   eskalací na opus/high), pak park. Park je legitimní konec — nepodložená
   příčina patří operátorovi, ne do plánu zmírnění.
4. **mitigation** — `cause-verdict.md` → `mitigation.md`: dvě roviny odděleně —
   **okamžité zmírnění** (co vrátí službu do provozu, včetně rollback cesty a
   rizika každé varianty) a **trvalá oprava** (co ji zavře natrvalo, jako zadání
   pro samostatný běh `patch` nebo `delivery`).
5. **report** — `mitigation.md` → `incident-report.md`: zpráva ve tvaru
   `# titulek` + tělo — časová osa, dopad, příčina, co se udělalo, co zbývá,
   poučení. Bez hledání viníka; předmětem je systém, ne člověk.

## Výstup

Jeden výstup `type: file` z `incident-report.md` do trezoru jako nota
`incident-report` — zpráva je trvalý artefakt druhého mozku, dohledatelný z
indexů, a nakrmí případný pozdější běh `patch` nebo `delivery` s trvalou opravou.
Žádný PR: tahle linka kód nemění.
