import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright para el flujo crítico (`.claude/rules/testing.md`).
 *
 * Los specs llegan en la FASE 6; la configuración existe ya para que
 * `npm run test:e2e` no sea un script declarado que apunta al vacío, y para
 * fijar aquí las decisiones que la regla da por cerradas.
 */
export default defineConfig({
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

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

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
