# Phase N5a — Controlling the Machine: file operations za bránou

> N1–N4 doručeny (N4i ověřilo: Chat-UI včetně persona pickeru KOMPLETNÍ — nic
> nezbývá), takže N5 („nice-to-have, až nakonec") je legitimně na řadě. První
> slice = referenční úloha „otevři složku X a přejmenuj soubory" — plně za
> approval floorem.

## Rozhodnutí

1. **Vzor = jira-issue flow** (ResumableRunner registry): `propose()` NIKDY nic
   nevykoná — spočítá dry-run PREVIEW, uloží durable záznam a zaparkuje Tier-3
   approval (`kind: "machine"`, risk high). `resume()` (approve) vykoná renames
   právě jednou; `cancel()` (reject) záznam zamítne. Na rozdíl od jira-issue je
   pending stav DURABLE (`MachineActionStore`, files-as-source-of-truth) — the
   preview je zároveň auditní mapa starý→nový (reversible-by-default).
2. **Contract-first** `libs/contracts/src/machine/`: `MachineActionSchema`
   (v1 jediný kind `rename-files`: {folder, find, replace} — literal substring
   v basename), `MachineActionRecordSchema` {id, action, preview[], state
   proposed|executed|rejected|failed, approvalId, requestedAt, executedAt?,
   error?}, `machineContract`: POST /api/machine/actions (propose → 201),
   GET seznam/detail. Exekuce NIKDY přes HTTP — jen brána.
   `ApprovalRunKindSchema` += "machine"; `ActivityKindSchema` += "machine-action"
   (group approvals).
3. **Guardy v propose** (fail-closed): folder musí být absolutní existující
   adresář; find/replace nesmí obsahovat oddělovače cest (žádný traversal);
   prázdné preview → 422; kolize cílů (duplicitní/existující) → 422.
4. **Guardy v resume**: záznam musí být `proposed` (idempotence — druhý resume
   je no-op); před každým rename re-verify (zdroj existuje, cíl ne) — jinak
   state `failed` + error, nikdy crash. Activity `machine-action` po vykonání.
5. Web: approval se objeví v existující frontě (generické renderování kindů);
   žádná nová web plocha v tomto slice (chat tool = N5b).

## DoD (testy)

- [ ] `machine.contract.test.ts`: tvary + closed enums
- [ ] `machine.service.test.ts` (reálné temp adresáře): propose počítá preview
      a NEpřejmenovává; guardy (relativní folder, traversal, kolize, prázdné);
      approve → soubory přejmenované + state executed + activity; reject →
      žádná změna na disku; resume ne-proposed záznamu = no-op; zmizelý zdroj →
      failed s error
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
