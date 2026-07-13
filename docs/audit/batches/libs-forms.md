BATCH: libs-forms

[SEVERITY: High] [FILE: libs/forms/src/FormMarkdownEditor/FormMarkdownEditor.tsx:11-27] [CATEGORY: bug/API consistency]
FormMarkdownEditor never reads `fieldState.error` (only destructures `field`) and never passes an `error` prop to `MarkdownEditor` — unlike all 7 other field wrappers which uniformly do `error={fieldState.error?.message ?? error}`. Zod validation errors on a markdown body silently never render. Underlying `MarkdownEditorProps` also has no `error`/invalid prop at all, so fixing the wrapper requires extending the DS component first.
Add `error`/invalid support to DS `MarkdownEditor` and wire `fieldState.error?.message ?? error` through `FormMarkdownEditor`.

[SEVERITY: Medium] [FILE: libs/forms/src/FormMarkdownEditor/FormMarkdownEditor.test.tsx] [CATEGORY: missing test]
Every other field's test file has a "shows zod error as error text on submit" case; `FormMarkdownEditor.test.tsx` has no such case, which is exactly why the missing error-wiring above went unnoticed.
Add a zod-schema error-display test once the underlying bug is fixed.

[SEVERITY: Medium] [FILE: libs/forms/src/FormFilePicker/FormFilePicker.tsx:12-31] [CATEGORY: API consistency]
`name` is destructured out of props for `useController` and never re-applied to the underlying element — the real `<input type="file">` ends up with no `name` attribute, breaking native form semantics/autofill and name-based queries.
Explicitly set `name={field.name}` on the `FilePickerField` call, mirroring `FormTextInput`/`FormTextArea`.

[SEVERITY: Medium] [FILE: libs/forms/src — všech 8 field wrapperů] [CATEGORY: duplication]
All 8 wrappers repeat the identical shape: destructure `name`/`error`/`hint`/`defaultValue`, call `useController` with a `(defaultValue ?? X) as never` cast, then spread props with `error={fieldState.error?.message ?? error}`. Each field reimplements the same ~10 lines of RHF glue.
Extract a small internal `useFormField(name, defaultValue)` helper that each wrapper calls.

[SEVERITY: Medium] [FILE: libs/forms/src — všech 8 field wrapperů (FormTextInput.tsx:22 atd.)] [CATEGORY: typing]
`defaultValue: (defaultValue ?? X) as never` appears identically in all 8 wrappers to bypass `useController`'s constraint. `never` suppresses all structural checking — equivalent to `any` for that argument, repeated rather than centralized.
Centralize the cast inside a shared typed helper with one documented assertion instead of eight ad hoc ones.

[SEVERITY: Low] [FILE: libs/forms/src/FormTextInput/FormTextInput.tsx:32 (+ TextArea, Toggle, FilePicker)] [CATEGORY: typing]
`ref={field.ref as unknown as Ref<HTMLInputElement>}` double-casts through `unknown` — suggests RHF's `field.ref` and the DS component's `Ref<T>` prop aren't reconciled at the type level.
Type a shared helper's return so the ref cast happens once.

[SEVERITY: Low] [FILE: libs/forms/src/FormSelect/FormSelect.tsx:26] [CATEGORY: typing]
`value={(field.value ?? "") as T}` casts generic RHF field value directly to the caller's generic `T` with no runtime check.
Accept the risk documented once in the shared helper, or validate against `options` before casting.

[SEVERITY: Low] [FILE: libs/forms/src/zodResolver.ts:12] [CATEGORY: typing]
`_zodResolver(schema as any)` is the one explicit `any` in the library (with eslint-disable and comment about @hookform/resolvers/zod version type mismatch). Legitimate today, but an upstream type upgrade could silently change behavior.
Add a version-tied TODO note and/or narrow the cast.

[SEVERITY: Low] [FILE: libs/forms/src/Form/Form.tsx:18-34,45-60] [CATEGORY: duplication]
`useFormControls` and `Form` both independently call `useForm`, build `submit`, and wrap children in `FormProvider` + `<form>` — `Form` does not reuse `useFormControls`.
Implement `Form` in terms of `useFormControls`'s `renderForm`.

[SEVERITY: Low] [FILE: libs/forms/src/FormSelect/FormSelect.tsx] [CATEGORY: API coverage gap]
DS `SelectField` supports multi-select mode, but `FormSelect` only wraps `SelectFieldSingleProps` — no RHF-bound multi-select wrapper exists, so screens needing one must hand-roll a `Controller`, defeating the "app imports only from @zibby/forms" convention.
Add a `FormMultiSelect` (or extend `FormSelect`) if multi-select forms are needed.

[SEVERITY: Low] [FILE: libs/forms/src (all field wrappers)] [CATEGORY: missing testid/DS coverage]
`SelectField`, `SegmentPickerField`, and `DropZoneField` still have no `data-testid` enum of their own (tests fall back to adjacent primitives' enums), so `FormSelect`/`FormSegmentPicker`/`FormDropZone` inherit that gap. (Pozn.: konvenční poznámka "testid jen TextInput+TextArea" je zastaralá — ToggleField, FilePickerField, NumberField, HighlightTextAreaField, MarkdownEditor už TestId enumy mají.)
Add dedicated `TestId` enums to `SelectField`, `SegmentPickerField`, and `DropZoneField` in the DS.

STATS: 27 files, 1508 total lines. No file exceeds 300 lines; library is intentionally small and uniform.
