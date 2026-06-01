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

**Prerequisites:** Node.js 20+, npm

```bash
npm install
```

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `npm run dev`        | Start the web app at http://localhost:3000              |
| `npm run storybook`  | Launch design system Storybook at http://localhost:6006 |
| `npm run test`       | Run the test suite once                                 |
| `npm run test:watch` | Run tests in watch mode                                 |
| `npm run typecheck`  | Type-check the whole monorepo                           |
| `npm run build`      | Production build of the web app                         |

### Start developing

```bash
npm install        # install dependencies
npm run dev        # web app → http://localhost:3000
npm run storybook  # design system → http://localhost:6006
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

```bash
pnpm install               # install all monorepo deps (run from root)
```

| Command                              | What it does                                   |
| ------------------------------------ | ---------------------------------------------- |
| `pnpm --filter @zibby/api dev`       | Start API in watch mode at http://localhost:3333 |
| `pnpm --filter @zibby/api serve`     | Start API once (no reload)                     |
| `pnpm --filter @zibby/api test`      | Run API tests                                  |

Override the port with `PORT=<n>`.
