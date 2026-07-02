# Phase N4h — Integrations na interakční gramatiku (UZAVÍRÁ řadu)

> Poslední porušitel: `IntegrationFormDialog` (kind-switching create+edit form,
> write-only secret) na project detailu; mazání z karty bez potvrzení.

## Rozhodnutí

1. **Nested route pod vlastníkem** (GitLab precedens Settings → Webhooks →
   webhook page): `/projects/[id]/integrations/[integrationId]` →
   `IntegrationDetailScreen`. Integrace patří projektu, globální /integrations
   page neexistuje — flat route by neměla rodičovský seznam.
2. **Karta naviguje**: „Konfigurovat" dělá `router.push` na detail. Toggle +
   Test zůstávají na kartě (labeled quick actions); **Delete z karty mizí** —
   žije na detailu za confirm dialogem (dřív mazal bez potvrzení).
3. **Dialog jen create**: edit mode pryč; create → naviguje na nový detail.
4. **Sdílený formulář**: `useIntegrationFormState(projectId, integration?)` +
   `IntegrationFormFields` (N4e vzor) — kind/id zamčené na detailu; write-only
   secret jede dál out-of-band přes credentials mutaci na obou plochách
   (email→password, jinak token).
5. Detail akce vpravo nahoře: Uložit (primary), Test spojení (ghost, Alert
   s výsledkem), Smazat (confirm), Zpět (→ project detail ?tab=integrations).
6. `useIntegrationQuery(id)` nad existujícím `getIntegration`. Typed routes
   regen s cwd=apps/web.

## DoD (testy)

- [ ] `IntegrationFormDialog.test` (realign): create-only
- [ ] `DetailScreen.test.tsx`: Uložit → update patch + secret přes credentials
      mutaci (nikdy v configu); Test → test mutace + Alert; Smazat → confirm →
      delete + push zpět na projekt; kind zamčený
- [ ] `ProjectIntegrationsPanel` chování: Configure naviguje (přes
      ProfileScreen/panel test pokud existuje)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
