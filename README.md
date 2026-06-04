```
███████╗ ██╗ ██████╗ ██████╗   ██╗ ██╗
╚══███╔╝ ██║ ██╔══██╗ ██╔══██╗╚██╗ ██╔╝
  ███╔╝  ██║ ██████╔╝ ██████╔╝ ╚████╔╝
 ███╔╝   ██║ ██╔══██╗ ██╔══██╗  ╚██╔╝
███████╗ ██║ ██████╔╝ ██████╔╝   ██║
╚══════╝ ╚═╝ ╚═════╝ ╚═════╝     ╚═╝

Zestful · Intuitive · Brainy · Butler · for You
─────────────────────────────────────────────────
🎩 ZIBBY at your service.
```

NX monorepo — Next.js 15 App Router · React 19 · TanStack Query · Tailwind CSS · TypeScript

---

## Quick start

**Prerequisites:** Node.js 20+, [pnpm](https://pnpm.io) 9+ (`corepack enable` or `npm i -g pnpm`)

> **pnpm is the canonical package manager** for this monorepo (it uses the
> `workspace:` protocol and `pnpm-lock.yaml`). Use `pnpm`, not `npm`.

```bash
pnpm install
```

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `pnpm web:dev`         | Start the web app at http://localhost:3000              |
| `pnpm web:build`       | Production build of the web app                         |
| `pnpm web:start`       | Serve the production web build                          |
| `pnpm web:test`        | Run web tests once                                      |
| `pnpm api:dev`         | Start API in watch mode at http://localhost:3333        |
| `pnpm api:start`       | Serve the API once (no reload)                          |
| `pnpm api:test`        | Run API tests once                                      |
| `pnpm test`            | Run all tests once                                      |
| `pnpm test:watch`      | Run all tests in watch mode                             |
| `pnpm storybook`       | Launch design system Storybook at http://localhost:6006 |
| `pnpm lint`            | ESLint auto-fix across the monorepo                     |
| `pnpm typecheck`       | Type-check the whole monorepo                           |

### Start developing

```bash
pnpm install          # install dependencies
pnpm web:dev          # web app → http://localhost:3000
pnpm api:dev          # API → http://localhost:3333
pnpm storybook        # design system → http://localhost:6006
```

---

## Structure

```
libs/
  design-system/   ← components, tokens, CVA variants — all Tailwind lives here
apps/
  web/             ← Next.js App Router; imports from DS, never creates its own classes
  api/             ← NestJS backend (ts-rest contract-first, agents stored as Markdown)
```

---

## API (`apps/api`)

NestJS backend running on port **3333** by default. OpenAPI docs served at `/docs`.

Override the port with `PORT=<n>`.
