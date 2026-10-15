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
};

export default withNextIntl(nextConfig);
