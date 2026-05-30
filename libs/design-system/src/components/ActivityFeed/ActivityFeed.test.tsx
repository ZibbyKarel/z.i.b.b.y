import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ActivityEvent } from "../../domain"
import { ActivityFeed } from "./ActivityFeed"

const items: ActivityEvent[] = [
  { id: "e1", t: "teď", icon: "run", ctx: "home", text: "tmdb-renamer běží", sub: "18 / 25" },
  { id: "e2", t: "2m", icon: "wait", ctx: "home", text: "rohlik čeká", sub: "košík" },
  { id: "e3", t: "14m", icon: "ok", ctx: "work", text: "ci-doctor hotov", sub: "auth-svc" },
]

describe("ActivityFeed", () => {
  it("renders events", () => {
    render(<ActivityFeed items={items} />)
    expect(screen.getByText("tmdb-renamer běží")).toBeInTheDocument()
    expect(screen.getByText("ci-doctor hotov")).toBeInTheDocument()
  })

  it("respects the limit", () => {
    render(<ActivityFeed items={items} limit={2} />)
    expect(screen.queryByText("ci-doctor hotov")).not.toBeInTheDocument()
  })
})
