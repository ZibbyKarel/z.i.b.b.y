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
  api/             ← Node backend
```
