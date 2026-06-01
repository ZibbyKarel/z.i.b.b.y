import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FieldTestId, SegmentedField, SelectField, TextAreaField, TextField } from "./Field"

describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="Název skillu" />)
    expect(screen.getByTestId(FieldTestId.Control)).toHaveAccessibleName("Název skillu")
  })

  it("accepts typing", async () => {
    const onChange = vi.fn()
    render(<TextField label="Název" onChange={onChange} />)
    await userEvent.type(screen.getByTestId(FieldTestId.Control), "rohlik")
    expect(onChange).toHaveBeenCalled()
  })
})

describe("TextAreaField", () => {
  it("renders a labelled textarea with a hint", () => {
    render(<TextAreaField hint="z description v SKILL.md" label="Popis" />)
    expect(screen.getByTestId(FieldTestId.Control)).toHaveAccessibleName("Popis")
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("z description v SKILL.md")
  })
})

describe("SelectField", () => {
  it("changes value", async () => {
    const onValueChange = vi.fn()
    render(
      <SelectField
        label="Model"
        onValueChange={onValueChange}
        options={[
          { value: "opus", label: "opus" },
          { value: "sonnet", label: "sonnet" },
        ]}
        value="opus"
      />,
    )
    await userEvent.selectOptions(screen.getByTestId(FieldTestId.Control), "sonnet")
    expect(onValueChange).toHaveBeenCalledWith("sonnet")
  })
})

describe("SegmentedField", () => {
  it("marks the active option as checked and switches", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedField
        label="Kontext"
        onValueChange={onValueChange}
        options={[
          { value: "home", label: "home" },
          { value: "work", label: "work" },
        ]}
        value="home"
      />,
    )
    const home = screen.getByTestId(`${FieldTestId.Option}-home`)
    expect(home).toHaveRole("radio")
    expect(home).toHaveAccessibleName("home")
    expect(home).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByTestId(`${FieldTestId.Option}-work`))
    expect(onValueChange).toHaveBeenCalledWith("work")
  })
})
