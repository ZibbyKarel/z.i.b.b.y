import type { CredentialsInput, IntegrationKind } from "@zibby/contracts"

/**
 * Whether a credential payload matches the kind an integration needs. Email
 * authenticates with a `password`; Slack/Jira/GitHub all carry a `token` — this
 * mirrors exactly what each channel adapter reads (`passwordOf` for email,
 * `tokenOf` for the rest), so a credential written through the API is the one the
 * adapter can actually use. A pure function so the rule has a single home and a
 * test, instead of living only inside the controller handler.
 */
export function credentialMatchesKind(kind: IntegrationKind, creds: CredentialsInput): boolean {
  return kind === "email" ? "password" in creds : "token" in creds
}
