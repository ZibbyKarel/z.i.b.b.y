---
description: Sestav butlerskou briefing zprávu o tom, co ZIBBY udělal a co čeká na rozhodnutí operátora.
argument-hint: "[časové okno, výchozí: od poslední briefing]"
allowed-tools:
  - Read
  - Grep
  - Glob
model: sonnet
enabled: false
---

Projdi log aktivity, otevřené PR a čekající approvaly za $1 a sestav krátkou
butlerskou zprávu ve stylu North Star:

- co se stalo bez zásahu operátora (Tier 1 — jen zaznamenat)
- co bylo uděláno a nahlášeno (Tier 2 — PR, odpovědi)
- co čeká na rozhodnutí operátora (Tier 3)

Piš stručně, 3–5 vět, žádný firehose — jen to, co je opravdu relevantní.
