import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

import { liberarLimiteDeImportacion } from "./ayuda-recuperacion";
import { PREFIJO_E2E } from "./preparar-suite";
import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — AJUSTES → IMPORTAR (lote C2).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── QUÉ ATRAVIESA, Y POR QUÉ NINGÚN NIVEL DE ABAJO LO CUBRE ─────────────
 *
 * Este recorrido sube un `.xlsx` DE VERDAD por `multipart/form-data`, pasa por
 * la guarda CSRF del Route Handler, por el límite, por SheetJS, por el plan y
 * por la Server Action que escribe. Los 39 tests de unidad de esta carpeta
 * cubren cada pieza; **ninguno cubre que estén enchufadas**, que es donde han
 * aparecido todos los fallos caros de este proyecto.
 *
 * ── EL FICHERO SE GENERA AQUÍ ───────────────────────────────────────────
 *
 * Con la misma SheetJS que lo lee, y con un identificador único por ejecución:
 * la suite corre contra una base compartida y los títulos importados se quedan.
 * Sin la marca, la segunda ejecución vería «duplicada» donde la primera vio
 * «nueva» y el test fallaría por el motivo equivocado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const marca = randomUUID().slice(0, 8);

function hoja(filas: readonly (readonly string[])[]): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas as string[][]), "Series");
  const salida: unknown = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(salida as Uint8Array);
}

