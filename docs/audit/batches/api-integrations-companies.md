BATCH: api-integrations-companies

[SEVERITY: High] [FILE: apps/api/src/integrations/integrations.controller.ts:48] [CATEGORY: Performance]
`assertProjectExists()` načítá všechny projekty přes `list().some()` jen aby zkontrolovala existenci jednoho — neoptimální O(n) lookup.
Doporučení: refaktorovat na `this.projects.get(projectId).catch(() => null)`.

[SEVERITY: High] [FILE: apps/api/src/companies/companies.storage.service.ts:56] [CATEGORY: Performance]
`get()` provádí `(await this.list()).find()` — načítá všechny záznamy do paměti jen aby našel jeden. (Systémový list()-then-find vzor — viz i projects.storage, task-runs, pipeline-runs, chains artifacts.)
Doporučení: přímé prohledávání manifestu nebo indexace.

[SEVERITY: High] [FILE: apps/api/src/projects/resolved-project.service.ts:103] [CATEGORY: Performance]
`integrationsByOwner()` volá `integrations.list()` a pak two-phase filter na companyId/projectId — při každém resolve se načtou všechny integrace (N+1 při resolved merge).
Doporučení: přidat filterovací metody (byCompanyId, byProjectId) do IntegrationsStorageService.

[SEVERITY: Medium] [FILE: apps/api/src/integrations/integrations.controller.ts:60-65] [CATEGORY: Data Integrity]
Company-owned integrations (body.companyId) neprochází FK validací — jen projectId je ověřen (Phase 70 TODO komentář). (Souvisí s contracts-b Integration XOR typovou dírou.)
Doporučení: implementovat `assertCompanyExists()` a zavolat pro companyId.

[SEVERITY: Medium] [FILE: apps/api/src/integrations/integrations.controller.ts:177-181] [CATEGORY: Code Organization]
Control-flow error třídy (ImmutableKindViolation, CredentialKindViolation atd.) definované v kontroleru místo v integrations.errors.ts.
Doporučení: extrahovat do integrations.errors.ts (konzistence s companies/projects).

[SEVERITY: Medium] [FILE: apps/api/src/companies/companies.storage.service.ts] [CATEGORY: Code Duplication]
CompaniesStorageService a ProjectsStorageService reimplementují identickou manifest-based logiku (list/get/create/update/delete/atomický zápis) bez sdíleného utility. (Potvrzuje shared-root nález o chybějícím ManifestFileStore.)
Doporučení: extrahovat ManifestFileStore abstraktní třídu.

[SEVERITY: Medium] [FILE: apps/api/src/integrations/integrations.controller.ts] [CATEGORY: Test Coverage]
Chybí e2e testy pro controller handlery (setCredentials, deleteCredentials, testIntegration, FK validace).
Doporučení: přidat e2e testy — minimálně credential lifecycle a FK constraint.

[SEVERITY: Medium] [FILE: apps/api/src/companies/companies.storage.service.ts:85-91] [CATEGORY: Data Integrity]
Smazání společnosti nekaskáduje ani neprověřuje závislosti — integrace/projekty mohou mít dangling companyId (patrně záměr, nedokumentováno).
Doporučení: zdokumentovat no-cascade design nebo přidat warning log.

[SEVERITY: Low] [FILE: apps/api/src/integrations/integrations.controller.ts:23] [CATEGORY: Code Quality]
Inline helper `unprocessable()` je duplicitní.
Doporučení: přesunout do shared error-mapping utility.

[SEVERITY: Low] [FILE: apps/api/src/integrations/credentials.store.ts] [CATEGORY: Observability]
Žádné logging v credentials store — záměrné (bez úniku tajemství), ale selhání read/write jsou tichá.
Doporučení: přidat non-credential-leaking error logging.

Pozitivum: credentials write-only, v response jen hasCredentials — potvrzeno (souhlasí s web-integrations a contracts-b).

STATS: 14 souborů (9 integrations + 5 companies), 1059 řádků bez testů. Top 3: integrations.storage.service.ts (208), integrations.controller.ts (181), companies.storage.service.ts.
