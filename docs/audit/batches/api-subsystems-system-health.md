BATCH: api-subsystems-system-health

[SEVERITY: Medium] [FILE: apps/api/src/subsystems/subsystems.service.ts:222-226] [CATEGORY: Performance]
`attributeApproval()` iteruje pole `ownedPipelineRuns` pro KAŽDÝ approval (O(N*M) lookup).
Doporučení: vytvořit `Map<string, OwnedPipelineRun>` pro exaktní shodu a prefix-matching.

[SEVERITY: Medium] [FILE: apps/api/src/health/health.controller.ts:25-28] [CATEGORY: Reliability]
`getHealth()` volá `Promise.all([preflight.probe(), subsystems.probeAll()])` bez timeout — zaseknutý probe blokuje health check.
Doporučení: přidat explicitní timeout (5-10s) přes `Promise.race()` nebo `AbortSignal`.

[SEVERITY: Medium] [FILE: apps/api/src/subsystems/subsystems.controller.ts, system/system.controller.ts, health/health.controller.ts] [CATEGORY: Testing]
Žádný ze tří controllerů nemá unit testy (jen služby mají pokrytí).
Doporučení: přidat controller unit testy s mockovanými službami, ověřit routing a response shape.

[SEVERITY: Low] [FILE: apps/api/src/system/system-config.fixture.ts:41] [CATEGORY: Type Safety]
`return store as SystemConfigStore` — type assertion bez runtime validace, fixture vrací partial mock jako plný interface.
Doporučení: vrátit `Pick<SystemConfigStore, ...>` nebo strukturovat mock ke interface.

[SEVERITY: Low] [FILE: apps/api/src/health/health.controller.ts:33] [CATEGORY: Code Clarity]
Zbytečné `as const` na string literálech (`"degraded" as const`).
Doporučení: zjednodušit — type inference stačí.

[SEVERITY: Low] [FILE: apps/api/src/system/system-config.store.ts:43] [CATEGORY: Architecture]
Konstruktor volá synchronní `readFileSync()` na config soubor (zdůvodněno komentářem: boot time, malý soubor). SystemConfigStore je @Global, ale write není multi-proces bezpečný.
Doporučení: zachovat boot-time design; zdokumentovat atomicitu writes.

STATS: 15 souborů, 1221 řádků. Top 3: subsystems.service.test.ts (405), subsystems.service.ts (236), system-config.store.ts (77). Health = reference resource, čistá.
