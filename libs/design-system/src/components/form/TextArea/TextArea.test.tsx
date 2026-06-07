import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FieldTestId } from "./Field"
import { TextArea, TextAreaTestId } from "./TextArea"

describe("TextArea", () => {
  it("renders a labelled textarea with a hint", () => {
    render(<TextArea hint="z description v SKILL.md" label="Popis" />)
    expect(screen.getByTestId(TextAreaTestId.Control)).toHaveAccessibleName("Popis")
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("z description v SKILL.md")
  })
})
