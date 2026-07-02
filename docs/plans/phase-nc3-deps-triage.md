# Phase NC3 — triage závislostí (knip nálezy z NC2)

> pnpm strict model: balík vidí jen deklarované deps — root hoist funguje jen
> proto, že Node resolution šplhá do root node_modules. Poctivé umístění =
> deklarace tam, kde se importuje.

## Ověřené nálezy a akce

1. **react-hook-form + @hookform/resolvers**: importované VÝHRADNĚ
   v `libs/forms/src` (Form, FormSelect, FormToggle, zodResolver; žádný přímý
   import v apps/web ani DS) — PŘESUN z root `dependencies` do
   `libs/forms.dependencies` (stejné verze).
2. **autoprefixer** (root devDep): 0 referencí v repu — Tailwind v4 prefixuje
   sám (`@tailwindcss/postcss`) — ODSTRANIT.
3. **@eslint/eslintrc** (root devDep): eslint.config.mjs (flat config) ho
   nereferencuje — ODSTRANIT.
4. **postcss-load-config** unlisted v `apps/web/postcss.config.mjs`: jen JSDoc
   type import transitivní závislosti — nahradit neutrálním komentářem (žádná
   nová dep).

## DoD

- [ ] `pnpm install` projde, lockfile aktualizován
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené (forms testy běží —
      důkaz, že RHF resolve funguje z libs/forms deklarace)
- [ ] knip re-run: čtyři nálezy zmizely, žádné nové unlisted
