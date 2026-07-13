BATCH: web-feat-tiny

[SEVERITY: High] [FILE: apps/web/features/goals/mutations/useResumeGoalRunMutation.ts:7-11] [CATEGORY: Convention Violation]
Inline kóduje `useQueryClient()` + `useMutation()` s `onSuccess` namísto abstrakce `makeInvalidatingMutation()`, kterou používá ~40 ostatních mutations v projektu. Invaliduje jen jeden queryKey, takže abstrakce by se měla bez problémů použít. (Reálná severity spíš Medium — konzistence, ne riziko.)
Doporučení: Migrovat na `makeInvalidatingMutation(apiClient.taskRuns.resumeTaskRun.useMutation, allTaskRunsKey)`.

[SEVERITY: Medium] [FILE: apps/web/features/notifications/useNotifications.ts:13-22] [CATEGORY: Business Logic in Hook]
Hook destructuruje výsledky tří queries a aplikuje `selectNotifications()` transformaci přímo; vrací array přímo místo useQuery objektu — nestandardní rozhraní.
Doporučení: Zvážit umístění logiky / zdokumentovat vzor kompozitního hooku.

[SEVERITY: Low] [FILE: apps/web/features/approvals/queries/useApprovalsQuery.ts:16-18] [CATEGORY: Custom Select Function]
Používá vlastní `selectApprovals()` select namísto `selectApiResponseBody`. Funkčně správně (rozšíření schématu), ale odchylka od vzoru.
Doporučení: Ponechat, jen zdokumentovat proč.

[SEVERITY: Low] [FILE: apps/web/features/machine/mutations/useUpdateMachineConfigMutation.ts:13-20] [CATEGORY: Multiple Invalidations]
Invaliduje dva queryKeys místo jednoho, proto nemůže používat `makeInvalidatingMutation()`. Pattern je oprávněný.
Doporučení: Žádná akce potřebná.

STATS: 21 souborů (bez index.ts), 514 řádků bez testů. Top 3: notifications/notificationRules.ts (57), health/queries/useHealthQuery.ts (31), pins/components/PinButton.tsx (30). Tiny features jsou celkově čisté a drží konvence.
