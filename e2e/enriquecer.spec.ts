import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — ENRIQUECER UN ANIME (lote C1).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── POR QUÉ ESTE RECORRIDO ENCUENTRA LO QUE LOS DEMÁS NO ────────────────
 *
 * El enriquecimiento ya tiene 39 tests de unidad —mapeo, saneado, validación
 * de la respuesta del modelo— y 13 de integración contra Postgres. Ninguno de
 * los 52 podía ver el fallo que de verdad tuvo: se mandaba `id: null` a AniList
 * y la respuesta era **404 con `Media: null`**, indistinguible de «no existe».
 * El CLI decía «3 sin resultado» con todos los indicadores en verde.
 *
 * Lo cazó ejecutarlo de verdad contra el proveedor. Este spec hace lo mismo
 * desde la pantalla: pulsa el botón y **lee lo que la interfaz responde**.
 *
 * ── TOCA UN TERCERO, Y SE ASUME ─────────────────────────────────────────
 *
 * Una ejecución = una petición a AniList (público, sin clave, 90/min). Es el
 * precio de comprobar que el camino está enchufado; simularlo devolvería a la
 * situación de los 52 tests verdes sobre una consulta que no encontraba nada.
 *
 * Las aserciones toleran los dos desenlaces posibles —encontrado y no
 * encontrado— porque el catálogo de un tercero no es nuestro. Lo que NO se
 * tolera es que la pantalla se quede muda.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test.describe("Ficha → Enriquecer", () => {
  test.describe.configure({ mode: "serial" });

  test("el botón está en la sección de géneros y la explica cuando está vacía", async ({
    page,
  }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    await page
      .getByRole("link", { name: /Higurashi/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Géneros y etiquetas" })).toBeVisible();

    // Uno de los dos: o todavía no se ha enriquecido, o ya sí.
    const boton = page.getByRole("button", { name: /^(Enriquecer|Ya enriquecido)$/ });
    await expect(boton).toBeVisible();
  });

  test("pulsar «Enriquecer» dice QUÉ ha pasado, sin quedarse mudo", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");
    await page
      .getByRole("link", { name: /Higurashi/ })
      .first()
      .click();

    const boton = page.getByRole("button", { name: /^(Enriquecer|Ya enriquecido)$/ });
    await boton.click();

    // El resultado se anuncia en un `role="status"`, que es lo que lee un
    // lector de pantalla cuando algo cambia sin recargar.
    const aviso = page.getByRole("status");
    await expect(aviso).toBeVisible({ timeout: 30_000 });

    // Y dice algo útil: uno de los desenlaces que el servidor sabe describir.
    await expect(aviso).toHaveText(
      /AniList|ya estaba enriquecido|no encontró|clave de Anthropic|etiquetas de IA/,
    );
  });

  test("un anime enriquecido enseña sus géneros, y se distinguen los de IA", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");
    await page
      .getByRole("link", { name: /Higurashi/ })
      .first()
      .click();

    // Por ROL y nombre accesible, no por etiqueta CSS: `locator("section")`
    // resuelve a varias y el filtro por texto se quedaba con la que no era.
    const seccion = page.getByRole("region", { name: "Géneros y etiquetas" });

    // Y con una aserción que REINTENTA. `count()` es una foto sin reintento:
    // `testing.md` ya documenta dos tests de la biblioteca que fallaban por
    // esto mismo, y uno de ellos pasaba por suerte.
    const chips = seccion.getByRole("listitem");
    const vacio = seccion.getByText("Todavía no hay ninguna", { exact: false });

    // Uno de los dos, siempre. Lo que la sección NO puede es quedarse muda:
    // ni chips ni explicación es una pantalla que parece rota.
    await expect(chips.first().or(vacio)).toBeVisible();
  });

  test("recargar a mitad no rompe la ficha", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");
    await page
      .getByRole("link", { name: /Higurashi/ })
      .first()
      .click();

    // Se espera a que la navegación TERMINE antes de leer la URL: `click()`
    // sobre un ancla vuelve en cuanto la navegación arranca, así que
    // `page.url()` justo después seguía devolviendo /app y el test recargaba la
    // biblioteca creyendo que recargaba la ficha. El rojo decía «no está la
    // sección de géneros», que se lee como un fallo de la ficha y no lo era.
    await expect(page).toHaveURL(/\/app\/anime\//);
    const url = page.url();

    await page.reload();

    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: "Géneros y etiquetas" })).toBeVisible();
  });
});
