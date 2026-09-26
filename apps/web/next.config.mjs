import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path is relative to cwd. next-intl's Turbopack integration resolves it against
// process.cwd() (and rejects absolute paths), so `web:dev` runs from apps/web — see
// the script in the root package.json. Webpack (build/start) resolves it against the
// project dir, so those keep running from the repo root unchanged.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@zibby/design-system"],
  // Statically typed links: `<Link href>` / `router.push()` and our route
  // constants (state/config.ts) are checked against the real app routes, so a
  // typo like "/overviw" fails `tsc`. Generated into `.next/types` (already on
  // the tsconfig `include`); run `next typegen` or any dev/build to refresh.
  typedRoutes: true,
  // Emits a minimal, self-contained `.next/standalone` server (traced deps
  // only) alongside the normal build — used to bundle the web app into the
  // Electron desktop package. Doesn't change `next dev`/`next start` for
  // anyone not consuming that output. outputFileTracingRoot points at the
  // pnpm workspace root so tracing correctly follows workspace packages
  // (@zibby/design-system etc.) instead of stopping at apps/web.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // ZB-01 (D-009): the permanent-redirect infrastructure for ROUTE-MAP.md §2's
  // old→new route table. Empty for now — every §2 target (`/org/people`,
  // `/work/companies`, `/knowledge/vault`, …) is a screen phase that hasn't
  // shipped yet (ZB-02..ZB-11), and the rule is to add a redirect only once its
  // target route is real. Each later screen phase adds its own entry here in
  // the same commit that turns its old segment into a redirect.
  async redirects() {
    // ZB-03 (D-009): the first two ROUTE-MAP §2 targets to ship — `/agents`
    // (now the employee directory, D-015) and its detail (now a position in
    // the registry). `/pipelines(/[id])` are page-level redirects instead
    // (server-side department lookup), not static rewrites.
    return [
      // ZB-13: `/chat` → `/org` (ZB-02) — the chat engine is now the shell-global
      // COO dock (ZB-01/ZB-12). No query params to preserve, so this is a plain
      // static rule rather than a page-level redirect (single redirect location).
      { source: "/chat", destination: "/org", permanent: true },
      { source: "/agents", destination: "/org/people", permanent: true },
      {
        source: "/agents/:id",
        destination: "/system/registries/positions/:id",
        permanent: true,
      },
      // ZB-09: the memory feature moved to Knowledge → Vault.
      { source: "/memory", destination: "/knowledge/vault", permanent: true },
      // ZB-06: goals/companies/teams/projects moved under `/work/*` (ROUTE-MAP §2).
      { source: "/companies", destination: "/work/companies", permanent: true },
      { source: "/companies/:path*", destination: "/work/companies/:path*", permanent: true },
      { source: "/teams", destination: "/work/teams", permanent: true },
      { source: "/teams/:path*", destination: "/work/teams/:path*", permanent: true },
      { source: "/projects", destination: "/work/projects", permanent: true },
      { source: "/projects/:path*", destination: "/work/projects/:path*", permanent: true },
      // ZB-08: the signal-kind registry and the ex-settings gates/mandate tabs
      // moved under Policy → Gates (`?section=`).
      {
        source: "/signals",
        destination: "/policy/gates?section=signals",
        permanent: true,
      },
      {
        source: "/signals/new",
        destination: "/policy/gates?section=signals&new=1",
        permanent: true,
      },
      {
        source: "/signals/:id",
        destination: "/policy/gates?section=signals&id=:id",
        permanent: true,
      },
      // ZB-11: `/skills` `/mcp` `/hooks` `/commands` (+`/[id]`) moved under the
      // global registries (ROUTE-MAP §2).
      { source: "/skills", destination: "/system/registries/skills", permanent: true },
      { source: "/skills/:id", destination: "/system/registries/skills/:id", permanent: true },
      { source: "/mcp", destination: "/system/registries/mcp", permanent: true },
      { source: "/mcp/:id", destination: "/system/registries/mcp/:id", permanent: true },
      { source: "/hooks", destination: "/system/registries/hooks", permanent: true },
      { source: "/hooks/:id", destination: "/system/registries/hooks/:id", permanent: true },
      { source: "/commands", destination: "/system/registries/commands", permanent: true },
      { source: "/commands/:id", destination: "/system/registries/commands/:id", permanent: true },
      // ZB-13: every `/settings(?tab=)` case (ROUTE-MAP §3) moved to a
      // page-level redirect (`app/(company)/settings/page.tsx`) instead of a
      // static `has: query` rule here — Next.js's `redirects()` forwards an
      // unconsumed incoming query string onto the destination by default
      // (`/settings?tab=system` landed on `/system/settings/status?tab=system`,
      // not the clean URL), which a page reading `searchParams` itself avoids.
    ];
  },
};

export default withNextIntl(nextConfig);
