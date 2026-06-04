import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SegmentPicker, SegmentPickerTestId } from "./SegmentPicker"

describe("SegmentPicker", () => {
  it("marks the active option as checked and switches", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentPicker
        label="Kontext"
        onValueChange={onValueChange}
        options={[
          { value: "home", label: "home" },
          { value: "work", label: "work" },
        ]}
        value="home"
      />,
    )
    expect(screen.getByTestId(SegmentPickerTestId.Group)).toHaveAccessibleName("Kontext")
    const home = screen.getByTestId(`${SegmentPickerTestId.Option}-home`)
    expect(home).toHaveRole("radio")
    expect(home).toHaveAccessibleName("home")
    expect(home).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByTestId(`${SegmentPickerTestId.Option}-work`))
    expect(onValueChange).toHaveBeenCalledWith("work")
  })
})
