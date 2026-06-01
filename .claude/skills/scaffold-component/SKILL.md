---
name: scaffold-component
description: >
  Vygeneruj novou komponentu v libs/design-system podle konvencí projektu.
  Použij když uživatel říká "vytvoř komponentu X", "přidej komponentu", "nová DS komponenta".
  Vytvoří komponentu, test, Storybook story a přidá export.
---

# Scaffold Component Skill

Generuje kompletní komponentu pro `libs/design-system` — vždy čtyři soubory + export.

Před generováním si přečti `CLAUDE.md` v rootu a `design-system` skill pro kontext.

---

## Vstupy

Zjisti od uživatele (nebo vyvoď z kontextu):
1. **Název** komponenty (PascalCase, např. `Badge`)
2. **Varianty** — jaké `intent` / `size` / jiné dimenze
3. **HTML element** jako základ (`button`, `div`, `span`, `input`, …)
4. **Props** — co přijímá nad rámec HTML atributů
5. **Interaktivní?** — pokud ano, přidej a11y atributy a focus ring

---

## Kroky generování

### 1. Komponenta — `Button/Button.tsx`

```
libs/design-system/src/components/<Name>/<Name>.tsx
```

Šablona:

```tsx
import { cva, type VariantProps } from "class-variance-authority"

// Povinné: enum testid pro každý důležitý part komponenty (viz design-system SKILL.md → Testid enum)
export enum <Name>TestId {
  Root = "<name>-root",
  // přidej další party podle struktury, např. Icon = "<name>-icon"
}

const <name> = cva(
  // base třídy — vždy přítomné
  "...",
  {
    variants: {
      // definuj varianty specifické pro tuto komponentu
      intent: { primary: "...", secondary: "..." },
      size:   { sm: "...", md: "...", lg: "..." },
    },
    defaultVariants: { intent: "primary", size: "md" },
  }
)

export type <Name>Props = React.ComponentPropsWithoutRef<"<element>"> &
  VariantProps<typeof <name>> & {
    // extra props specifické pro komponentu
  }

export function <Name>({ intent, size, ref, ...props }: <Name>Props & {
  ref?: React.Ref<HTML<Element>Element>
}) {
  return (
    <<element>
      ref={ref}
      data-testid={<Name>TestId.Root}
      className={<name>({ intent, size })}
      {...props}
    />
  )
}
```

Pravidla:
- Žádný `forwardRef` (React 19)
- Žádný `className` prop — DS je sealed
- Žádné `any`
- Každý důležitý part má `data-testid` z `<Name>TestId` enumu (u polymorfních/spread komponent dej `data-testid` **před** `{...props}`)
- Focus ring pro interaktivní prvky: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`

---

### 2. Test — `<Name>.test.tsx`

```
libs/design-system/src/components/<Name>/<Name>.test.tsx
```

Šablona:

Elementy získávej přes `getByTestId` a `<Name>TestId` enum — nikdy `querySelector` /
`container.firstChild` / role/text query jako *selektor*. Role a ARIA zůstávají jako *asserce*
(`toHaveRole`, `toHaveAccessibleName`, `toHaveAttribute`). Viz design-system SKILL.md → Tests.

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { <Name>, <Name>TestId } from "./<Name>"

describe("<Name>", () => {
  it("renders children", () => {
    render(<<Name>>obsah</<Name>>)
    expect(screen.getByTestId(<Name>TestId.Root)).toHaveTextContent("obsah")
  })

  // Pro interaktivní komponenty:
  it("calls onClick when clicked", async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<<Name> onClick={handleClick}>klik</<Name>>)
    await user.click(screen.getByTestId(<Name>TestId.Root))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it("is keyboard accessible", async () => {
    const user = userEvent.setup()
    render(<<Name>>focus</<Name>>)
    await user.tab()
    expect(screen.getByTestId(<Name>TestId.Root)).toHaveFocus()
  })

  // A11y asserce na node získaný přes testid (selektor se mění, asserce zůstává)
  it("exposes the right role", () => {
    render(<<Name>>x</<Name>>)
    expect(screen.getByTestId(<Name>TestId.Root)).toHaveRole("button")
  })
})
```

Vždy testuj:
- Renderuje správný obsah (přes `getByTestId` + `toHaveTextContent`)
- Callback props fungují (`onClick`, `onChange`, …)
- Klávesová dostupnost (Tab, Enter/Space)
- A11y asserce (role, accessible name, `aria-*`) na node získaném přes testid

---

### 3. Story — `<Name>.stories.tsx`

```
libs/design-system/src/components/<Name>/<Name>.stories.tsx
```

Šablona:

```tsx
import type { Meta, StoryObj } from "@storybook/react"
import { <Name> } from "./<Name>"

const meta = {
  title: "Design System/<Name>",
  component: <Name>,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof <Name>>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "<Name>",
  },
}

// Story pro každou intent variantu
export const Danger: Story = {
  args: { intent: "danger", children: "Smazat" },
}

// Story pro všechny size varianty najednou
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <<Name> size="sm">Small</<Name>>
      <<Name> size="md">Medium</<Name>>
      <<Name> size="lg">Large</<Name>>
    </div>
  ),
}
```

---

### 4. Export

Přidej do `libs/design-system/src/index.ts`:

```ts
export { <Name>, type <Name>Props } from "./components/<Name>/<Name>"
```

Vždy exportuj komponentu i její Props typ.

---

## A11y checklist před dokončením

- [ ] Správný HTML element (`button` pro akci, `a` pro navigaci)
- [ ] `aria-label` pokud komponenta nemá viditelný text
- [ ] Focus ring (`focus-visible:ring-*`) na interaktivních prvcích
- [ ] `role` explicitně pokud HTML element neodpovídá sémantice
- [ ] Klávesová obsluha (`Enter`/`Space` triggery)

---

## Výstup po dokončení

Oznám uživateli:
1. Cestu k vytvořeným souborům
2. Jak spustit testy: `nx test design-system`
3. Jak spustit Storybook: `nx storybook design-system`
4. Zda je třeba přidat komponentu do Tailwind safelist (dynamické třídy)
