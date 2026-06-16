# M1 — Project Profile (operační atom)

**Závislosti:** žádné — toto je základ; vše ostatní závisí na M1.

**Proč jako první:** north-star dělá z project profile jednotku operačního kontextu
(„bez project profile je ZIBBY slepý"). Kanály, autonomie a briefing jsou na ni navázány.
Vše downstream závisí na tomto.

## Reality (co existuje)

`project` je reálný, file-backed registry s `id/name/path/desc/category/checks/
budget(dailyRuns/weeklyRuns/maxConcurrent)/env/secrets`. Gate engine již matchuje
`context` podmínku, která může nést `projectId`.

## Gap (co chybí)

- Žádné `identity.people` (s VIP flags)
- Žádná `autonomy_policy`
- Žádný `daily_rhythm`
- Žádné vázání integration/channel na projekt
- Web surface je tenký CRUD picker, ne profile editor

## Build

- Rozšířit `libs/contracts/.../project.schema.ts` (contract-first): přidat `identity.people[]`
  (name / role / vip / comms_style), `autonomy_policy` (`can_do_alone[]`, `always_ask[]`,
  `vip_escalation`, `respond_as: autonomous|draft_only`), `daily_rhythm` (standup_time,
  format, active_hours). Ponechat `budget` kde je.
- Vázat kanály na projekty: integration odkazuje projekt(y), které monitoruje (rozšířit
  integrations contract, ne projekt — kanály zůstávají per-integration, projekty deklarují
  které sledují).
- Endpointy: `GET/PUT /projects/:id/profile`, `GET/POST /projects/:id/people`.
- Persistovat jako `vault/projects/<id>.md` frontmatter, takže profil je zároveň grounding note
  (soubory jsou source of truth; dnes existuje pouze `_categories.json`).
- Gate: formalizovat per-project resolution na existující `context` podmínce — policy projektu
  může pouze **zpřísnit** globální floor (422 on relax), nikdy neuvolnit.
- UI: reálný profile editor v `/projects` — Team (VIP flagging), Channels (bind integrations),
  Autonomy (visual can-do / must-ask editor), Daily Rhythm. Nahradit holý CRUD formulář.

## Output

Operátor může plně popsat misi v UI; agenti běžící v daném projektu se groundují na jeho profilu;
gate respektuje per-project policy.
