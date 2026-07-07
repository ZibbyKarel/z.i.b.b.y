# Phase 32 — Allow avatar/logo image uploads up to 2 MB

> TODO (line 35): uploading a 184 KB image as a pipeline avatar → `PATCH
> /api/pipelines/delivery 500 PayloadTooLargeError: request entity too large`.
> _"Je to velmi malý obrázek. Obrázky do 2Mb by měly být možné nahrávat v pořádku."_

## Root cause

Two stacked caps, both too small:
1. **Body parser**: `apps/api/src/main.ts` never sets a JSON body limit, so Express
   body-parser uses its default **100 kb**. A 184 KB image as a base64 data-URI in the
   JSON PATCH body (~245 KB of chars) exceeds it → `PayloadTooLargeError` (a 500 thrown
   before the request ever reaches the handler/validation).
2. **Schema cap**: even past the body limit, the avatar/logo data-URI is capped at
   `AVATAR_MAX = 280_000` chars (`libs/contracts/src/common.schema.ts:65`, ~200 KB
   image) — shared by `AvatarSchema` (pipelines, agents) — and the project logo has its
   own `.max(280_000)` (`libs/contracts/src/projects/project.schema.ts:150`). A 2 MB
   image is ~2.8 M base64 chars, far over that.

## Fix (support images up to 2 MB)

A 2 MB (2,097,152 B) image → base64 ≈ 2,796,204 chars (+ the `data:image/…;base64,`
prefix). Cap at **2,900,000** chars for headroom; body limit well above the resulting
JSON payload.

1. **`apps/api/src/main.ts`** — after `NestFactory.create`, raise the body-parser limit:
   type the app as `NestExpressApplication` and call
   `app.useBodyParser("json", { limit: "5mb" })` and
   `app.useBodyParser("urlencoded", { limit: "5mb", extended: true })` (Nest 11 supports
   `useBodyParser`). 5 MB comfortably fits a ~2.8 MB base64 image plus JSON overhead while
   staying a sane DoS backstop.
2. **`libs/contracts/src/common.schema.ts`** — bump `AVATAR_MAX` from `280_000` to
   `2_900_000` and update its doc comment (~200 KB → ~2 MB). This lifts pipeline + agent
   avatars together.
3. **`libs/contracts/src/projects/project.schema.ts:150`** — raise the project `logo`
   `.max(280_000)` to the same `AVATAR_MAX` (import the constant so the two can't drift),
   and update the doc comment.

The existing `avatar.schema.test.ts` computes its "too long" string from `AVATAR_MAX`, so
raising the constant keeps that test valid (still exercises the boundary).

## Verification
- `pnpm typecheck` clean; scoped lint on the 3 files.
- `pnpm api:test` green (avatar boundary tests still pass with the new max; add/adjust a
  case asserting a ~2 MB data-URI is accepted and an over-cap one is rejected).
- Manual/behavioral: `PATCH /api/pipelines/:id` with a ~184 KB (and up to ~2 MB) avatar
  data-URI returns 200, not 500.

## Out of scope
- Any client-side image downscaling (server now accepts up to 2 MB directly).
