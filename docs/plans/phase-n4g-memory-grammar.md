# Phase N4g — Memory note editor na interakční gramatiku

> Pátá dávka gramatické řady. `NoteEditorDialog` má mode create/edit — editace
> velkého markdown těla v modalu porušuje „dialogy jen create/confirm". Vzor pro
> velká těla (research N4f): **view→edit toggle přímo na note ploše**, edit
> vpravo nahoře. Integrations dialog (15K, kind-switching form) dostane vlastní
> fázi N4h — držíme fáze malé.

## Rozhodnutí

1. **`NoteView` = view⇄edit plocha**: HudPanel `action` slot (vpravo nahoře)
   nese Editovat (view) / Uložit + Zrušit (edit). Edit mode: title input +
   `MarkdownEditor`; komponenta vlastní `useUpdateNoteMutation`; po uložení
   zpět do view. Screen keyuje `NoteView` podle note id (přepnutí poznámky
   resetuje rozeditovaný stav).
2. **`NoteEditorDialog` jen create**: mode/note props pryč; slug id z titulu a
   tier picker zůstávají (create-only vlastnosti).
3. **NC**: smazat nepoužívaný `dailyNodes` memo v memory/Screen.tsx — jediný
   dlouhodobý lint warning v repu.
4. Žádná změna kontraktu (updateNote existuje) ani routes.

## DoD (testy)

- [ ] `NoteView.test.tsx`: Editovat (vpravo nahoře) přepne do edit; Uložit →
      update mutace {title, body} → zpět do view; Zrušit zahodí změny;
      accessible names
- [ ] `NoteEditorDialog.test.tsx` (realign): create-only — slug id test
      zůstává, edit test pryč
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené (0 warnings v memory)
