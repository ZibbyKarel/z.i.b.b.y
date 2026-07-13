BATCH: web-integrations

[SEVERITY: Medium] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:1-504] [CATEGORY: File size / separation of concerns]
Soubor kombinuje testid enum, 150řádkový custom hook `useIntegrationFormState` (state pro 5 druhů configu + build/validate logika) a 200řádkovou komponentu ve stejném souboru; 504 řádků je nejhorší v batchi.
Doporučení: rozdělit na `useIntegrationFormState.ts` (hook + typy `IntegrationFormState`) a `IntegrationFormFields.tsx` (jen komponenta + testid enum).

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:144-202] [CATEGORY: Business logika mimo util]
`buildConfig`/`configReady` obsahují per-kind transformační a validační pravidla (5 větví switch) přímo uvnitř hooku definovaného v komponentovém souboru, ne jako samostatná util funkce/soubor, což ztěžuje samostatné testování bez renderu formuláře.
Doporučení: vytáhnout `buildConfig`/`configReady` do čistých exportovaných funkcí v `integrationFormConfig.ts`, testovatelných bez React.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:316] [CATEGORY: Chybějící typování]
`onValueChange={(v) => form.setKind(v as IntegrationKind)}` type-castuje hodnotu ze `SelectField` na union `IntegrationKind` bez běhové validace.
Doporučení: validovat/zúžit hodnotu (např. `Object.values` guard nebo generický `SelectField<IntegrationKind>`) místo přímého `as`.

[SEVERITY: Medium] [FILE: apps/web/features/integrations/components/InboxPanel.tsx:81-99] [CATEGORY: Duplicitní vzor]
`InboxPanel` a `NeedsAttentionPanel` (components/NeedsAttentionPanel.tsx:108-130) mají identickou kostru: `useChannelItemsQuery()` → filtr podle `projectId` → další filtr specifický pro panel → `reverse().slice(0, 12)` → early-return `null` při prázdném seznamu → `Container`+`HudPanel` wrapper. Číslo 12 i vzor "recent" jsou duplikované natvrdo ve dvou souborech.
Doporučení: vytáhnout sdílený hook `useRecentChannelItems(projectId, predicate, limit = 12)` do `queries/`, který oba panely použijí.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:107-266] [CATEGORY: Komponenta na míru / obecnost]
Formulářová logika je psaná ručně (useState na 17 polí) místo přes `@zibby/forms` (RHF+zod adapter), který je standardní vrstva pro formuláře; validace (`idError`, `configReady`) se dělá ručně na každém keystroke.
Doporučení: zvážit migraci na `@zibby/forms` se zod schématem per-kind, pokud se přidá další kind nebo pole.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:283-504] [CATEGORY: Prop drilling]
Jediný `form: IntegrationFormState` prop nese 34 polí (17 hodnot + 17 setterů) — objekt je nadměrně široký pro jednu komponentu a znesnadňuje partial reuse (např. jen email podformulář).
Doporučení: pokud přibude další kind, rozklad `form` na per-kind pod-objekty nebo Context.

Pozitiva (bez nálezu): queries/ a mutations/ jsou vzorové (makeInvalidatingMutation / selectApiResponseBody + getXxxQueryKey), žádné `any`, žádné credentials v cache (`Integration` nese jen `hasCredentials: boolean`), žádné inline styly/vlastní Tailwind, žádné logování credentials. Testy explicitně ověřují, že secret/token nikdy neputuje v create/patch payloadu.

STATS: 24 souborů, 1780 řádků celkem. Top 3: components/IntegrationFormFields.tsx (504), DetailScreen.tsx (188), components/IntegrationFormDialog.test.tsx (152).
