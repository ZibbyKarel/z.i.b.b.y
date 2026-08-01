> Fáze 126 — všech 7 bodů hotovo na větvi `feat/phase-126-todo-arc`.
> Plány, rozhodnutí a stav: [`docs/plans/phase-126/PROGRESS.md`](docs/plans/phase-126/PROGRESS.md).

- [x] v projektu shoptet-partner-cli se stahují všechny možné otázky. Měly by se stahovat opět jen ty, které se týkají PR, která otevřel ZIBBY a nebo těch, kde jsem výslovně menchnutý
      <br>→ `dda64f8b` — GitHub adaptér ingestuje jen dvě množiny: PR, které otevřel ZIBBY (podle jeho vlastního záznamu, ne `author:`), a explicitní `mentions:`. Dotaz `assignee:` zrušen.

- [x] kartičky integrací v detailu projektu budou mít ikonky služeb třetích stran ted Jira integrace -> ikonka JIRA systému, Github integrace -> ikonka GitHub atp.... zobrazíme místo glyphu v levo nahoře
      <br>→ `78dcd01a` — GitHub, Jira, Calendar, Sentry. **Slack zůstává na obecném glyphu:** Simple Icons značku Slacku odstranili na žádost Slacku, žádný CC0 asset neexistuje.

- [x] roadmap v detailu projektu - pokud nevyberu žádný epic, vidím všechny tasky v kanban boardu. Kliknutí na epic je filtruje
      <br>→ `89c1d99d` — bez vybraného epicu board ukáže všechny tasky, každý s barevným chipem svého epicu; kliknutí na epic filtruje, opětovné kliknutí výběr zruší.

- [x] pickupnutý task z roadmapy nemá přiřazený projekt
      <br>→ `6df74869` — task projekt vždy měl; chybělo jen **jméno**. `scheduledTaskToView` (větev pro `held`/`queued`/`pending`) jako jediná ze čtyř neřešila `resolveProjectDisplay` a vracela `project: ""`.

- [x] stránka /archiv nefunguje
      <br>→ `299d81f8` — `GET /tasks/runs/:runId` byl v kontraktu deklarovaný **před** `/tasks/runs/archive`; ts-rest registruje trasy v pořadí klíčů a Express bere první shodu, takže `archive` se resolvovalo jako id běhu → 404.

- [x] roadmap - karta issue - nepotřebujeme zobrazovat jako tagy všechny blokující issue. Stačí tam dát jen badge "čeká" nebo "blokován". Po najetí myší můžeme ukázat v tooltipu názvy vlokujících issue. Blokující issue musejí být klikatelné v detailu issue kde proklik otevře dialog s detailem daného issue.
      <br>→ `0be768c6` — jeden badge ("čeká" / "blokován (N)") + tooltip s názvy. Proklik blokujících v detailu už fungoval, ověřeno testem, neměněno.

- [x] pokud běží task a je přiřazen subsystému, ten subsystém by okolo svého orbu měl mít obíhající kuličky simbolizující každá jeden task který subsystém zpracovává. ZároveŇ mezi orbem subsystému a centrálním orbem musí probíhat "komunikace" po spojité čáře tak jak je v designu velinu-D
      <br>→ `01b67d6a` — animace byly hotové už dřív, jen se nikdy nespustily: všechny tři cesty atribuce filtrovaly na `kind === "pipeline"`, přitom zhruba polovina běhů je agentní. Rozšířeno na serveru i klientovi, včetně SSE scope `agent-runs` pro komunikaci po spojnici.

- [ ] U kartiček zpráv, která jsou k návrhu schválení / zamítnutí musíme dát vždy odkaz na zrdoj té zprávy - tedy do JIRY/Githubu/Slacku/... Taky abychom zprávu vždy mohli otevřít v kontextu
