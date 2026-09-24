# Subsystémy jako oddělení firmy — návrh

Datum: 2026-09-24. Nezávazný brainstorm, ne rozhodnutí — mapuje současných 11
subsystémů (`libs/contracts/src/subsystems/subsystem.schema.ts`) na firemní
oddělení, aby si operátor snáz pamatoval, co který subsystém dělá.

## Co ZIBBY momentálně umí

- **Delivery loop** — Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor,
  bounded retry/escalate, izolace přes git worktree
- **Goals/loop engine** — maker ⇄ verifier cyklus s budgetem počtu runů,
  parkování při uváznutí
- **Self-development** — umí upravovat vlastní kód (builder ≠ subject,
  izolovaný worktree)
- **4 kanály** — Slack, e-mail, Jira, GitHub inbound poll + schválené outbound
  odpovědi; autonomně z bugu udělá gated Jira issue + draft PR
- **Google Calendar** — read-only integrace (mockovaná, ne live-verified)
- **Gate engine** — pevná podlaha oprávnění (platba/push/otevření PR →
  zeptat se, merge PR → nikdy), per-project konfigurace
- **Memory vault** — index-first paměť (MOC + wikilinks), denní zápisy,
  grounding podle klíčových slov, noční destilace
- **Briefing/standup** — narativní shrnutí, denní standup na cronu
- **Rozpočty** — denní/týdenní/měsíční stropy runů + prahy % spotřeby
  předplatného
- **Self-learning** — extrakce vzorů ze schválení, noční konsolidace,
  detekce mezer, nápady na nové appky
- **Pipeline chaining** — fáze si předávají artefakty (`consumes`/`produces`),
  pipeline vrací PR nebo soubor
- **Voice mode v chatu** — mikrofon (STT) + TTS předčítání odpovědí
- **Live SSE streamy** — aktivity/logy/run-events streamované, jen
  `health`/`limits` se pollují
- **Subsystémy s statusem** — 11 subsystémů s vlastním rosterem agentů a
  integrací, stavy idle/running/report/waiting/error
- **UI dashboard** — segmenty agents, automations, chains, commands, gates,
  hooks, mcp, memory, overview, pipelines, projects, runs, settings, skills

Ještě chybí / rozpracované (dle `ROADMAP.md`): klasifikátor vs. explicitní
override cíle (N1), CI/CD monitor jako pluggable seam (N3), řízení samotného
stroje mimo repo (N5, nejnižší priorita).

## Návrh oddělení

| Oddělení | Náhrada za | Co dělá |
|---|---|---|
| **Development** | Forge | Dostane implementační úkol, sám si ho naplánuje podle priorit, spawne Architekta → Kodéra ⇄ Review ⇄ Testera → Dokumentátora, vrátí PR |
| **Monitoring/Ops** | Puls | Nonstop sleduje Slack/e-mail/Jira/GitHub/kalendář a CI na heartbeatu, hlásí co se děje |
| **Security** | Sentinel | CVE závislostí, úniky tajemství, hlídá hranici vůči vnějšímu světu |
| **Release Management** | Maestro | Připravuje release, přehled changelogu, čeká na operátorovo schválení mergu |
| **Incident Response** | Beacon | Eskaluje kritické věci — Tier-3 surface-and-wait, když je něco naléhavé |
| **R&D/Research** | Scout | Výzkumné úkoly, výsledek předá dál jako artefakt do dalšího oddělení |
| **Communications/PR** | Herald | Mluví za ZIBBY navenek — odpovídá na dotazy, sám se ptá, když něco chybí |
| **QA/Architecture** | Loom | Proaktivně skenuje kvalitu a architekturu kódu, nálezy předává Developmentu |
| **Knowledge Management** | Codex | Vede vault, groundnutí, noční destilaci paměti |
| **Finance** | Ledger | Rozpočty, stropy útrat, token-spend limity |
| **Personal Office** | Hearth | Osobní život operátora, oddělené od práce |

## Doporučení

Nepřejmenovávat subsystémy v kódu (mytologie je součást identity/UI — barvy,
orby), ale přidat k nim v UI/dokumentaci firemní podtitul jako druhou vrstvu
popisku (`Forge — Development`), stejně jako teď má každý `tagline`. Tradeoff:
dvojí názvosloví v hlavě navíc, ale bez rozbití existujícího designu a bez
migrace dat/kódu.
