import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FieldTestId } from "../Field"
import { TextAreaField, TextAreaFieldTestId } from "./TextAreaField"

describe("TextAreaField", () => {
  it("renders a labelled textarea with a hint", () => {
    render(<TextAreaField hint="z description v SKILL.md" label="Popis" />)
    expect(screen.getByTestId(TextAreaFieldTestId.Control)).toHaveAccessibleName("Popis")
    expect(screen.getByTestId(FieldTestId.Hint)).toHaveTextContent("z description v SKILL.md")
  })
})
