# Phase N4d — Skills + Commands na interakční gramatiku

> Druhá dávka gramatické migrace (šablona = N4c agents,
> `docs/plans/phase-n4c-agents-grammar.md`): skills a commands sdílejí stejný
> rozbitý vzor — tile otevírá create+edit **dialog** (AddSkillModal /
> AddCommandModal s `initial` = edit mode), mazání bez potvrzení.

## Rozhodnutí

1. **Nové routes `/skills/[id]` a `/commands/[id]`** → `DetailScreen` per
   feature: PageHeader (titul = jméno / `/<id>`, subtitle = backing file /
   argument-hint), akce VPRAVO NAHOŘE: Uložit (primary), Smazat (**confirm
   dialog** — dřív se mazalo bez potvrzení), Zpět.
2. **Tile naviguje** (`router.push`) — žádný edit dialog. Aria label
   `openSkillAria` / `openCommandAria` („Otevřít …").
3. **Dialogy jen create**: z `AddSkillModal` / `AddCommandModal` odstraněn
   edit mode (`initial`/`onDelete`/isEdit pryč). Create → naviguje na nový
   detail (jako agents).
4. **Sdílené formulářové tělo**: Grid s poli extrahován do `SkillFormFields` /
   `CommandFormFields` — dialog i detail renderují totéž (žádná duplikace,
   drag-drop import souborů zůstává dostupný na obou plochách).
5. Lazy full-body fetch zůstává: detail čte `useSkillQuery(id)` /
   `useCommandQuery(id)` (seznam tělo vynechává).
6. Typed routes: `rtk proxy npx next typegen` s cwd=apps/web.

## DoD (testy)

- [ ] skills `Screen.test.tsx`: tile klik naviguje na `/skills/:id`; add otevře
      create-only dialog (žádné „Uložit"/„Smazat" vocabulary)
- [ ] skills `DetailScreen.test.tsx`: Uložit volá update mutaci; Smazat →
      confirm → delete mutace + push("/skills"); accessible names
- [ ] commands `Screen.test.tsx` + `DetailScreen.test.tsx`: totéž pro commands
      (id pole na detailu zamčené)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
