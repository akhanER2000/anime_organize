import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { limpiarAnimesDePrueba, PREFIJO_E2E } from "./preparar-suite";
import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — GUARDAR EL CAPÍTULO POR EL QUE VOY (artboard 05).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── LO QUE SOLO SE VE AQUÍ ────────────────────────────────────────────────
 *
 * 1. **Que abrir el enlace lo marca como usado.** El orden de la lista sale de
 *    `last_used_at DESC NULLS LAST`, así que la única forma de comprobar que el
 *    registro ocurre es abrir el segundo y ver que pasa a ser el primero. Un
 *    test que solo comprobara «la acción devolvió ok» no distinguiría eso de
 *    una acción que escribe en la fila equivocada.
 *
 * 2. **Que el enlace se abre en una pestaña nueva, con `rel` puesto.** Sin
 *    `noopener`, la página de destino puede reescribir la nuestra con
 *    `window.opener.location` — que es tabnabbing, y con enlaces a sitios de
 *    streaming no es un riesgo teórico.
 *
 * 3. **Que un `javascript:` no se pinta como acción.** Tiene tres capas y la
 *    de arriba es esta: si las de abajo fallaran, aquí se vería.
 *
 * Todo lo que se crea lleva el prefijo `[e2e]` y se borra después de cada test.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const tituloDePrueba = () => `${PREFIJO_E2E} Enlaces ${randomUUID().slice(0, 8)}`;

