# Machine — ovládání počítače za bránou (N5a)

ZIBBY sahá mimo repo na operátorův stroj — **výhradně Tier-3**. Návrh akce nikdy
nic nevykoná: spočítá dry-run preview, uloží durable záznam
(`MACHINE_ACTIONS_DIR`, default `ZIBBY_DATA_DIR/machine`) a zaparkuje approval
`kind: "machine"` (risk high). Teprve operátorovo schválení akci vykoná — přesně
jednou. Vzor = jira-issue flow (`ResumableRunner` registry), ale pending stav je
DURABLE soubor: restart bránu neztratí a preview zůstává jako auditní mapa
starý→nový (reversible-by-default).

## v1 slovník akcí (uzavřený, roste explicitně)

- `rename-files` `{folder, find, replace}` — přejmenuj soubory ve JMENOVANÉ
  složce: literal substring v basename. Guardy (fail-closed):
  - `folder` absolutní existující adresář;
  - `find`/`replace` bez oddělovačů cest (žádný traversal);
  - prázdné preview → 422; kolize cílů → 422;
  - exekuce re-verifikuje každý rename (zdroj existuje, cíl ne) — porucha →
    state `failed` + `error`, nikdy crash; už provedené renames zůstávají
    v preview mapě.

## Lifecycle záznamu

`proposed` → (approve) `executed` / (reject) `rejected` / (chyba při exekuci)
`failed`. Exekuce zapisuje activity `machine-action` (skupina approvals).
Druhý resume / resume ztraceného záznamu = idempotentní no-op.

## HTTP

```
POST /api/machine/actions        návrh {action} → 201 záznam s preview (422 guard)
GET  /api/machine/actions        seznam záznamů (newest-first)
GET  /api/machine/actions/:id    jeden záznam
```

Žádný execute endpoint neexistuje — jediná cesta k vykonání je approval brána
(Law 1: brána je strukturální). Approval se objeví v běžné frontě schvalování.
Follow-up (N5b): chat tool `machine_rename` jako operátorský vstup + druhá
referenční úloha (maps lookup).
