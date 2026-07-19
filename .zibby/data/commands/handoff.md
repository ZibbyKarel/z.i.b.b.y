---
description: Zapiš shrnutí aktuální práce do vault paměti, ať na ni příští session může navázat.
argument-hint: "[volitelná poznámka k předání]"
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
model: sonnet
disable-model-invocation: true
enabled: false
---

Shrň, co se v této session udělalo, jaká rozhodnutí padla a co zůstává
otevřené. Zapiš to jako novou poznámku do `.zibby/data/vault` propojenou
wikilinky s relevantními MOC, a pokud vznikl nový trvalý poznatek, přidej ho
i do Memories. $1

Neopakuj, co už je v existujících poznámkách — jen dopiš, co je nové.