async function abrirImportar(page: Page): Promise<void> {
  await page.goto("/app/ajustes");
  await page.getByRole("tab", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Importar una hoja" })).toBeVisible();
}

/**
 * Un título convertido en expresión regular, ESCAPADO.
 *
 * El prefijo de la suite es `[e2e]`, y los corchetes son una clase de
 * caracteres: `new RegExp("[e2e] Importada B x")` no busca ese texto, busca una
 * «e», un «2» o una «e» seguidos de « Importada B x». El día que los títulos
 * ganaron el prefijo, los selectores dejaron de encontrar nada y el rojo decía
 * «la casilla no tiene id», que no tenía nada que ver.
 */
function comoRegex(texto: string): RegExp {
  // Carácter a carácter contra una lista explícita: sin expresiones
  // regulares dentro del escapador de expresiones regulares.
  const especiales = new Set([...".*+?^${}()|[]\\/"]);
  const escapado = [...texto].map((c) => (especiales.has(c) ? "\\" + c : c)).join("");
  return new RegExp(escapado);
}

/** El input real de la zona de arrastre, que está `sr-only`. */
function selectorDeFichero(page: Page) {
  return page.locator('input[type="file"]');
}

/**
 * Alterna una casilla PULSANDO SU ETIQUETA, que es lo que hace una persona.
 *
 * `uncheck()` de Playwright hace clic sobre el `<input>`, y en este sistema el
 * input está `sr-only` con la caja de 15 px pintada encima —así se conservan el
 * foco, la barra espaciadora y el envío del formulario, ver `casilla.tsx`—.
 * El clic directo lo intercepta la caja.
 *
 * Un usuario nunca pulsa el input: pulsa la etiqueta, y el navegador reenvía.
 * Hacer eso aquí prueba el camino de verdad; `{ force: true }` lo saltaría.
 */
async function alternarCasilla(page: Page, nombre: RegExp): Promise<void> {
  const casilla = page.getByRole("checkbox", { name: nombre });
  const id = await casilla.getAttribute("id");
  if (id === null) throw new Error("la casilla no tiene id, y su <label> la busca por ahí");
  await page.locator(`label[for="${id}"]`).click();
}

test.describe("Ajustes → Importar", () => {
  test.describe.configure({ mode: "serial" });

  // `import:user` son 5/hora y este recorrido gasta dos. Sin esto, la tercera
  // ejecución seguida falla con «has importado demasiadas veces», que se lee
  // como un fallo de la importación y es el limitador haciendo su trabajo.
  test.beforeAll(async () => {
    await liberarLimiteDeImportacion();
  });

  test("la pestaña explica qué acepta antes de que sueltes nada", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirImportar(page);

    await expect(page.getByText(".xlsx o .csv", { exact: false })).toBeVisible();
    // Y dice lo que más importa: que subir NO escribe.
    await expect(
      page.getByText("no se escribe nada hasta que lo confirmes", { exact: false }),
    ).toBeVisible();
  });

  test("un fichero que no es una hoja se rechaza con un motivo legible", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirImportar(page);

    // Un PNG con nombre de csv: la extensión miente, los bytes no.
    await selectorDeFichero(page).setInputFiles({
      name: "trampa.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
    });

    await expect(page.getByText("no es una hoja de cálculo", { exact: false })).toBeVisible();
  });

  test("EL CICLO ENTERO: subir, mirar el plan, deseleccionar y confirmar", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirImportar(page);

    // El prefijo NO es decorativo: `preparar-suite` borra por él al empezar
    // cada ejecución. Sin él, los animes importados se quedaban en el vault de
    // desarrollo, se colaban los primeros en la biblioteca —son los más
    // recientes— y el spec de la ficha empezaba a elegir uno SIN PORTADA. El
    // rojo decía «la portada se pidió sin ?v=», que suena a un fallo del
    // pipeline de portadas y era basura de otro test.
    const nuevaA = `${PREFIJO_E2E} Importada A ${marca}`;
    const nuevaB = `${PREFIJO_E2E} Importada B ${marca}`;

    await selectorDeFichero(page).setInputFiles({
      name: "mi-lista.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: hoja([
        ["Anime", "Estado", "Progreso"],
        [nuevaA, "Visto", "Completo"],
        [nuevaB, "Viendo", "Episodio 4"],
        // Ya está en el vault: sale como duplicada y NO marcada.
        ["Higurashi no Naku Koro Ni", "Visto", "Completo"],
        // Repetida dentro del propio fichero.
        [nuevaA, "Visto", ""],
        // Sin título: error, y la casilla no se puede marcar.
        ["", "Visto", "Completo"],
      ]),
    });

    // ── El plan, con sus cuatro clases ─────────────────────────────────────
    await expect(page.getByText("mi-lista.xlsx", { exact: false })).toBeVisible();
    await expect(page.getByText("2 nuevas", { exact: false })).toBeVisible();
    await expect(page.getByText("1 ya las tienes", { exact: false })).toBeVisible();
    await expect(page.getByText("1 repetidas en el fichero", { exact: false })).toBeVisible();
    await expect(page.getByText("1 con error", { exact: false })).toBeVisible();

    // Los motivos se ven, con el número de fila de LA HOJA.
    await expect(page.getByText("Ya la tienes", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("ya aparece en la fila 2", { exact: false })).toBeVisible();

    // La fila sin título no se puede marcar: su casilla está deshabilitada.
    const casillaDelError = page
      .getByRole("checkbox", { name: /\(sin título\)|Fila 6/ })
      .or(page.getByRole("checkbox").last());
    await expect(casillaDelError).toBeDisabled();

    // ── El usuario deselecciona una ───────────────────────────────────────
    await expect(page.getByRole("button", { name: "Importar 2 series" })).toBeVisible();
    await alternarCasilla(page, comoRegex(nuevaB));
    await expect(page.getByRole("button", { name: "Importar 1 series" })).toBeVisible();

    // ── Confirmar ─────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Importar 1 series" }).click();

    const resumen = page.getByRole("status");
    await expect(resumen).toBeVisible({ timeout: 20_000 });
    await expect(resumen).toHaveText(/1 importadas/);

    // Y el CSV de incidencias se ofrece, porque hubo incidencias.
    await expect(page.getByRole("button", { name: "Descargar el detalle (.csv)" })).toBeVisible();
  });

  test("el anime importado está de verdad en la biblioteca", async ({ page }) => {
    await entrarComoPropietario(page);

    // La comprobación que de verdad cierra el caso: no el mensaje de la
    // pantalla de importación, sino la serie en el vault. «1 importadas» es un
    // recuento, y en este proyecto los recuentos ya han mentido.
    await page.goto(`/app?q=${encodeURIComponent(`Importada A ${marca}`)}`);

    await expect(page.getByRole("link", { name: comoRegex(`Importada A ${marca}`) })).toBeVisible();
  });

  test("la deseleccionada NO se importó", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto(`/app?q=${encodeURIComponent(`Importada B ${marca}`)}`);

    // El control negativo. Sin él, una acción que importara TODAS las filas
    // pasaría el test anterior sin problemas.
    await expect(page.getByRole("link", { name: comoRegex(`Importada B ${marca}`) })).toHaveCount(
      0,
    );
  });
});
