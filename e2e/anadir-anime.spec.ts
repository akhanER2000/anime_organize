import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { limpiarAnimesDePrueba, PREFIJO_E2E } from "./preparar-suite";
import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — AÑADIR UN ANIME (artboard 06).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── LO QUE SOLO SE PUEDE COMPROBAR AQUÍ ───────────────────────────────────
 *
 * 1. **Que la portada se guarda como BYTES, no como enlace.** Es la invariante
 *    del proyecto y la única forma de verla es interceptar la red: el `<img>`
 *    de la card tiene que pedir `/api/covers/…` y **ninguna petición de imagen
 *    puede salir al dominio de origen**. Un `src` correcto en el HTML y un
 *    preload al dominio original se ven idénticos leyendo el DOM.
 *
 * 2. **Que el aviso de parecidos NO bloquea.** Es la regla que más caro sale
 *    equivocar: `Higurashi (2020)` se parece al de 2006 por encima de 0.55 y
 *    son dos series que el dueño tiene a propósito. El test añade uno parecido
 *    a algo que ya está y comprueba que puede seguir.
 *
 * 3. **Que dejar en blanco todo lo opcional funciona.** Es el caso que se coló
 *    en el registro —`""` convertido a `null` que el servidor rechazaba— y el
 *    que más gente hace.
 *
 * ── EL RECORRIDO SE LIMPIA SOLO, Y EL PREFIJO NO ES CASUAL ────────────────
 *
 * Todo lo que se crea aquí empieza por `[e2e]`, y se borra por ese patrón al
 * empezar la suite y al terminar este fichero.
 *
 * La primera versión usaba un sufijo aleatorio para no chocar con el `UNIQUE`.
 * Evitaba el duplicado EXACTO y no la SIMILITUD: `Portada rota 164f358b` y
 * `Portada rota b0b7458c` se parecen muy por encima de 0.55, así que la segunda
 * ejecución disparaba el aviso de parecidos y el test se quedaba mirando un
 * modal abierto. El fallo se leía como «el alta no cierra el modal» y era «la
 * ejecución anterior dejó basura».
 *
 * Cada test lleva además SU PROPIO sufijo, no uno compartido: con uno común,
 * los títulos de dos tests distintos se parecerían entre sí por el sufijo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Un título de prueba, con su prefijo borrable y un sufijo propio. */
const tituloDePrueba = (que: string) => `${PREFIJO_E2E} ${que} ${randomUUID().slice(0, 8)}`;

/** Una imagen real y pequeña, servida por un dominio que no es el nuestro. */
const URL_IMAGEN =
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx1-CXtrrkMpJ8Zq.png";

