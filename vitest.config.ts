import { fileURLToPath } from "node:url";

import { config as cargarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

/**
 * Los tests de INTEGRACIÓN necesitan la base real. Next carga `.env.local` por
 * su cuenta, pero Vitest no: sin esto se omitirían siempre por falta de
 * DATABASE_URL, y omitir no es aprobar.
 */
cargarEnv({ path: fileURLToPath(new URL("./.env.local", import.meta.url)), quiet: true });

export default defineConfig({
  resolve: {
    // Vite 8 resuelve los `paths` de tsconfig de forma nativa.
    tsconfigPaths: true,
    alias: {
      /**
       * `server-only` lanza al importarse fuera de un Server Component. Sin este
       * alias, CUALQUIER test que toque un módulo de servidor falla al
       * importarlo, que es justo lo que hay que poder testear.
       */
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Los de integración comparten una base: en paralelo se pisarían.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**"],
      // El esquema es declarativo: lo verifica `scripts/verificar-esquema.ts`
      // contra la base real, que es una prueba mejor que la cobertura.
      exclude: ["src/lib/db/schema/**"],
      thresholds: {
        "src/lib/domain/**": { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
