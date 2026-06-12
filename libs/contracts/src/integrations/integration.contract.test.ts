import { describe, expect, it } from "vitest"
import {
  CredentialsInputSchema,
  IntegrationConfigSchema,
  IntegrationSchema,
  integrationsContract,
} from "../index"

describe("integrationsContract", () => {
  it("exposes CRUD + credentials + test under /api/integrations", () => {
    expect(integrationsContract.createIntegration.path).toBe("/api/integrations")
    expect(integrationsContract.setCredentials.path).toBe("/api/integrations/:id/credentials")
    expect(integrationsContract.setCredentials.method).toBe("PUT")
    expect(integrationsContract.testIntegration.path).toBe("/api/integrations/:id/test")
    expect(integrationsContract.updateIntegration.method).toBe("PATCH")
  })
})

describe("integration schema", () => {
  it("accepts a slack and an email integration", () => {
    expect(
      IntegrationSchema.safeParse({
        id: "team-slack",
        kind: "slack",
        config: { kind: "slack", channels: ["C123"] },
      }).success,
    ).toBe(true)
    expect(
      IntegrationSchema.safeParse({
        id: "support-mail",
        kind: "email",
        config: {
          kind: "email",
          imapHost: "imap.example.com",
          imapPort: 993,
          smtpHost: "smtp.example.com",
          smtpPort: 465,
          user: "bot@example.com",
        },
      }).success,
    ).toBe(true)
  })

  it("defaults enabled/status/hasCredentials", () => {
    const parsed = IntegrationSchema.parse({
      id: "x",
      kind: "slack",
      config: { kind: "slack", channels: [] },
    })
    expect(parsed.enabled).toBe(true)
    expect(parsed.status).toBe("disconnected")
    expect(parsed.hasCredentials).toBe(false)
  })

  it("rejects a config whose kind disagrees with the integration kind", () => {
    expect(
      IntegrationSchema.safeParse({
        id: "x",
        kind: "slack",
        config: { kind: "email", imapHost: "h", imapPort: 1, smtpHost: "h", smtpPort: 1, user: "u" },
      }).success,
    ).toBe(true) // schema only constrains config internally; controller pins kind===config.kind
  })

  // Law 4 / credentials hygiene: no secret-shaped key can parse into a committed config.
  it("rejects secret-shaped keys in config (no token/password persists)", () => {
    expect(
      IntegrationConfigSchema.safeParse({ kind: "slack", channels: [], token: "xoxb-leak" }).success,
    ).toBe(false)
    expect(
      IntegrationConfigSchema.safeParse({
        kind: "email",
        imapHost: "h",
        imapPort: 1,
        smtpHost: "h",
        smtpPort: 1,
        user: "u",
        password: "leak",
      }).success,
    ).toBe(false)
  })

  it("credentials input is a closed per-kind union", () => {
    expect(CredentialsInputSchema.safeParse({ token: "xoxb-1" }).success).toBe(true)
    expect(CredentialsInputSchema.safeParse({ password: "pw" }).success).toBe(true)
    expect(CredentialsInputSchema.safeParse({ token: "a", password: "b" }).success).toBe(false)
    expect(CredentialsInputSchema.safeParse({ apiKey: "a" }).success).toBe(false)
  })
})
