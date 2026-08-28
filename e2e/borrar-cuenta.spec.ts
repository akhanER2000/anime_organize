import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { liberarLimiteDeRegistro, liberarLimiteDeLogin } from "./ayuda-recuperacion";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — BORRAR LA CUENTA (artboard 12).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── LO QUE EL ENCARGO PIDE, Y ES LO QUE SE COMPRUEBA ─────────────────────
 *
 * «Test de que el token queda inválido después». Es la parte que se olvida: el
 * borrado devuelve `ok`, la fila desaparece, y **la cookie sigue en el
 * navegador**. Si la sesión no se invalidara, la siguiente navegación pasaría
 * el middleware —que corre en Edge y no consulta Postgres— y moriría dentro,
 * con un error en vez de con la pantalla de entrada.
 *
 * ── LAS TRES BARRERAS SE PRUEBAN UNA A UNA ──────────────────────────────
 *
 * El export, el email exacto y la contraseña. Cada una prueba otra cosa, y la
 * del email es la que parece redundante y no lo es: es la que impide que un
 * clic en el sitio equivocado, con la sesión abierta, borre 83 series.
 *
 * ── LA CUENTA ES DESECHABLE, Y ESO NO ES UNA COMODIDAD ──────────────────
 *
 * Este spec **borra de verdad**. Se hace sobre una cuenta creada en el propio
 * test, con dominio `@ejemplo.test`. Usar la del propietario destruiría los 83
 * animes del dueño, que es exactamente lo que este proyecto no puede hacer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

async function registrarYEntrar(page: Page, email: string, password: string) {
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /crear mi vault/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /cuenta creada/i })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /entrar al vault/i }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

async function abrirPeligro(page: Page) {
  await page.goto("/app/ajustes");
  await page.getByRole("tab", { name: "Peligro" }).click();
  await expect(page.getByRole("heading", { name: /borrar la cuenta/i })).toBeVisible();
}

const cuenta = () => ({
  email: `borrar-${randomUUID().slice(0, 8)}@ejemplo.test`,
  password: `Borrable-${randomUUID().slice(0, 8)}-larga`,
});

