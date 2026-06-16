# M2 — Inbound Autonomy (kanály → klasifikátor → tier)

**Závislosti:** [M1 — Project Profile](M1-project-profile.md) (VIP flagging, autonomy_policy)

**Proč jako druhý:** channel _runtime_ je největší already-built asset, který starý roadmap
přehlédl. Hodnota se odemkne zapojením do akce, ne stavbou.

## Reality (co existuje)

`ChannelWatcherService` polluje Slack/email reálně (cursor-safe, rate-limit tolerant),
persistuje inbound položky, spouští volitelný triage flow a gatuje odchozí odpovědi
přes approval engine.

## Gap (co chybí)

- Inbound položky zatím nerouted přes `TaskClassifier` do per-project rozhodnutí
- Žádný `{action: respond|create_task|ignore, confidence, suggested_agent}` verdict
- Žádný VIP→Tier-3 escalation
- Žádný draft-into-approval-queue pro Tier 3

## Build

- `channel.message.received` → `TaskClassifier` s `{text, sender, project, vip}` →
  `{action, confidence, suggested_agent}`.
- Routovat verdict přes gate engine **s project contextem**:
  Tier 1 tiše koná · Tier 2 koná + zaznamená aktivitu · Tier 3 připraví draft → approval queue.
- VIP sender (z M1 profilu) vynutí Tier 3. `respond_as: draft_only` vynutí Tier 3.
- Integrations UI: live inbox ukazující jak byla každá položka zpracována, pending drafts čekající
  na schválení, history poslaných odpovědí (read path z větší části existuje — přidat handling/draft view).

## Output

Slack bug report se stane taskem + draft PR (Tier 3); rutinní otázka je zodpovězena per policy
(Tier 1/2). ZIBBY monitoruje jménem operátora a eskaluje tam, kde musí.
