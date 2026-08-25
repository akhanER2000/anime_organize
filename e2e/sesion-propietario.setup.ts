import { expect, test as preparar } from "@playwright/test";

import { RUTA_SESION_PROPIETARIO } from "./sesion-propietario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ÚNICO LOGIN DEL PROPIETARIO EN TODA LA SUITE — y se hace de verdad.
 *
 * Corre como un proyecto aparte del que depende `chromium`, así que ocurre
 * después de que el servidor esté arriba y antes que cualquier spec. Rellena
 * el formulario real, con la CSP de producción puesta, y guarda las cookies.
 *
 * Por qué un proyecto y no `globalSetup`: `preparar-suite.ts` corre antes de
 * que exista el servidor —le vale, porque solo habla con Postgres—, pero esto
 * necesita una página. Un proyecto con `dependencies` es el punto exacto en el
 * que ya hay servidor y todavía no hay tests.
 *
 * El motivo de que exista está en `sesion-propietario.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EMAIL = process.env.SEED_OWNER_EMAIL ?? "";
const PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "";

preparar("entrar una vez como propietario y guardar la sesión", async ({ page }) => {
  preparar.skip(
    EMAIL === "" || PASSWORD === "",
    "Falta SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD en .env.local: los specs que " +
      "necesitan el vault sembrado se saltan solos.",
  );

  await page.goto("/login");

  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña", { exact: false }).fill(PASSWORD);
  await page.getByRole("button", { name: /entrar al vault/i }).click();

  // La cadena entera enchufada: Server Action → signIn → authorize → Argon2id
  // → JWT → middleware → /app. Si esto falla, ningún spec del vault tiene
  // sentido, y el fallo sale aquí una vez en vez de en cinco sitios.
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

  await page.context().storageState({ path: RUTA_SESION_PROPIETARIO });
});