test.describe("borrar la cuenta", () => {
  test.beforeEach(async () => {
    // `registro:ip` son 5 por hora y todos los specs comparten cubo. Ver
    // `ayuda-recuperacion.ts`: una suite que prueba PANTALLAS no debe estar
    // probando el limitador de paso.
    await liberarLimiteDeRegistro();
    await liberarLimiteDeLogin();
    await liberarLimiteDeLogin();
  });

  test("EL BOTÓN NO SE HABILITA HASTA DESCARGAR EL EXPORT", async ({ page }) => {
    // `security.md` §3 pide el export ANTES de borrar. Se cumple exigiendo que
    // el usuario lo descargue: descargarlo solo dejaría el fichero en la
    // carpeta sin que nadie sepa que está.
    const { email, password } = cuenta();
    await registrarYEntrar(page, email, password);
    await abrirPeligro(page);

    const borrar = page.getByRole("button", { name: /borrar mi cuenta para siempre/i });
    await expect(borrar).toBeDisabled();

    // Y se dice POR QUÉ está deshabilitado. Un botón apagado sin motivo deja a
    // quien mira probando cosas.
    await expect(page.getByText(/descarga tu vault primero/i)).toBeVisible();
  });

  test("EL EXPORT SE DESCARGA Y LLEVA LO IRRECUPERABLE", async ({ page }) => {
    const { email, password } = cuenta();
    await registrarYEntrar(page, email, password);

    // Un anime con notas: es lo que el export existe para conservar.
    await page.getByRole("button", { name: "Añadir anime" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Título").fill("Serie con notas");
    await modal.getByLabel("Notas").fill("esto no se recupera de ninguna otra parte");
    await modal.getByRole("button", { name: "Añadir al vault" }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    await abrirPeligro(page);

    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /descargar mi vault/i }).click(),
    ]);

    // El nombre lleva la fecha para que no se sobrescriba en la carpeta.
    expect(descarga.suggestedFilename()).toMatch(/^anime-vault-\d{4}-\d{2}-\d{2}\.json$/);

    const ruta = await descarga.path();
    const { readFileSync } = await import("node:fs");
    const contenido = JSON.parse(readFileSync(ruta, "utf-8")) as {
      version: number;
      cuenta: { email: string };
      animes: { titulo: string; notas: string | null }[];
    };

    expect(contenido.version).toBe(1);
    expect(contenido.cuenta.email).toBe(email);
    expect(contenido.animes[0]?.titulo).toBe("Serie con notas");
    expect(contenido.animes[0]?.notas).toBe("esto no se recupera de ninguna otra parte");

    // Y la barrera del export queda levantada: el aviso desaparece. El botón
    // sigue deshabilitado porque faltan las OTRAS DOS pruebas —el correo y la
    // contraseña—, y afirmar que ya está habilitado aquí habría medido la
    // barrera equivocada.
    await expect(page.getByText(/descarga tu vault primero/i)).toHaveCount(0);

    await page.getByLabel(/escribe .* para confirmar/i).fill(email);
    await page.getByLabel("Tu contraseña").fill(password);
    await expect(
      page.getByRole("button", { name: /borrar mi cuenta para siempre/i }),
    ).toBeEnabled();
  });

  test("EL CORREO MAL ESCRITO NO BORRA NADA", async ({ page }) => {
    const { email, password } = cuenta();
    await registrarYEntrar(page, email, password);
    await abrirPeligro(page);

    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /descargar mi vault/i }).click(),
    ]);

    await page.getByLabel(/escribe .* para confirmar/i).fill("otro@ejemplo.test");
    await page.getByLabel("Tu contraseña").fill(password);
    await page.getByRole("button", { name: /borrar mi cuenta para siempre/i }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /exactamente como aparece/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Y la cuenta sigue: la sesión vale y el vault se abre.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("LA CONTRASEÑA MAL NO BORRA NADA", async ({ page }) => {
    const { email, password } = cuenta();
    await registrarYEntrar(page, email, password);
    await abrirPeligro(page);

    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /descargar mi vault/i }).click(),
    ]);

    await page.getByLabel(/escribe .* para confirmar/i).fill(email);
    await page.getByLabel("Tu contraseña").fill("esta-no-es-la-suya-pero-es-larga");
    await page.getByRole("button", { name: /borrar mi cuenta para siempre/i }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /contraseña no es correcta/i }),
    ).toBeVisible({ timeout: 30_000 });

    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("BORRA DE VERDAD, Y EL TOKEN QUEDA INVÁLIDO", async ({ page, browser }) => {
    // Tres autenticaciones y un borrado en cascada: el trabajo caro se hace de
    // verdad, así que los 30 s por defecto se quedan cortos.
    test.setTimeout(120_000);

    const { email, password } = cuenta();
    await registrarYEntrar(page, email, password);
    await abrirPeligro(page);

    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /descargar mi vault/i }).click(),
    ]);

    await page.getByLabel(/escribe .* para confirmar/i).fill(email);
    await page.getByLabel("Tu contraseña").fill(password);
    await page.getByRole("button", { name: /borrar mi cuenta para siempre/i }).click();

    // Acaba en la landing: quedarse en `/app` daría un error, no una pantalla.
    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });

    // ── LO QUE EL ENCARGO PIDE ────────────────────────────────────────────
    //
    // La cookie sigue en el navegador. Si la sesión no se hubiera invalidado, el
    // middleware —que corre en Edge y NO consulta Postgres— la dejaría pasar, y
    // la página moriría dentro con un error.
    await page.goto("/app");
    await expect(page, "el token sigue valiendo tras borrar la cuenta").toHaveURL(/\/login/, {
      timeout: 30_000,
    });

    // Y no se puede volver a entrar: la cuenta no existe.
    const limpio = await browser.newContext();
    const otra = await limpio.newPage();
    await otra.goto("/login");
    await otra.getByLabel("Correo").fill(email);
    await otra.getByLabel("Contraseña", { exact: false }).fill(password);
    await otra.getByRole("button", { name: /entrar al vault/i }).click();

    await expect(otra, "se entra en una cuenta borrada").toHaveURL(/\/login/);
    await expect(otra.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await limpio.close();
  });
});
