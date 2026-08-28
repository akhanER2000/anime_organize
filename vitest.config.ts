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
  /**
   * ── EL JSX HAY QUE TRANSFORMARLO AQUÍ, PORQUE `tsconfig` NO LO HACE ──────
   *
   * `tsconfig.json` lleva `"jsx": "preserve"` porque **lo exige Next**: el JSX
   * llega intacto a su propio compilador. Vitest no pasa por ahí, así que un
   * `.tsx` con JSX de verdad le llega como sintaxis inválida y el fichero entero
   * falla al importarse —ni un test ejecutado, que es peor que un test en rojo—.
   *
   * `automatic` es el runtime moderno: no hace falta `import React` en cada
   * fichero de test. Y esto NO añade ninguna dependencia: Vite 8 transforma con
   * **oxc**, que ya viene dentro —por eso la clave es `oxc` y no `esbuild`, que
   * es la que se encuentra en casi toda la documentación y aquí no hace nada—.
   */
  oxc: { jsx: { runtime: "automatic" } },
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
    // `scripts/` entra a propósito: son código que ESCRIBE en la base —seed,
    // migrate, verificar-esquema— y estaban sin un solo test. La guarda de
    // «dos ramas a la vez» vive ahí, y dejarla fuera de la suite sería fijar
    // por sexta vez un mecanismo que nadie ejecuta.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
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
