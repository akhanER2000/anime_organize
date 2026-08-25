import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright para el flujo crítico (`.claude/rules/testing.md`).
 *
 * Los specs llegan en la FASE 6; la configuración existe ya para que
 * `npm run test:e2e` no sea un script declarado que apunta al vacío, y para
 * fijar aquí las decisiones que la regla da por cerradas.
 */
export default defineConfig({
  /**
   * Se ejecuta una vez, antes de todo: vacía los cubos del limitador de login.
   *
   * La suite hace varios logins —uno por spec— y el límite es 5 cada 15
   * minutos, así que dos pasadas seguidas se autobloqueaban y el 429 se leía
   * como un fallo de pantalla. Ver el porqué completo en el fichero.
   */
  globalSetup: "./e2e/preparar-suite.ts",

  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI !== undefined ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    // Sin capturas por defecto: el diseño se verifica con `ui-fidelity-checker`
    // contra design/screens/, no con un diff de píxeles frágil.
    screenshot: "only-on-failure",
  },

  /**
   * DOS PROYECTOS, Y EL PRIMERO NO PRUEBA NADA.
   *
   * `sesion` entra UNA vez como propietario por el formulario de verdad y
   * guarda las cookies; `chromium` depende de él, así que corre después. El
   * motivo —la suite se comía el límite de 5 intentos/15 min de `login:email`
   * y dos specs fallaban por eso— está escrito en `e2e/sesion-propietario.ts`.
   *
   * `testIgnore` en `chromium` evita que el fichero de preparación se ejecute
   * otra vez como si fuera un spec normal.
   */
  projects: [
    { name: "sesion", testMatch: /sesion-propietario\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["sesion"],
      testIgnore: /sesion-propietario\.setup\.ts/,
    },
  ],

  /**
   * Contra el BUILD DE PRODUCCIÓN, nunca contra `dev`: `dev` tiene otros tiempos
   * y otros límites, y esconde fallos que solo aparecen al construir.
   */
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 180_000,
  },
});
