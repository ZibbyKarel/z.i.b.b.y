import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId } from "./Field"
import { TextInput, TextInputTestId } from "./TextInput"

describe("TextInput", () => {
  it("associates the label with the input", () => {
    render(<TextInput label="Název skillu" />)
    expect(screen.getByTestId(TextInputTestId.Control)).toHaveAccessibleName("Název skillu")
  })

  it("accepts typing", async () => {
    const onChange = vi.fn()
    render(<TextInput label="Název" onChange={onChange} />)
    await userEvent.type(screen.getByTestId(TextInputTestId.Control), "rohlik")
    expect(onChange).toHaveBeenCalled()
  })

  it("renders an error and marks the input invalid", () => {
    render(<TextInput error="Povinné pole" label="Název" />)
    expect(screen.getByTestId(FieldTestId.Error)).toHaveTextContent("Povinné pole")
    expect(screen.getByTestId(TextInputTestId.Control)).toHaveAttribute("aria-invalid", "true")
  })
})
