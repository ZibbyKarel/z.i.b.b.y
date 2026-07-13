BATCH: web-automations

[SEVERITY: Medium] [FILE: apps/web/features/automations/schedule.ts:1-352] [CATEGORY: file-size]
Modul mísí 4 nezávislé zodpovědnosti (cron matcher, cron→descriptor, friendly Schedule⇄cron konverze, relative-time formatting) v jednom souboru přes 300 řádků, přestože jsou interně jasně oddělené komentářovými sekcemi.
Rozdělit na samostatné soubory/moduly (cron-matcher.ts, cron-descriptor.ts, schedule-cron.ts, relative-time.ts) nebo složku schedule/ s barrel exportem.

[SEVERITY: Medium] [FILE: apps/web/features/automations/components/AutomationFormDialog.tsx:49-53] [CATEGORY: duplication]
`scheduleValid` v dialogu ručně opakuje stejnou validační logiku, jakou už počítá `useAutomationFormState().canSave()` v AutomationFormFields.tsx:60-64 — dvě místa, která se musí udržovat synchronně, jinak se validace rozejde.
Nahradit `scheduleValid` voláním `form.canSave()`.

[SEVERITY: Medium] [FILE: apps/web/features/automations/Screen.tsx:41-58] [CATEGORY: duplication]
`resolveTarget` v Screen.tsx a `TARGET_GLYPH`/`taskGlyph` v AutomationCard.tsx:33-50 nezávisle implementují překrývající se mapování target.type/target.target?.kind → glyph, s mírně odlišnou logikou pro `task` typ (riziko budoucí divergence, komentář v AutomationCard to sám přiznává).
Vytáhnout sdílenou čistou funkci `resolveTargetGlyph(target)` (např. do schedule.ts sousedního util modulu nebo nového `target.ts`) a použít ji na obou místech.

[SEVERITY: Low] [FILE: apps/web/features/automations/Screen.tsx:45] [CATEGORY: typing]
`(agent?.glyph as IconName) ?? "bot"` přetypovává volně typované pole bez runtime validace; pokud backend uloží libovolný string, ikonka může tiše selhat/vykreslit nic.
Typovat `agent.glyph` jako `IconName` už na úrovni kontraktu, nebo validovat přes bezpečný lookup s fallbackem místo `as`.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/TriggerFields.tsx:69] [CATEGORY: typing]
`onValueChange={(v) => form.setTriggerType(v as TriggerType)}` přetypovává obecnou hodnotu ze `SegmentPickerField` bez runtime kontroly proti množině `TriggerType`.
Zúžit typ pomocí type-guardu nebo generického `SegmentPickerField<TriggerType>` místo `as`.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/AutomationFormDialog.tsx:26-29] [CATEGORY: business-logic-in-component]
`deriveName(text)` je čistá textová transformační funkce definovaná přímo v komponentě, mimo sdílený util modul — funkčně v pořádku, ale netestovaná samostatně a umístěná mimo konvenci "business logika mimo komponentu".
Přesunout do util souboru (např. vedle `slug.ts`) a pokrýt jednotkovým testem.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/AutomationCard.tsx:84-115] [CATEGORY: business-logic-in-component]
Odvození `scheduleText`, `next`, `lastLabel`, `nextLabel`, `targetText` je netriviální prezentační logika vsazená přímo do render těla komponenty (byť dobře komentovaná a pod 300 řádků).
Zvážit extrakci do malého view-model hooku (např. `useAutomationCardView(automation, locale, now)`) pro snazší izolované testování.

[SEVERITY: Low] [FILE: apps/web/features/automations/ (multiple)] [CATEGORY: test-coverage]
AutomationFormDialog.tsx, AutomationFormFields.tsx, TriggerFields.tsx, useCronLabel.ts a query hooky (useAutomationQuery/useAutomationsQuery/useAutomationsSearchQuery) nemají vlastní test soubor — pokrytí jde jen nepřímo přes Screen.test.tsx / DetailScreen.test.tsx / AutomationCard.test.tsx.
Doplnit alespoň úzké testy pro `useCronLabel` (formátovací větve) a `AutomationFormFields`/`TriggerFields` validaci.

STATS: files=19, total_lines=2180, top3=[schedule.ts:352, components/AutomationCard.tsx:278, DetailScreen.tsx:214]
