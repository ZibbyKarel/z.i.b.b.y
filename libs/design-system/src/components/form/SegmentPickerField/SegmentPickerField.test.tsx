import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SegmentPickerField, SegmentPickerFieldTestId } from "./SegmentPickerField"

describe("SegmentPickerField", () => {
  it("marks the active option as checked and switches", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentPickerField
        label="Kontext"
        onValueChange={onValueChange}
        options={[
          { value: "home", label: "home" },
          { value: "work", label: "work" },
        ]}
        value="home"
      />,
    )
    expect(screen.getByTestId(SegmentPickerFieldTestId.Group)).toHaveAccessibleName("Kontext")
    const home = screen.getByTestId(`${SegmentPickerFieldTestId.Option}-home`)
    expect(home).toHaveRole("radio")
    expect(home).toHaveAccessibleName("home")
    expect(home).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByTestId(`${SegmentPickerFieldTestId.Option}-work`))
    expect(onValueChange).toHaveBeenCalledWith("work")
  })
})
