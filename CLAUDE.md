# z.i.b.b.y — konvence projektu

Design systém + Next.js aplikace. Stack: Next.js 15 App Router, React 19, TanStack Query,
Tailwind CSS, TypeScript, NX monorepo.

---

## NX struktura

```
libs/
  design-system/     ← komponenty, tokeny, CVA varianty — veškerý Tailwind žije tady
apps/
  web/               ← Next.js App Router; importuje z DS, nikdy nevytváří vlastní třídy
  api/               ← Node backend
```

**Proč takto:** Tailwind třídy na jednom místě = konzistentní vizuál, snadný refactoring
tokenů. Aplikace nemá přístup k "raw" třídám — vždy používá DS abstrakci.

---

## Design tokeny

Definovány v `libs/design-system/src/theme/` jako Tailwind config objekt, který **kompletně
nahrazuje** výchozí Tailwind scale (bez `extend`). Žádné `gray-100` nebo `blue-500` v kódu
— jen tokeny projektu.

Struktura:
- `colors` — sémantické názvy (`background`, `foreground`, `primary`, `danger`, …)
- `spacing` — vlastní scale (pokud se liší od Tailwind defaults)
- `fontFamily`, `fontSize`, `fontWeight`
- `borderRadius`
- `boxShadow`

**Light/dark:** nativní Tailwind `dark:` class na `<html>`. Žádné CSS custom properties
ani `data-theme` — stačí `className="dark"` na rootu.

**Proč nahradit místo extend:** extend nechává v kontextu stovky výchozích hodnot Tailwindu,
které nikdo nepotřebuje a do kódu se mohou dostat "omylem". Čistá paleta = čistý design.

---

## Komponenty

### Varianty — CVA

Varianty (`size`, `intent`, `disabled` stav atd.) definovány přes `class-variance-authority`.
Props jsou jediná vstupní brána do DS; konzument Tailwind třídy nezná.

```ts
// libs/design-system/src/components/Button/Button.tsx
const button = cva("rounded font-medium transition-colors", {
  variants: {
    intent: {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      danger:  "bg-danger text-danger-foreground hover:bg-danger/90",
    },
    size: { sm: "px-3 py-1 text-sm", md: "px-4 py-2", lg: "px-6 py-3 text-lg" },
  },
  defaultVariants: { intent: "primary", size: "md" },
})
```

### Pattern — flat props, žádný compound

Složené komponenty (Dialog, Modal, Toast) dostávají data a callbacky jako props.
Interně používají DS komponenty, ale tato struktura je skrytá konzumentovi.

```tsx
// ✅
<Dialog
  title="Smazat záznam"
  description="Tato akce je nevratná."
  onConfirm={handleDelete}
  onCancel={() => setOpen(false)}
/>

// ❌ — compound pattern nepoužíváme
<Dialog>
  <Dialog.Trigger>...</Dialog.Trigger>
</Dialog>
```

**Proč flat props:** Pro 90 % use-cases je flat API rychlejší na použití a méně náchylné
k chybám. Compound pattern přidáme jen pokud layout komponenty musí být plně flexibilní
(zatím nepotřebujeme).

### React 19 — žádný forwardRef

React 19 předává `ref` jako běžný prop. `forwardRef` wrapper nepíšeme.

```tsx
// ✅ React 19
function Button({ ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) { ... }

// ❌ zastaralé
const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => { ... })
```

### asChild / polymorfismus

Nepoužíváme. Pokud konzument potřebuje jiný element, obalí DS komponentu nebo použije
`as` prop pokud je explicitně definován.

---

## TanStack Query

Hooky a query keys žijí per-doména v `apps/web/features/<doména>/queries.ts`.
Nejsou v `libs/` — sdílení across apps zatím nepotřebujeme.

```ts
// apps/web/features/users/queries.ts
import { useQuery } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"

export const usersQueryKey = (): QueryKey => ["users"]
export const userDetailQueryKey = (id: string): QueryKey => ["users", id]

export function useUsersQuery() {
  return useQuery({ queryKey: usersQueryKey(), queryFn: fetchUsers })
}

export function useUserDetailQuery(id: string) {
  return useQuery({ queryKey: userDetailQueryKey(id), queryFn: () => fetchUser(id) })
}
```

**Proč exportovat key factory zvlášť:** Mutations a invalidace potřebují key bez spouštění
hooku. `queryClient.invalidateQueries({ queryKey: usersQueryKey() })` — čisté a typované.

---

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess` v `tsconfig.json`
- Žádné `any` — použij `unknown` a zúžit typ, nebo `satisfies`, nebo generiku
- Typy exportovat vedle implementace, ne v separátním `types.ts` (pokud nejsou sdílené)
- Props interface pojmenovat `<Component>Props` a vždy exportovat

---

## Testy

Vitest + `@testing-library/react`. Testovací soubor leží **vedle** source souboru:

```
Button.tsx
Button.test.tsx
Button.stories.tsx
```

**Proč vedle:** Přesun nebo smazání komponenty automaticky zahrne test — žádné osiřelé
soubory v `__tests__/`.

Storybook zatím jen pro `libs/design-system`. Každá DS komponenta má story.

---

## A11y baseline

- **Kontrast:** WCAG AA — min. 4.5:1 pro běžný text, 3:1 pro velký text a UI komponenty
- **Focus ring:** vždy viditelný na interaktivních prvcích; nikdy `outline: none` bez náhrady
- **aria-label:** povinný kdekoli chybí viditelný textový label (icon button, input bez labelu)

---

## Co nikdy nedělat

- Psát Tailwind třídy mimo `libs/design-system`
- Používat `any` v TypeScriptu
- Psát `forwardRef` (jsme na React 19)
- Commitovat `.claude/settings.local.json` (je v `.gitignore`)
- Přidávat query hooky do `libs/` bez jasného důvodu ke sdílení
