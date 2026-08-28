import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — ESTADOS DEL SISTEMA (artboard 11, lote D3).
 *
 * ── EL 404 GLOBAL, QUE ES EL QUE FALTABA ────────────────────────────────
 *
 * Sólo existía el de la ficha. Cualquier otra dirección inventada caía en la
 * página por defecto de Next: **fondo blanco, tipografía del sistema y texto en
 * inglés**. Es el mismo fallo de clase que la CSP que dejó la app en blanco —
 * el servidor responde correctamente y lo que ve la persona no es la
 * aplicación—, y sólo se ve abriéndolo.
 *
 * ── Y SIGUE SIENDO UN 404 DE VERDAD ─────────────────────────────────────
 *
 * `security.md` §1 depende de que el estado sea 404 y no 200: es lo que impide
 * distinguir «no existe» de «no es tuyo» sin leer el cuerpo. Un `loading.tsx`
 * mal puesto ya convirtió un 404 en 200 una vez en este proyecto, así que el
 * estado se comprueba, no se supone.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test.describe("estados del sistema", () => {
  test("una dirección que no existe responde 404 Y SE VE COMO LA APP", async ({ page }) => {
    const respuesta = await page.goto("/esta-ruta-no-existe-jamas");

    expect(respuesta?.status()).toBe(404);

    // En español y con el texto del artboard, no el de Next.
    await expect(page.getByRole("heading", { name: "Esta losa no existe" })).toBeVisible();
    await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  });

  test("el 404 global tiene salida, y la salida no exige sesión", async ({ page }) => {
    await page.goto("/tampoco-existe");

    // A `/`, no a `/app`: sin sesión, `/app` rebota al login y eso convierte
    // «te equivocaste de dirección» en «inicia sesión».
    const salida = page.getByRole("link", { name: "Volver al principio" });
    await expect(salida).toBeVisible();

    await salida.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("una ficha inexistente sigue con SU texto, que no revela nada", async ({ page }) => {
    await entrarComoPropietario(page);
    const respuesta = await page.goto("/app/anime/00000000-0000-4000-8000-000000000000");

    expect(respuesta?.status()).toBe(404);
    // El texto de la ficha NO dice «no existe» ni «no es tuyo»: los dos casos
    // llegan aquí a propósito (`security.md` §1).
    await expect(page.getByRole("heading", { name: "Aquí no hay nada" })).toBeVisible();
  });

  test("los dos 404 comparten aspecto: la veta rota y el número", async ({ page }) => {
    await page.goto("/no-existe");
    await expect(page.getByText("404", { exact: true })).toBeVisible();

    await entrarComoPropietario(page);
    await page.goto("/app/anime/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
});
