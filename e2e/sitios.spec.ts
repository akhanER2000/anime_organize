import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — AJUSTES → SITIOS (encargo §8, lote B2).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── QUÉ PRUEBA, Y POR QUÉ ESTO NO SE PUEDE PROBAR MÁS ABAJO ──────────────
 *
 * La capa de datos ya tiene sus trece tests de integración contra Postgres, y
 * el comprobador los suyos contra un servidor real. Lo que **nadie** de esos
 * dos niveles puede ver es lo mismo que se le escapó al registro sin nombre y
 * a la CSP: que el viaje de ida y vuelta funcione. Un formulario que envía un
 * `""` donde el servidor espera otra cosa compila, pasa el lint, pasa la
 * unidad, y falla la primera vez que alguien lo usa.
 *
 * Por eso este recorrido **deja la etiqueta en blanco a propósito** —es el
 * único campo opcional de la pantalla, y es el caso que más gente hace—, se
 * equivoca a propósito, vuelve atrás y recarga a mitad.
 *
 * ── EL CICLO ENTERO ──────────────────────────────────────────────────────
 *
 * Crear sitio → añadir espejo → comprobarlos → ver el resultado → quitar el
 * espejo → borrar el sitio. Sin ese último tramo, un borrado roto se
 * descubriría el día que al dueño le sobrara un sitio.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const marca = randomUUID().slice(0, 8);
const NOMBRE_SITIO = `Espejo de prueba ${marca}`;

/** La pestaña no se abre sola: es la cuarta de Ajustes. */
async function abrirSitios(page: Page): Promise<void> {
  await page.goto("/app/ajustes");
  await page.getByRole("tab", { name: "Sitios" }).click();
  await expect(page.getByRole("heading", { name: "Sitios y espejos" })).toBeVisible();
}

test.describe("Ajustes → Sitios", () => {
  test.describe.configure({ mode: "serial" });

  test("los trece sitios de la semilla se ven, y llegan SIN dominios", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirSitios(page);

    // La semilla del encargo §8, tal cual. Se comprueban los dos extremos de la
    // lista para no depender del orden intermedio.
    await expect(page.getByRole("heading", { name: /^Crunchyroll/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^OtakusTV/ })).toBeVisible();

    // Y la promesa que sostiene toda la pantalla: los dominios NO se inventan.
    const sinEspejos = page.getByText("Sin espejos todavía", { exact: false });
    await expect(sinEspejos.first()).toBeVisible();

    // Un sitio compartido no se puede editar, y se explica en vez de apagar un
    // botón sin motivo.
    await expect(page.getByText("De la lista compartida").first()).toBeVisible();
  });

  test("sin espejos propios, «Comprobar espejos» está apagado Y DICE POR QUÉ", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirSitios(page);

    // Un botón apagado sin explicación se lee como avería. Esta es la
    // diferencia entre «no funciona» y «todavía no hay nada que comprobar».
    await expect(page.getByRole("button", { name: "Comprobar espejos" })).toBeDisabled();
    await expect(page.getByText("Añade un espejo para poder comprobarlo")).toBeVisible();
  });

  test("el ciclo entero: crear, añadir espejo, comprobar, quitar y borrar", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirSitios(page);

    // ── 1. Crear el sitio ──────────────────────────────────────────────────
    await page.getByLabel("Nombre").fill(NOMBRE_SITIO);
    await page.getByLabel("Tipo").selectOption("GRATIS");
    await page.getByRole("button", { name: "Añadir sitio" }).click();

    const sitio = page.getByRole("heading", { name: new RegExp(`^${NOMBRE_SITIO}`) });
    await expect(sitio).toBeVisible();

    // El campo se vacía: si no, el segundo alta repetiría el nombre y chocaría
    // contra el UNIQUE del slug sin que el usuario entienda por qué.
    await expect(page.getByLabel("Nombre")).toHaveValue("");

    // ── 2. Añadir un espejo DEJANDO LA ETIQUETA EN BLANCO ─────────────────
    // El caso que se coló en el registro: el campo opcional vacío.
    const bloque = page.locator("li").filter({ hasText: NOMBRE_SITIO });
    await bloque
      .getByLabel(`Nuevo espejo de ${NOMBRE_SITIO}`, { exact: true })
      .fill("https://ejemplo.test/v1");
    await bloque.getByRole("button", { name: "Añadir espejo" }).click();

    // La etiqueta la pone el sistema: V1, porque era el primero.
    await expect(bloque.getByText("V1", { exact: true })).toBeVisible();
    await expect(bloque.getByText("sin comprobar", { exact: false })).toBeVisible();

    // ── 3. Equivocarse: una URL que no es una URL ─────────────────────────
    await bloque
      .getByLabel(`Nuevo espejo de ${NOMBRE_SITIO}`, { exact: true })
      .fill("no-soy-una-url");
    await bloque.getByRole("button", { name: "Añadir espejo" }).click();
    await expect(page.getByText("dirección http o https completa", { exact: false })).toBeVisible();

    // ── 4. Recargar a mitad, con datos escritos y sin enviar ──────────────
    await page.reload();
    await page.getByRole("tab", { name: "Sitios" }).click();
    // El espejo bueno sigue; el texto a medio escribir se ha ido, que es lo
    // que tiene que pasar: no se guarda nada que no se haya enviado.
    await expect(page.getByText("https://ejemplo.test/v1")).toBeVisible();

    // ── 5. Comprobar los espejos ──────────────────────────────────────────
    const comprobar = page.getByRole("button", { name: "Comprobar espejos" });
    await expect(comprobar).toBeEnabled();
    await comprobar.click();

    // `ejemplo.test` no existe: el resultado correcto es «caído», y lo que se
    // prueba aquí es que el ciclo llega hasta la pantalla y ANOTA la fecha.
    // Antes de esto ponía «sin comprobar»; que ya no lo ponga es la prueba de
    // que la escritura pasó por la fila correcta.
    await expect(page.getByText(/1 comprobados · \d+ en pie · \d+ caídos/)).toBeVisible();
    const bloqueTrasComprobar = page.locator("li").filter({ hasText: NOMBRE_SITIO });
    await expect(bloqueTrasComprobar.getByText("sin comprobar", { exact: false })).toHaveCount(0);

    // ── 6. Quitar el espejo ───────────────────────────────────────────────
    await bloqueTrasComprobar.getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByText("https://ejemplo.test/v1")).toHaveCount(0);

    // ── 7. Borrar el sitio, que pide confirmación ─────────────────────────
    await page
      .locator("li")
      .filter({ hasText: NOMBRE_SITIO })
      .getByRole("button", { name: "Borrar sitio" })
      .click();
    await page.getByRole("button", { name: "Borrar el sitio" }).click();

    await expect(page.getByRole("heading", { name: new RegExp(`^${NOMBRE_SITIO}`) })).toHaveCount(
      0,
    );

    // Y los compartidos siguen ahí: borrar lo propio no toca la semilla.
    await expect(page.getByRole("heading", { name: /^Crunchyroll/ })).toBeVisible();
  });

  test("volver atrás con el navegador deja la pantalla usable", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirSitios(page);

    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goBack();
    // La pestaña activa no sobrevive al historial —vive en estado local— pero
    // la pantalla sí tiene que seguir funcionando, que es lo que se comprueba.
    await page.getByRole("tab", { name: "Sitios" }).click();
    await expect(page.getByRole("heading", { name: "Sitios y espejos" })).toBeVisible();
  });
});
