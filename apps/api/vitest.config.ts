import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"

// NestJS relies on `emitDecoratorMetadata` for dependency injection, which
// esbuild (Vitest's default transformer) does not emit. The SWC plugin emits it.
export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2021",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
})
