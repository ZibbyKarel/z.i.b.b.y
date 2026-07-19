# HUD → Chat UI migration gap

Audit datum: 2026-07-18. Zdroj pravdy: `apps/web/app/(dashboard)/**`, `apps/web/state/config.ts`
(`NAV_ITEMS`/`ROUTE_ONLY_ITEMS`), `apps/web/components/layout/AppShell/AppShell.tsx`,
`apps/web/features/chat/**`, `apps/web/features/subsystems/components/SubsystemDrawer/**`.

`/chat` není sada stránek — je to jedna fullscreen route, kterou `AppShellInner` (viz
`isChat` větev) úplně obchází starou chromu (Sidebar/breadcrumb/RightRail/wallet).
Zbytek `(dashboard)` group pořád běží ve staré HUD chromě beze změny.

## Inventář — všechny stránky staré HUD

| Sidebar položka    | Route(y)                                                 | V Chatu nativně?                                                                              | Odkaz z Chatu ven?                                  | Poznámka                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| overview           | `/overview`                                              | ne (jen `CoreOverviewDialog` — hrubý tally, ne stránka)                                       | ano — `ChatTopBar` „zpět do HUD"                    | s tímhle se počítá. Overview jako takové by mělo zmizet a informace z něj by se měly rozpustit na více míst (hlavní část je třeba status line v top baru kde vidím co čeká na mě) |
| runs               | `/runs` (`?run=` pro detail, žádná `[id]` routa)         | částečně — `ChatTaskDetailColumn` (inline 2-col detail), `AktivitaTab`                        | ano, ale mimo dock                                  | To je záměrné, běžící úlohy vidím v sidebaru nalevo a všechny úlohy pak uvidím na stránce archivů úloh kde budou roztříděny podle subsystémů                                      |
| projects           | `/projects`, `/[id]`, `/new`, `/[id]/integrations/[iid]` | ne                                                                                            | list ano (dock); detail/new/integrace ne            |                                                                                                                                                                                   |
| companies          | `/companies`, `/[id]`, `/new`                            | ne                                                                                            | list ano (dock); detail/new ne                      |                                                                                                                                                                                   |
| agents             | `/agents`, `/[id]`                                       | částečně — `RosterTab` „Posádka" (karta → `/agents/[id]`)                                     | list ano (dock) i detail (přes Roster)              |                                                                                                                                                                                   |
| pipelines          | `/pipelines`, `/[id]`                                    | částečně — `RosterTab` renderuje vlastněné pipeline canvasy inline                            | ne — list `/pipelines` nikde                        |                                                                                                                                                                                   |
| chains             | `/chains`, `/[id]`                                       | částečně — `RosterTab` karta → `/chains/[id]`                                                 | detail ano; list `/chains` nikde                    |                                                                                                                                                                                   |
| automations        | `/automations`, `/[id]`                                  | ne                                                                                            | nikde, žádná zmínka                                 |                                                                                                                                                                                   |
| skills             | `/skills`, `/[id]`                                       | ne                                                                                            | list ano (dock); detail ne                          |                                                                                                                                                                                   |
| commands           | `/commands`, `/[id]`                                     | ne                                                                                            | list ano (dock); detail ne                          |                                                                                                                                                                                   |
| hooks              | `/hooks`, `/[id]`                                        | ne                                                                                            | nikde, žádná zmínka                                 |                                                                                                                                                                                   |
| mcp                | `/mcp`, `/[id]`                                          | ne                                                                                            | list ano (dock); detail ne                          |                                                                                                                                                                                   |
| memory             | `/memory`                                                | ne (jen `ArtefaktyTab` odkaz ven)                                                             | ano (dock)                                          |                                                                                                                                                                                   |
| settings           | `/settings`                                              | ne                                                                                            | ano (dock, samostatná ikona)                        |                                                                                                                                                                                   |
| gates (route-only) | `/gates`                                                 | částečně — `GatesTab` = gate rules per subsystem, odkazuje jen na `/projects/:id?tab=profile` | ne — samotné `/gates` (globální policy floor) nikde |                                                                                                                                                                                   |

## Co překlopit do Chat UI (dnes jen jump-out, žádný chat-nativní povrch)

`companies`, `projects` (list), `skills`, `commands`, `mcp` — dock ikona katapultuje
zpět do staré chromy. Žádný z nich nemá Velín-D drawer/dialog ekvivalent, jak ho dnes
mají subsystémy (`SubsystemDrawer`).

## Co v novém designu úplně chybí (žádný náznak nativního povrchu)

- **`/pipelines` a `/chains` jako seznamy** — jen vlastněné položky uvnitř `RosterTab`,
  žádný „procházet všechny" pohled
- **`/automations`** — nulová stopa v chatu (žádná dock ikona, žádný drawer tab)
- **`/hooks`** — stejně, nulová stopa
- **`/gates`** globální panel — `GatesTab` řeší jen per-subsystem/per-project pravidla,
  na samotnou stránku nikdy neodkazuje
- **`/runs` plný list + filtry** — dostupné jen jako odkaz ven, žádná in-chat tabulka

## Na co v Chatu není odkaz vůbec (osiřelé, i jump-out chybí)

`/automations`, `/automations/[id]`, `/hooks`, `/hooks/[id]`, `/gates`,
`/companies/[id]`, `/companies/new`, `/projects/new`,
`/projects/[id]/integrations/[integrationId]`, `/commands/[id]`, `/mcp/[id]`,
`/skills/[id]` — u detail/CRUD variant dock vede maximálně na list, samotnou entitu
musíš najít proklikem uvnitř staré HUD.

**Nejpalčivější mezera:** automations a hooks nemají v Chat UI vůbec žádnou existenci —
ani ikonu, ani zmínku v žádném z drawer tabů — přestože obě spadají pod vlastnictví
konkrétních subsystémů (Loom/Maestro apod.) stejně jako pipelines a chains, které svou
Roster kartu už dostaly.
