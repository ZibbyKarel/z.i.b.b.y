import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Field, FieldTestId } from "./Field"

const Sample = ({ hint, error }: { hint?: string; error?: string }) => (
  <Field error={error} hint={hint} label="Název">
    {({ id, describedBy, invalid }) => (
      <input aria-describedby={describedBy} aria-invalid={invalid || undefined} data-testid="control" id={id} />
    )}
  </Field>
)

describe("Field", () => {
  it("associates the label with the control via htmlFor/id", () => {
    render(<Sample />)
    expect(screen.getByTestId("control")).toHaveAccessibleName("Název")
  })

  it("shows a hint and links it via aria-describedby", () => {
    render(<Sample hint="nápověda" />)
    const hint = screen.getByTestId(FieldTestId.Hint)
    expect(hint).toHaveTextContent("nápověda")
    expect(screen.getByTestId("control")).toHaveAttribute("aria-describedby", hint.id)
  })

  it("error replaces hint, marks invalid and alerts", () => {
    render(<Sample error="chyba" hint="nápověda" />)
    expect(screen.queryByTestId(FieldTestId.Hint)).not.toBeInTheDocument()
    const error = screen.getByTestId(FieldTestId.Error)
    expect(error).toHaveRole("alert")
    const control = screen.getByTestId("control")
    expect(control).toHaveAttribute("aria-invalid", "true")
    expect(control).toHaveAttribute("aria-describedby", error.id)
  })
})
