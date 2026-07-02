# Phase N4f — Automations na interakční gramatiku

> Poslední velký edit dialog (AutomationFormDialog: trigger builder cron/event,
> target picker, system automatizace se zamčeným vším kromě schedule). Navíc
> settability díra: kontrakt `deleteAutomation` existuje, ale web nemá žádnou
> delete plochu — automatizace nejde z UI smazat vůbec.

## Rozhodnutí

1. **Nová route `/automations/[id]`** → `DetailScreen`: PageHeader (titul =
   jméno, subtitle = lidský popis triggeru), akce VPRAVO NAHOŘE: Uložit
   (primary), Spustit teď (trigger mutace), Smazat (**confirm dialog**; skryté
   pro systémové), Zpět.
2. **Karta naviguje**: Edit akce na kartě dělá `router.push` na detail. Toggle
   + Spustit zůstávají na kartě (labeled quick actions, gramatika je nezakazuje).
3. **Dialog jen create**: `AutomationFormDialog` bez `automation` propu; create
   → naviguje na nový detail. Systémové automatizace se editují JEN na detailu
   (schedule-only zámek se přesouvá tam, včetně echo-back ochrany targetu).
4. **Sdílený formulář**: `useAutomationFormState` + `AutomationFormFields`
   (N4e vzor pro controlled inputs) — dialog i detail renderují totéž.
5. **Nové mutace/queries**: `useAutomationQuery(id)` (kontrakt `getAutomation`
   existuje) + `useDeleteAutomationMutation` (kontrakt `deleteAutomation`
   existuje) — čistě web vrstva, žádná změna API.
6. Typed routes: `rtk proxy npx next typegen` s cwd=apps/web.

## DoD (testy)

- [ ] `Screen.test.tsx` (realign): Edit naviguje na `/automations/:id`; create
      dialog create-only; karta toggle/run/system beze změny
- [ ] `DetailScreen.test.tsx`: Uložit → update mutace (system → JEN {trigger};
      non-system → plný patch); Spustit teď → trigger mutace; Smazat → confirm →
      delete + push("/automations"); system detail nemá Smazat ani target picker
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
