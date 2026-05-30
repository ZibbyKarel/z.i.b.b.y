---
name: design-system
description: >
  Navrhuj a vytvárej komponenty pro z.i.b.b.y design system. Použij tento skill
  kdykoli pracuješ s komponentou v libs/design-system — nová komponenta, úprava
  variant, změna tokenů, a11y oprava.
---

# Design System Skill

Tento skill definuje jak navrhovat a implementovat komponenty v `libs/design-system`.
Vždy čti `CLAUDE.md` v rootu projektu pro kontext.

---

## Kde žijí soubory

```
libs/design-system/src/
  theme/
    index.ts          ← Tailwind config objekt (tokeny)
  components/
    Button/
      Button.tsx
      Button.test.tsx
      Button.stories.tsx
  index.ts            ← veřejné exporty
```

Každá komponenta má vlastní složku. Soubory test a story jsou vedle komponenty.

---

## Tokeny — pravidla

Tailwind config v `libs/design-system/src/theme/index.ts` **nahrazuje** (ne rozšiřuje)
výchozí scale. V kódu se používají pouze sémantické tokeny projektu.

Sémantické barvy — příklady pojmenování:
- `background`, `foreground`
- `primary`, `primary-foreground`
- `danger`, `danger-foreground`
- `muted`, `muted-foreground`
- `border`, `ring`

Nikdy nepoužívej Tailwind default třídy (`gray-100`, `blue-500`) — použij token.

---

## CVA varianty

Každá komponenta s vizuálními stavy používá `class-variance-authority`.

```ts
import { cva, type VariantProps } from "class-variance-authority"

const component = cva(
  "base-classes", // vždy přítomné třídy
  {
    variants: {
      intent: { primary: "...", danger: "...", ghost: "..." },
      size:   { sm: "...", md: "...", lg: "..." },
    },
    defaultVariants: { intent: "primary", size: "md" },
    compoundVariants: [
      // pro kombinace variant, které potřebují speciální třídy
    ],
  }
)

// Props typ vždy odvozuj z VariantProps
type ComponentProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof component>
```

Tailwind třídy patří **jen sem** — nikdy nepřijímají třídy zvenčí přes `className` prop
(DS je sealed, nepovolujeme override zvenčí).

---

## Komponenty — vzor implementace

```tsx
// Button.tsx
import { cva, type VariantProps } from "class-variance-authority"

const button = cva("...", { variants: { intent: {...}, size: {...} } })

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof button>

// React 19 — ref jako běžný prop, žádný forwardRef
export function Button({ intent, size, ref, className, ...props }: ButtonProps & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      className={button({ intent, size })}
      {...props}
    />
  )
}
```

---

## Flat props pattern

Složené komponenty (Dialog, Modal, Popover) dostávají vše jako props.
Interně mohou skládat DS primitiva — tato struktura je skrytá konzumentovi.

```tsx
// ✅ správně
export type ConfirmDialogProps = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  open: boolean
}

export function ConfirmDialog({
  title, description, confirmLabel = "Potvrdit", cancelLabel = "Zrušit",
  onConfirm, onCancel, open,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open}>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription>{description}</DialogDescription>}
      <Button intent="ghost" onClick={onCancel}>{cancelLabel}</Button>
      <Button intent="primary" onClick={onConfirm}>{confirmLabel}</Button>
    </Dialog>
  )
}
```

---

## A11y checklist

Před každou komponentou projdi:

- [ ] Interaktivní prvky jsou `<button>` nebo `<a>` (ne `<div onClick>`)
- [ ] `aria-label` na icon buttonech a inputech bez viditelného labelu
- [ ] `aria-disabled` místo HTML `disabled` pokud prvek musí zůstat focusovatelný
- [ ] Focus ring viditelný — třídy `focus-visible:ring-2 focus-visible:ring-ring`
- [ ] Kontrast: primary barvy splňují WCAG AA (4.5:1 text, 3:1 UI prvky)
- [ ] Klávesová obsluha: `Enter`/`Space` pro buttony, `Escape` pro dialogy/popovery

---

## Export

Každá nová komponenta musí být exportována z `libs/design-system/src/index.ts`:

```ts
export { Button, type ButtonProps } from "./components/Button/Button"
```

Vždy exportuj i typ Props — konzumenti v `apps/` ho potřebují pro typování.