/** Crea un anime por el modal y deja la página en su ficha. */
async function crearYAbrirFicha(page: Page, titulo: string) {
  await entrarComoPropietario(page);

  await page.getByRole("button", { name: "Añadir anime" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Título").fill(titulo);
  await modal.getByRole("button", { name: "Añadir al vault" }).click();
  await expect(modal).toBeHidden({ timeout: 20_000 });

  await page.getByRole("link", { name: titulo, exact: false }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible({
    timeout: 15_000,
  });
}

async function guardarEnlace(page: Page, url: string, etiqueta: string) {
  const abrirFormulario = page.getByRole("button", {
    name: /guardar por dónde voy|añadir otro enlace/i,
  });
  await abrirFormulario.click();

  await page.getByLabel("Dirección del capítulo").fill(url);
  // `getByLabel("Etiqueta")` casa también con la región «Géneros y etiquetas»:
  // se acota al control de texto.
  await page.getByRole("textbox", { name: "Etiqueta", exact: true }).fill(etiqueta);
  await page.getByRole("button", { name: "Guardar el enlace" }).click();

  // El más reciente sube arriba como acción primaria; los demás quedan en la
  // lista. Se espera por su fila de gestión, que existe en los dos casos.
  await expect(page.getByRole("button", { name: `Quitar el enlace ${etiqueta}` })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("los enlaces para continuar", () => {
  test.afterEach(async () => {
    await limpiarAnimesDePrueba();
  });

  test("SE GUARDA, SE VE Y SE ABRE EN PESTAÑA NUEVA", async ({ page, context }) => {
    const titulo = tituloDePrueba();
    await crearYAbrirFicha(page, titulo);

    // El estado vacío dice qué hacer, no solo que no hay nada.
    await expect(page.getByText(/sin enlaces para continuar/i)).toBeVisible();

    await guardarEnlace(page, "https://example.com/vinland-saga/7", "AnimeFLV V2 · Ep 7");

    // La acción primaria: el botón dorado de arriba. Es el único ancla a esa
    // URL — la fila de gestión del primero es texto, no un segundo enlace al
    // mismo sitio.
    const enlace = page.getByRole("link", { name: /AnimeFLV V2 · Ep 7/ });

    // `noopener noreferrer` los pone la primitiva `Enlace` sola, y es lo que
    // impide que el destino reescriba esta pestaña con `window.opener`.
    await expect(enlace).toHaveAttribute("target", "_blank");
    await expect(enlace).toHaveAttribute("rel", /noopener/);
    await expect(enlace).toHaveAttribute("rel", /noreferrer/);

    // Y se abre de verdad: la pestaña nueva existe y va a donde dice.
    const [pestana] = await Promise.all([context.waitForEvent("page"), enlace.click()]);
    expect(pestana.url()).toBe("https://example.com/vinland-saga/7");
    await pestana.close();
  });

  test("ABRIR UNO LO PONE EL PRIMERO: es lo que registra el uso", async ({ page, context }) => {
    // ── LO QUE ESTE TEST PROTEGE ────────────────────────────────────────
    //
    // El orden sale de `last_used_at DESC NULLS LAST`. Si `marcarEnlaceUsado`
    // no escribiera, o escribiera en la fila equivocada, el orden no cambiaría
    // y la acción primaria de la card seguiría siendo el enlace viejo. Un test
    // que solo mirara «la acción devolvió ok» no vería la diferencia.
    const titulo = tituloDePrueba();
    await crearYAbrirFicha(page, titulo);

    await guardarEnlace(page, "https://example.com/uno", "Primero");
    await guardarEnlace(page, "https://example.com/dos", "Segundo");

    // El orden se lee de las filas de gestión, que están todas y en su orden.
    const ordenDeLaLista = async () =>
      (await page.getByRole("button", { name: /^Quitar el enlace/ }).all()).length === 0
        ? []
        : (
            await page
              .getByRole("button", { name: /^Quitar el enlace/ })
              .evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute("aria-label") ?? ""))
          ).map((etiqueta) => etiqueta.replace("Quitar el enlace ", ""));

    // Ninguno se ha usado: manda el orden de creación, el más nuevo arriba.
    expect(await ordenDeLaLista()).toEqual(["Segundo", "Primero"]);

    // «Primero» está en la lista como ancla —no es la acción primaria—, así que
    // se puede abrir desde ahí. Al abrirlo, `last_used_at` lo pone delante.
    const [pestana] = await Promise.all([
      context.waitForEvent("page"),
      // `exact: true` no vale: `Enlace` añade «(se abre en una pestaña nueva)»
      // al nombre accesible, y eso es correcto — avisar de que la navegación
      // cambia de contexto es lo que pide WCAG 3.2.5.
      page.getByRole("link", { name: /^Primero/ }).click(),
    ]);
    await pestana.close();

    await expect(async () => {
      expect(await ordenDeLaLista()).toEqual(["Primero", "Segundo"]);
    }).toPass({ timeout: 15_000 });
  });

  test("SE PUEDE QUITAR, y el vacío vuelve a decir qué hacer", async ({ page }) => {
    const titulo = tituloDePrueba();
    await crearYAbrirFicha(page, titulo);

    await guardarEnlace(page, "https://example.com/quitar", "Para quitar");

    await page.getByRole("button", { name: /quitar el enlace/i }).click();

    await expect(page.getByRole("button", { name: /quitar el enlace/i })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByText(/sin enlaces para continuar/i)).toBeVisible();
  });

  test("UNA DIRECCIÓN QUE NO ES http(s) SE RECHAZA AL GUARDAR", async ({ page }) => {
    // `javascript:` es XSS almacenado. Tiene tres capas —el esquema Zod, el
    // CHECK de la columna y `esHrefSeguro` al pintar—; que la de arriba lo
    // pare significa que el usuario ve un motivo en vez de un enlace inerte.
    const titulo = tituloDePrueba();
    await crearYAbrirFicha(page, titulo);

    await page.getByRole("button", { name: /guardar por dónde voy/i }).click();
    await page.getByLabel("Dirección del capítulo").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Guardar el enlace" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /http/i })).toBeVisible({
      timeout: 15_000,
    });
    // Y no se ha guardado nada.
    await expect(page.getByRole("link", { name: /javascript/i })).toHaveCount(0);
  });

  test("RECARGAR A MITAD no pierde la pantalla", async ({ page }) => {
    // `testing.md` lo pide para todo recorrido: escribir, recargar sin enviar,
    // y comprobar que la pantalla sigue usable.
    const titulo = tituloDePrueba();
    await crearYAbrirFicha(page, titulo);

    await page.getByRole("button", { name: /guardar por dónde voy/i }).click();
    await page.getByLabel("Dirección del capítulo").fill("https://example.com/a-medias");

    await page.reload();

    // Lo escrito se pierde —es un formulario sin borrador, y está bien— pero la
    // ficha sigue entera y el formulario se puede volver a abrir.
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByRole("button", { name: /guardar por dónde voy/i })).toBeVisible();
  });
});
