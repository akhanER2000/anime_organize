import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — EL BUSCADOR GLOBAL (artboard 07).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── LO QUE SOLO SE VE AQUÍ ────────────────────────────────────────────────
 *
 * 1. **Que el debounce no pierde letras.** Es el fallo del buscador controlado
 *    por la URL: si el campo leyera el valor del servidor, escribir rápido lo
 *    dejaría a tirones y con letras perdidas, porque llega una respuesta con el
 *    valor de hace 200 ms. Se comprueba escribiendo de golpe y mirando el campo.
 *
 * 2. **Que el término viaja en la URL.** Es lo que hace que la vista se comparta
 *    pegando el enlace y que el botón de atrás funcione.
 *
 * 3. **Que «/» enfoca y no roba el foco cuando ya se está escribiendo.** Ese
 *    detalle es lo que separa un atajo útil de uno molesto: escribir «AC/DC» en
 *    una nota no puede saltar al buscador.
 *
 * No crea ni borra nada: busca sobre los 83 del vault sembrado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const buscador = (page: Page) => page.getByRole("searchbox", { name: /buscar/i });
const tarjetas = (page: Page) =>
  page.getByRole("list", { name: "Tus series" }).getByRole("listitem");

test.describe("el buscador global", () => {
  test("BUSCA, FILTRA LA REJILLA Y LO DEJA EN LA URL", async ({ page }) => {
    await entrarComoPropietario(page);

    const total = await tarjetas(page).count();
    expect(total).toBeGreaterThan(1);

    await buscador(page).fill("higurashi");

    // El término acaba en la URL: es lo que permite compartir la vista.
    await expect(page).toHaveURL(/[?&]q=higurashi/, { timeout: 15_000 });

    // Y la rejilla enseña MENOS que antes, no lo mismo. Un buscador que no
    // reduce nada se ve exactamente igual que uno que no está conectado.
    await expect(tarjetas(page)).not.toHaveCount(total);
    const encontrados = await tarjetas(page).count();
    expect(encontrados).toBeGreaterThan(0);
    expect(encontrados).toBeLessThan(total);
  });

  test("EL CONTADOR HABLA DE LA BÚSQUEDA, no del vault", async ({ page }) => {
    await entrarComoPropietario(page);
    await buscador(page).fill("higurashi");
    await expect(page).toHaveURL(/[?&]q=higurashi/, { timeout: 15_000 });

    const encontrados = await tarjetas(page).count();

    // «3 de 3», no «3 de 83»: mezclar el resultado con el tamaño del vault
    // deja un número que no significa nada donde estaba.
    await expect(
      page.getByText(new RegExp(`${String(encontrados)} de ${String(encontrados)} serie`)),
    ).toBeVisible();
  });

  test("NO PIERDE LETRAS al escribir rápido", async ({ page }) => {
    // El fallo del buscador que lee su valor de la URL: cada tecla viaja al
    // servidor y vuelve, y llega una respuesta con el valor de hace 200 ms que
    // pisa lo que se acaba de escribir.
    await entrarComoPropietario(page);

    const termino = "attack on titan";
    await buscador(page).pressSequentially(termino, { delay: 20 });

    await expect(buscador(page)).toHaveValue(termino);
    await expect(page).toHaveURL(/[?&]q=attack\+on\+titan/, { timeout: 15_000 });
  });

  test("SIN RESULTADOS lo dice, con el término y una salida", async ({ page }) => {
    await entrarComoPropietario(page);

    await buscador(page).fill("zzzz-esto-no-existe-zzzz");

    await expect(page.getByRole("heading", { name: /nada coincide/i })).toBeVisible({
      timeout: 15_000,
    });
    // Repite el término: con un typo largo, la duda es justo si el buscador
    // recibió lo que se escribió.
    await expect(page.getByText(/zzzz-esto-no-existe-zzzz/)).toBeVisible();

    // Y la salida existe y funciona.
    await page.getByRole("link", { name: /ver todo el vault/i }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(tarjetas(page).first()).toBeVisible();
  });

  test("«/» ENFOCA EL BUSCADOR", async ({ page }) => {
    await entrarComoPropietario(page);

    // El foco empieza fuera del campo.
    await page.getByRole("heading", { level: 1 }).first().click();
    await expect(buscador(page)).not.toBeFocused();

    await page.keyboard.press("/");
    await expect(buscador(page)).toBeFocused();

    // Y la barra NO se escribe en el campo: es un atajo, no una tecla.
    await expect(buscador(page)).toHaveValue("");
  });

  test("«/» NO ROBA EL FOCO si ya se está escribiendo", async ({ page }) => {
    // Escribir «AC/DC» en una nota no puede saltar al buscador. Es el detalle
    // que separa un atajo útil de uno molesto.
    await entrarComoPropietario(page);

    await page.getByRole("button", { name: "Añadir anime" }).click();
    const modal = page.getByRole("dialog");
    const titulo = modal.getByLabel("Título");

    await titulo.fill("AC");
    await page.keyboard.press("/");
    await titulo.type("DC");

    await expect(titulo).toHaveValue("AC/DC");
    await expect(buscador(page)).not.toBeFocused();

    await page.keyboard.press("Escape");
  });

  test("«Esc» LIMPIA, y otra vez suelta el foco", async ({ page }) => {
    await entrarComoPropietario(page);

    await buscador(page).fill("higurashi");
    await expect(page).toHaveURL(/[?&]q=higurashi/, { timeout: 15_000 });

    await buscador(page).press("Escape");
    await expect(buscador(page)).toHaveValue("");
    // Y el término desaparece de la URL: la pantalla vuelve a ser el vault.
    await expect(page).not.toHaveURL(/[?&]q=/, { timeout: 15_000 });

    await buscador(page).press("Escape");
    await expect(buscador(page)).not.toBeFocused();
  });

  test("EL BOTÓN DE ATRÁS deshace la búsqueda", async ({ page }) => {
    await entrarComoPropietario(page);
    const total = await tarjetas(page).count();

    await buscador(page).fill("higurashi");
    await expect(page).toHaveURL(/[?&]q=higurashi/, { timeout: 15_000 });

    await page.goBack();

    // ── LO QUE ESTE TEST CAZÓ ───────────────────────────────────────────
    //
    // La primera versión usaba `replace` en TODAS las pulsaciones, para no
    // dejar una entrada de historial por tecla. El efecto era el contrario del
    // buscado: la entrada de «el vault sin buscar» se pisaba con la primera
    // letra, así que **atrás sacaba del vault entero**.
    //
    // Ahora es mixto: `push` al empezar a buscar —una sola entrada de «antes»—
    // y `replace` mientras se escribe. Una pulsación de atrás deshace la
    // búsqueda completa y devuelve el vault.
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(tarjetas(page)).toHaveCount(total);
    // Y el campo se vacía con la URL: si se quedara con el término, la pantalla
    // diría dos cosas a la vez.
    await expect(buscador(page)).toHaveValue("");
  });

  test("TAMBIÉN BUSCA EN LA VISTA LISTA", async ({ page }) => {
    // El buscador vive en la barra, que es común: si solo funcionara en una de
    // las dos vistas, el conmutador dejaría de ser un cambio de aspecto para
    // ser un cambio de funcionalidad.
    await entrarComoPropietario(page);
    await page.goto("/app/lista");

    await buscador(page).fill("higurashi");
    await expect(page).toHaveURL(/\/app\/lista\?.*q=higurashi/, { timeout: 15_000 });

    const filas = page.getByRole("row");
    // La cabecera cuenta como fila, así que se comprueba que hay resultados y
    // que son menos que el vault entero.
    await expect(filas).not.toHaveCount(0);
    expect(await filas.count()).toBeLessThan(83);
  });
});
