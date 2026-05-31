import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Integration } from "../../domain"
import { IntegrationCard } from "./IntegrationCard"

const integration: Integration = {
  id: "holly",
  name: "Holly (NAS)",
  glyph: "server",
  desc: "NAS démon pro média a zálohy",
  ctx: "home",
  status: "connected",
  file: "~/zibby/integrations/holly.json",
}

describe("IntegrationCard", () => {
  it("renders name, description and status", () => {
    render(<IntegrationCard integration={integration} />)
    expect(screen.getByText("Holly (NAS)")).toBeInTheDocument()
    expect(screen.getByText("připojeno")).toBeInTheDocument()
  })

  it("configures and tests", async () => {
    const onConfigure = vi.fn()
    const onTest = vi.fn()
    render(
      <IntegrationCard integration={integration} onConfigure={onConfigure} onTest={onTest} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Konfigurovat/ }))
    await userEvent.click(screen.getByRole("button", { name: /Test/ }))
    expect(onConfigure).toHaveBeenCalledWith(integration)
    expect(onTest).toHaveBeenCalledWith(integration)
  })
})
