import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageContainer } from "./PageContainer"

describe("PageContainer", () => {
  it("renders children", () => {
    render(<PageContainer>obsah</PageContainer>)
    expect(screen.getByText("obsah")).toBeInTheDocument()
  })

  it("applies the default reading-column max width", () => {
    render(<PageContainer>x</PageContainer>)
    expect(screen.getByText("x")).toHaveStyle({ maxWidth: "1400px" })
  })

  it("stretches to full width when stretch is set", () => {
    render(<PageContainer stretch>y</PageContainer>)
    expect(screen.getByText("y")).toHaveStyle({ width: "100%" })
  })
})
