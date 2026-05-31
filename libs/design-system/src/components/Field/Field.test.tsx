import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SegmentedField, SelectField, TextAreaField, TextField } from "./Field"

describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="Název skillu" />)
    expect(screen.getByLabelText("Název skillu")).toBeInTheDocument()
  })

  it("accepts typing", async () => {
    const onChange = vi.fn()
    render(<TextField label="Název" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText("Název"), "rohlik")
    expect(onChange).toHaveBeenCalled()
  })
})

describe("TextAreaField", () => {
  it("renders a labelled textarea with a hint", () => {
    render(<TextAreaField label="Popis" hint="z description v SKILL.md" />)
    expect(screen.getByLabelText("Popis")).toBeInTheDocument()
    expect(screen.getByText("z description v SKILL.md")).toBeInTheDocument()
  })
})

describe("SelectField", () => {
  it("changes value", async () => {
    const onValueChange = vi.fn()
    render(
      <SelectField
        label="Model"
        value="opus"
        onValueChange={onValueChange}
        options={[
          { value: "opus", label: "opus" },
          { value: "sonnet", label: "sonnet" },
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText("Model"), "sonnet")
    expect(onValueChange).toHaveBeenCalledWith("sonnet")
  })
})

describe("SegmentedField", () => {
  it("marks the active option as checked and switches", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedField
        label="Kontext"
        value="home"
        onValueChange={onValueChange}
        options={[
          { value: "home", label: "home" },
          { value: "work", label: "work" },
        ]}
      />,
    )
    expect(screen.getByRole("radio", { name: "home" })).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByRole("radio", { name: "work" }))
    expect(onValueChange).toHaveBeenCalledWith("work")
  })
})
