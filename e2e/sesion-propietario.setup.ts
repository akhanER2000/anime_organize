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
  // ── SIN CREDENCIALES, ESTO **FALLA**. NO SE SALTA. ─────────────────────
  //
  // Antes se saltaba, y el salto era invisible: los specs seguían adelante con
  // unas cookies viejas del fichero de sesión y fallaban SIETE veces con «la
  // sesión reutilizada del propietario no vale», que manda a mirar la
  // autenticación cuando el problema era una variable que nunca llegó.
  //
  // `testing.md`: omitir un test NO es aprobarlo, y un salto silencioso en el
  // arnés es peor que un rojo, porque el rojo al menos señala.
  if (EMAIL === "" || PASSWORD === "") {
    throw new Error(
      "Faltan SEED_OWNER_EMAIL y/o SEED_OWNER_PASSWORD. " +
        "Los carga `playwright.config.ts` desde `.env.local`. Si estás en CI, " +
        "tienen que estar en los secretos del workflow. " +
        "Sin ellos NINGÚN spec del vault puede entrar, y el fallo aparecería " +
        "más adelante disfrazado de «la sesión no vale».",
    );
  }

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