async function abrirModal(page: Page) {
  await page.getByRole("button", { name: "Añadir anime" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/**
 * Todo se busca DENTRO del diálogo, y no es cosmética.
 *
 * `getByLabel(/Portada/)` a nivel de página casa también con el
 * `aria-label` de una barra de progreso —«Progreso de Portada rota…»—, y
 * `getByRole("alert")` casa con el anunciador de rutas de Next, que es un
 * `role="alert"` vacío y permanente. Los dos hacían fallar el test por
 * ambigüedad, con un mensaje que parecía un fallo de la aplicación.
 */
const dentro = (page: Page) => page.getByRole("dialog");

test.describe("añadir un anime al vault", () => {
  /**
   * ── SE LIMPIA DESPUÉS DE CADA TEST, NO AL FINAL DEL FICHERO ───────────
   *
   * Con `afterAll`, los animes creados aquí siguen en el vault mientras corren
   * los demás specs, y `vista-lista.spec.ts` cuenta las filas de la tabla: leyó
   * **87 donde esperaba 83** y el rojo decía «ordenar por título pierde filas»,
   * que no era ni de lejos el problema.
   *
   * `afterEach` reduce la ventana a un solo test. Los specs comparten un vault
   * de verdad —el del propietario, con sus 83— y eso es a propósito: probar
   * contra datos reales es lo que hace que estas pruebas valgan. El precio es
   * que ninguno puede dejar nada detrás.
   *
   * Se limpia contra la base y no por la interfaz porque el borrado de la ficha
   * tiene una cuenta atrás de 10 s a propósito; esperarla por cada anime haría
   * el teardown lento y frágil. Lo que la interfaz hace ya lo prueba su propio
   * recorrido.
   */
  test.afterEach(async () => {
    await limpiarAnimesDePrueba();
  });

  test("con solo el título —todo lo opcional en blanco— se crea y aparece", async ({ page }) => {
    // El caso que se coló en el registro: dejar vacío lo que no es obligatorio.
    // Es lo que más gente hace y es lo que menos se prueba.
    const titulo = tituloDePrueba("Solo titulo");

    await entrarComoPropietario(page);
    await abrirModal(page);

    await dentro(page).getByLabel("Título").fill(titulo);
    await dentro(page).getByRole("button", { name: "Añadir al vault" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("EL FORMULARIO VACÍO NO SE PUEDE ENVIAR, y se ve por qué", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirModal(page);

    // El botón está deshabilitado sin título: es la forma honesta de decir «te
    // falta algo» sin dejar que el usuario descubra el error después de enviar.
    await expect(dentro(page).getByRole("button", { name: "Añadir al vault" })).toBeDisabled();

    await dentro(page).getByLabel("Título").fill("   ");
    await expect(dentro(page).getByRole("button", { name: "Añadir al vault" })).toBeDisabled();
  });

  test("LA PORTADA SE GUARDA EN LA BASE, NO SE ENLAZA", async ({ page }) => {
    const titulo = tituloDePrueba("Con portada");

    await entrarComoPropietario(page);

    // Se vigila la red ANTES de crear: lo que importa es a qué host se le piden
    // imágenes cuando la card ya está pintada.
    const peticionesDeImagen: string[] = [];
    page.on("request", (peticion) => {
      if (peticion.resourceType() === "image") peticionesDeImagen.push(peticion.url());
    });

    await abrirModal(page);
    await dentro(page).getByLabel("Título").fill(titulo);
    await dentro(page)
      .getByLabel(/Portada/)
      .fill(URL_IMAGEN);
    await dentro(page).getByRole("button", { name: "Añadir al vault" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });

    await page.goto("/app");
    await expect(page.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // Todas las imágenes de la REJILLA salen de nuestro endpoint. Las de la
    // vista previa del modal sí van al origen —es lo único que hay antes de
    // enviar—, así que se miran solo las de después de recargar.
    const trasRecargar = peticionesDeImagen.filter((url) => !url.includes("anilist"));
    for (const url of trasRecargar) {
      expect(url, `una imagen se pidió fuera de /api/covers: ${url}`).toContain("/api/covers/");
    }

    // Y el `<img>` de la card apunta ahí, con su `?v=` para que el `immutable`
    // de un año no congele una portada cambiada.
    const tarjeta = page.locator(`a:has-text("${titulo}") img`).first();
    await expect(tarjeta).toHaveAttribute("src", /\/api\/covers\/[0-9a-f-]+/);
  });

  test("UNA IMAGEN QUE NO SE PUEDE DESCARGAR NO TIRA EL ALTA ENTERA", async ({ page }) => {
    // Castigar al usuario perdiendo su alta porque un tercero devolvió un 404
    // sería el diseño equivocado: se crea, se avisa, y la portada se pone luego.
    const titulo = tituloDePrueba("Portada rota");

    await entrarComoPropietario(page);
    await abrirModal(page);

    await dentro(page).getByLabel("Título").fill(titulo);
    await dentro(page)
      .getByLabel(/Portada/)
      .fill("https://ejemplo.invalido.test/no-existe.png");
    await dentro(page).getByRole("button", { name: "Añadir al vault" }).click();

    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    // El anime está, y el aviso lo dice sin fingir que todo fue bien.
    await expect(page.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/portada no/i)).toBeVisible();
  });

  test("EL PARECIDO PREGUNTA Y DEJA SEGUIR: no bloquea", async ({ page }) => {
    // ── LA REGLA QUE ESTE TEST PROTEGE ──────────────────────────────────
    //
    // El dueño tiene los tres Higurashi a propósito. Un alta que bloqueara por
    // similitud le impediría añadir el segundo, con un mensaje que dice «ya lo
    // tienes» sobre algo que no tiene. Skill de dominio §2c.
    // A propósito PARECIDO a los tres que el dueño ya tiene: es lo que dispara
    // la pregunta. El prefijo `[e2e]` no impide el parecido, solo el borrado.
    const titulo = `${PREFIJO_E2E} Higurashi no Naku Koro ni ${randomUUID().slice(0, 8)}`;

    await entrarComoPropietario(page);
    await abrirModal(page);

    await dentro(page).getByLabel("Título").fill(titulo);
    await dentro(page).getByRole("button", { name: "Añadir al vault" }).click();

    // Primera pulsación: aparece la pregunta, en oro y no en granate, y el
    // botón cambia de texto para que la segunda pulsación no parezca un
    // reintento de la primera.
    const aviso = dentro(page)
      .getByRole("status")
      .filter({ hasText: /puede que ya/i });
    await expect(aviso).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog")).toBeVisible();

    const seguir = dentro(page).getByRole("button", { name: "Añadir igualmente" });
    await expect(seguir).toBeVisible();

    // Segunda pulsación: se crea. Esto es lo que no puede romperse nunca.
    await seguir.click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("EL DUPLICADO EXACTO SÍ BLOQUEA, y dice cuál", async ({ page }) => {
    await entrarComoPropietario(page);

    // Se lee un título que ya está en el vault, de la propia rejilla: así el
    // test no depende de que el seed tenga uno concreto.
    const primero = page.locator("a[href^='/app/anime/'] h3, a[href^='/app/anime/'] p").first();
    await expect(primero).toBeVisible({ timeout: 15_000 });
    const existente = (await primero.innerText()).trim();

    await abrirModal(page);
    await dentro(page).getByLabel("Título").fill(existente);
    await dentro(page).getByRole("button", { name: "Añadir al vault" }).click();

    // Mensaje en granate, con el nombre dentro: «ya lo tienes» sin decir cuál
    // obliga a ir a buscarlo.
    await expect(dentro(page).getByRole("alert")).toContainText(/ya tienes/i, {
      timeout: 20_000,
    });
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Escape cierra el modal y no deja nada a medias", async ({ page }) => {
    await entrarComoPropietario(page);
    await abrirModal(page);

    await dentro(page).getByLabel("Título").fill("Esto no se guarda");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Al reabrir, el campo está limpio: un modal que recuerda lo de la vez
    // anterior hace que la siguiente alta empiece con datos que nadie escribió.
    await abrirModal(page);
    await expect(dentro(page).getByLabel("Título")).toHaveValue("");
  });
});
