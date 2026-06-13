---
name: Loop 1
objective: >-
  Refaktoruj velké komponenty v apps/web/components/. Podkomponenty a funkce
  vracející React element vytáhni do vlastních souborů (jedna komponenta = jeden
  soubor) podle konvence projektu. Ucelenou logiku (stav, efekty, související
  výpočty a handlery) vytáhni do pomocné funkce nebo custom hooku (useXxx), ať
  komponenta zůstane hlavně o renderu. Chování ani vizuál neměň, žádné nové
  závislosti. Začni od nejdelších souborů (LoadingScreen, EntityFormModal,
  LimitsRings, GlobalSearch). Opakuj, dokud pnpm lint && pnpm typecheck && pnpm
  test nebude zelená a nezbude žádná vnořená podkomponenta ani ucelený blok
  logiky k vytažení.
maker:
  kind: pipeline
  id: delivery
verifier:
  kind: checks
maxIterations: 6
---

Refaktoruj velké komponenty v apps/web/components/. Podkomponenty a funkce vracející React element vytáhni do vlastních souborů (jedna komponenta = jeden soubor) podle konvence projektu. Ucelenou logiku (stav, efekty, související výpočty a handlery) vytáhni do pomocné funkce nebo custom hooku (useXxx), ať komponenta zůstane hlavně o renderu. Chování ani vizuál neměň, žádné nové závislosti. Začni od nejdelších souborů (LoadingScreen, EntityFormModal, LimitsRings, GlobalSearch). Opakuj, dokud pnpm lint && pnpm typecheck && pnpm test nebude zelená a nezbude žádná vnořená podkomponenta ani ucelený blok logiky k vytažení.
