# M3 — Narrative Briefing + Standup Cheat Sheets

**Závislosti:** [M1 — Project Profile](M1-project-profile.md) (`daily_rhythm.standup_time`)

**Proč jako třetí:** denní, viditelná hodnota. Briefing je operátorův moment „prostě přijdu na daily"
z north-star.

## Reality (co existuje)

`BriefingService` sestavuje `needsYou / didForYou / watching / engagements / counts`, spouští
volitelný `claude -p` butler-voice rewrite headline, persistuje daily note a **již se spouští v 07:00**
přes `automations/morning-briefing.json`. Dvě reálné briefing notes existují v `vault/daily/`.

## Gap (co chybí)

- Obsah je mělký — pouze headline-only prose
- Žádný 7-day trend kontext
- Žádná sekce „What I learned"
- Žádné per-project standup cheat sheets

## Build

- Prohloubit briefing: plná narrative overnight sekce (completed/failed + proč), 7-day trend
  kontext z `vault/daily/*`, sekce „What I learned" (napájená M4), priority odvozené z backlogu.
- `StandupAgent` per projekt: cron z `daily_rhythm.standup_time`, čte project channel/
  aktivitu za posledních 24h, emituje cheat sheet v konfigurovaném formátu, povrchuje na velínu
  ~15 min před standupem.
- Velín overview již renderuje `BriefingCard` — rozšířit o standup cards per projekt.

## Output

Operátor otevře velín a uvidí reálný narrative debrief plus připravený standup sheet
pro každý aktivní projekt.
