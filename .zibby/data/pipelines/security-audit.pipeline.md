---
name: Security Audit
phases:
  - id: audit
    type: agent
    agent: security-auditor
    consumes: task.md
    produces: audit.md
    model: opus
    thinking: high
  - id: exploit
    type: agent
    agent: penetration-tester
    consumes: audit.md
    produces: exploits.md
    model: opus
    thinking: high
  - id: validate
    type: agent
    agent: security-engineer
    consumes: exploits.md
    produces: validation.md
    model: sonnet
    thinking: medium
    loop:
      to: audit
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: compliance
    type: agent
    agent: compliance-auditor
    consumes: validation.md
    produces: compliance.md
    model: sonnet
    thinking: medium
  - id: remediation
    type: agent
    agent: security-engineer
    consumes: compliance.md
    produces: security-report.md
    model: opus
    thinking: high
outputs:
  - type: file
    from: security-report.md
    dest: vault
    to: security-audit-report
desc: >-
  Plný bezpečnostní audit: modelování hrozeb a hledání zranitelností →
  potvrzení skutečné zneužitelnosti → validace nálezů → soulad s předpisy →
  prioritizovaný plán remediace. Pro autorizovaný hloubkový průchod celou
  aplikací nebo systémem. Bezpečnostní audit, security audit, pentest,
  penetrační test, zranitelnosti, threat model, authn, authz, secrets, OWASP,
  GDPR, compliance, hardening. Na samotný přehled závislostí a CVE stačí levný
  `dep-scan`; kvalitu kódu bez bezpečnostní optiky řeší loom.
ownerSubsystem: sentinel
complexity: deep
---

# Security Audit

Nejvyšší příčka sentinelu: **audit → exploit → validate ⇄ audit → compliance →
remediation**. Read-only vůči produkci a vůči cizím systémům — pracuje jen tam,
kde má mandát, a **nikdy nic nemění v běžícím prostředí**.

## Fáze

1. **audit** — `task.md` → `audit.md`: model hrozeb a systematické hledání
   zranitelností — authn/authz, vstupy, secrets, kryptografie, konfigurace,
   izolace tenantů. Nálezy s cestou k důkazu, ne domněnky.
2. **exploit** — `audit.md` → `exploits.md`: u každého nálezu ověří, zda je
   v tomhle nasazení opravdu dosažitelný, a rozdělí je na potvrzené,
   nedosažitelné a nerozhodnuté. **Jen autorizovaný rozsah** — na cizí
   infrastrukturu, cizí účty ani produkční data se nesahá; kde chybí mandát,
   fáze to zapíše a nález nechá jako nerozhodnutý.
3. **validate** — `exploits.md` → `validation.md`: oponentura celého souboru —
   zahodí falešné pozitivy a vrátí běh na **audit**, když je pokrytí děravé nebo
   důkazy nedrží (2× s eskalací sonnet/high → opus/high), pak park. Tohle je
   ta pojistka, která odděluje audit od seznamu tipů.
4. **compliance** — `validation.md` → `compliance.md`: mapování potvrzených
   nálezů na povinnosti (GDPR, retence, logování, zpracovatelské role) a na
   rámce, které projekt tvrdí, že splňuje.
5. **remediation** — `compliance.md` → `security-report.md`: plán opravy seřazený
   podle reálného rizika × ceny — co opravit hned, co pinovat, co jen sledovat.
   Tvar `# titulek` + tělo, u každé položky navržený následný běh forge.

## Výstup

Jeden výstup `type: file` z `security-report.md` do trezoru jako nota
`security-audit-report`. Žádný PR — audit nálezy hlásí, neopravuje; oprava je
samostatný běh forge, který tahle zpráva nakrmí. Zpráva obsahuje popisy
zranitelností, takže zůstává v trezoru operátora a nikam se sama neposílá:
jakékoli šíření navenek je Tier-3.
