# Phase N4e — Hooks + MCP na interakční gramatiku

> Třetí dávka gramatické migrace (šablona N4c/N4d). Hooks a MCP jsou dvojčata:
> Collection karet, jejichž „Konfigurovat" otevírá create+edit **dialog**
> (HookFormDialog / McpServerFormDialog, controlled inputs), mazání uvnitř
> dialogu bez potvrzení. Automations mají vlastní fázi (N4f — system
> automatizace + trigger builder).

## Rozhodnutí

1. **Nové routes `/hooks/[id]` a `/mcp/[id]`** → `DetailScreen` per feature:
   PageHeader (titul = jméno, subtitle = event·matcher / transport), akce
   VPRAVO NAHOŘE: Uložit (primary), Smazat (**confirm dialog**), Zpět.
2. **Karta naviguje**: „Konfigurovat" na kartě dělá `router.push` na detail.
3. **Dialogy jen create**: edit mode (`hook?`/`server?` + `onDelete`) odstraněn;
   create → naviguje na nový detail.
4. **Sdílený formulářový stav**: controlled inputs extrahovány do
   `useHookFormState` + `HookFormFields` / `useMcpFormState` +
   `McpServerFormFields` — dialog i detail renderují totéž (id/transport se
   zamyká přes `idLocked`).
5. Detail čte `useHookQuery(id)` / `useMcpServerQuery(id)` (kontrakty `getHook`
   / `getMcpServer` už existují — nové hooky jen v web vrstvě).
6. Typed routes: `rtk proxy npx next typegen` s cwd=apps/web.

## DoD (testy)

- [ ] hooks `Screen.test.tsx` (realign): Konfigurovat naviguje na `/hooks/:id`;
      add otevře create-only dialog
- [ ] hooks `DetailScreen.test.tsx`: Uložit → update mutace; Smazat → confirm →
      delete + push("/hooks"); id zamčené
- [ ] mcp `Screen.test.tsx` (realign) + `DetailScreen.test.tsx`: totéž
      (transport na detailu zamčený, token write-only zůstává)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
