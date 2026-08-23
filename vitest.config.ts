import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vite 8 resuelve los `paths` de tsconfig de forma nativa: el alias @/ funciona
    // sin el plugin vite-tsconfig-paths.
    tsconfigPaths: true,
    alias: {
      /**
       * `server-only` lanza al importarse fuera de un Server Component. Su propio
       * `exports` ya trae un `empty.js` para la condición `react-server`, pero el
       * resolvedor SSR de Vitest no la aplica, así que se apunta directamente al
       * fichero vacío. Sin esto, CUALQUIER test que toque un módulo de servidor
       * falla al importarlo, que es justo lo que hay que poder testear.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**"],
      // El esquema es declarativo: no hay ramas que cubrir, lo verifica el SQL generado.
      exclude: ["src/lib/db/schema/**"],
      thresholds: {
        "src/lib/domain/**": { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
