import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";
import { config as cargarEnv } from "dotenv";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — LA FICHA DE UN ANIME (artboard 05).
 *
 * Chromium, contra `build` + `start`, y **sin `bypassCSP`**.
 * `.claude/rules/testing.md` § «Ninguna pantalla está terminada sin un
 * RECORRIDO EN NAVEGADOR»: es el único nivel que ejercita la aplicación entera
 * —red, CSP, hidratación, el viaje de ida y vuelta de los datos— y es el que
 * destapó que la aplicación se servía **en blanco** con la política puesta,
 * cuando el build salía a 0 y las cabeceras eran impecables.
 *
 * ── QUÉ COMPRUEBA, Y POR QUÉ CADA COSA ────────────────────────────────────
 *
 * 1. Que se llega a la ficha **navegando desde la biblioteca**, pulsando una
 *    portada. No escribiendo la URL: si el enlace de la card se rompiera, un
 *    test que teclea la dirección seguiría en verde y la pantalla sería
 *    inalcanzable para una persona.
 * 2. Que **se pinta** con la CSP de producción, y que el título de la ficha es
 *    el de la card que se pulsó — o sea, que se abrió la ficha correcta.
 * 3. Que la portada sale de `/api/covers` y **ninguna petición de imagen sale
 *    a otro dominio**. Se comprueba interceptando la red, no leyendo el DOM: un
 *    `<img>` correcto y un `<link rel=preload>` al dominio de origen se ven
 *    igual en el HTML.
 * 4. Que un **uuid que no existe** responde **404 de verdad** —el código de
 *    estado, no un mensaje dentro de un 200— y que esa pantalla es usable.
 * 5. Que el anime **de otra persona** responde 404 **indistinguible** del
 *    inexistente. Es la comprobación de seguridad de esta pantalla
 *    (`security.md` §1): un 403, o un texto distinto, confirmaría que el
 *    recurso existe y permitiría enumerar el vault ajeno un uuid cada vez.
 * 6. Que **volver atrás** deja la biblioteca usable, y que **recargar** la
 *    ficha no la rompe.
 * 7. Que a **390 px** la portada va **a sangre** y no hay scroll horizontal.
 *
 * ── EL CASO «DEJAR EN BLANCO LO OPCIONAL» ─────────────────────────────────
 * La ficha **no tiene formulario**: es una pantalla de lectura. El caso que la
 * regla exige —y que se coló una vez en producción— se recorre por el camino
 * que la propia pantalla necesita: el test del anime ajeno **crea una cuenta
 * dejando el nombre EN BLANCO** y la envía, que es exactamente el campo
 * opcional que rompía el registro. Anotado en `SUPUESTOS.md`.
 *
 * ── UN SOLO LOGIN PARA TODO EL FICHERO ────────────────────────────────────
 * `security.md` §5 limita el login a **5 intentos / 15 min por email**. Un
 * login por test agotaría el cubo y el fichero fallaría por 429 en mitad de la
 * tanda, que se lee como un fallo de la pantalla. Se entra UNA vez en
 * `beforeAll`; `mode: "serial"` hace que el orden sea el que se lee.
 *
 * ── POR QUÉ LA CUENTA REAL Y NO UNA RECIÉN CREADA ─────────────────────────
 * Una cuenta nueva tiene el vault VACÍO: no hay biblioteca desde la que
 * navegar, ni portada que interceptar, ni ficha que pintar. Los 83 animes del
 * propietario —con sus 83 portadas— son el único juego de datos real que
 * existe. La cuenta nueva sí se usa donde su vacío es el punto: el 404 del
 * anime ajeno.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Playwright no carga `.env.local` (Next sí lo hace por su cuenta para la app).
cargarEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const EMAIL_PROPIETARIO = process.env.SEED_OWNER_EMAIL ?? "";
const PASSWORD_PROPIETARIO = process.env.SEED_OWNER_PASSWORD ?? "";

/** El origen del servidor bajo prueba. Fijado en `playwright.config.ts`. */
const ORIGEN = "http://127.0.0.1:3000";

/** Palabras con las que el navegador informa de que ha bloqueado algo. */
const AVISO_DE_BLOQUEO = /Content Security Policy|refused to (execute|load|apply|connect)/i;

/** Un uuid válido que no puede existir en ninguna base. */
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

const PASSWORD_DE_PRUEBA = "una frase larga y tranquila para el vault";

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------
// Ayudantes. Selectores por rol y nombre accesible, nunca por CSS frágil.
// ---------------------------------------------------------------------------

/** Entra por el formulario de verdad. Nada de fabricar la cookie. */
async function entrar(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /entrar al vault/i }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
}

/**
 * La portada de la ficha.
 *
 * Se localiza por su `src`, y no por rol ni por texto, **a propósito**: la
 * imagen lleva `alt=""` porque es decorativa —el título va en el `<h1>` justo
 * al lado y repetirlo lo diría dos veces en el lector de pantalla—, así que no
 * tiene nombre accesible por diseño. El `src` no es un selector frágil aquí:
 * es literalmente la invariante que se está comprobando.
 */
function portada(page: Page) {
  return page.locator('img[src^="/api/covers/"]').first();
}

/** La primera card de la biblioteca, y el título que muestra. */
async function primeraCardDeLaBiblioteca(page: Page): Promise<{ titulo: string }> {
  const card = page.getByRole("list", { name: "Tus series" }).getByRole("listitem").first();
  await expect(card).toBeVisible();

  const titulo = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
  expect(titulo.length, "la primera card no muestra título").toBeGreaterThan(0);

  return { titulo };
}

/** Pulsa la primera card y espera a estar en su ficha. */
async function abrirPrimeraFicha(page: Page): Promise<{ titulo: string; url: string }> {
  await page.goto("/app");
  const { titulo } = await primeraCardDeLaBiblioteca(page);

  await page
    .getByRole("list", { name: "Tus series" })
    .getByRole("listitem")
    .first()
    .getByRole("link")
    .first()
    .click();

  await expect(page).toHaveURL(/\/app\/anime\/[0-9a-f-]{36}$/i, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);

  return { titulo, url: page.url() };
}

// ---------------------------------------------------------------------------

test.describe("la ficha de un anime, usada por una persona", () => {
  let contexto: BrowserContext;
  let page: Page;

  /** El id del primer anime del vault, descubierto navegando. */
  let idDelAnime = "";

  test.beforeAll(async ({ browser }) => {
    expect(
      EMAIL_PROPIETARIO,
      "Falta SEED_OWNER_EMAIL en .env.local: sin la cuenta del propietario no hay ficha que abrir",
    ).not.toBe("");
    expect(PASSWORD_PROPIETARIO, "Falta SEED_OWNER_PASSWORD en .env.local").not.toBe("");

    contexto = await browser.newContext();
    page = await contexto.newPage();
    await entrarComoPropietario(page);
  });

  test.afterAll(async () => {
    await contexto.close();
  });

  test("SE LLEGA NAVEGANDO desde la biblioteca, y la ficha SE PINTA", async () => {
    const bloqueos: string[] = [];
    const escucha = (mensaje: { text: () => string }): void => {
      if (AVISO_DE_BLOQUEO.test(mensaje.text())) bloqueos.push(mensaje.text());
    };
    page.on("console", escucha);

    const { titulo, url } = await abrirPrimeraFicha(page);
    idDelAnime = url.split("/").pop() ?? "";

    // El contenido que la ficha SIEMPRE tiene, con o sin enriquecimiento.
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    await expect(portada(page)).toBeVisible();

    // La barra de progreso de la ficha (§05: 2 px). Existe siempre: cuando no
    // se conoce el avance se pinta la pista sola, que es lo que se sabe.
    await expect(page.getByRole("progressbar")).toBeVisible();

    // Las secciones del artboard, cada una con su estado —lleno o vacío—.
    await expect(page.getByRole("heading", { name: "Progreso" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Géneros y etiquetas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sinopsis" })).toBeVisible();

    // Y la vuelta a la biblioteca, que es la salida de esta pantalla.
    await expect(page.getByRole("navigation", { name: "Ruta" })).toBeVisible();

    page.off("console", escucha);
    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);

    expect(idDelAnime, "no se pudo leer el id de la ficha desde la URL").toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  test("LA PORTADA SALE DE /api/covers, y NINGUNA imagen sale a otro dominio", async () => {
    const imagenes: string[] = [];
    const escucha = (peticion: { resourceType: () => string; url: () => string }): void => {
      if (peticion.resourceType() === "image") imagenes.push(peticion.url());
    };
    page.on("request", escucha);

    // Se espera POR ESTADO —la respuesta de la portada—, no por un reloj.
    const respuestaPortada = page.waitForResponse((respuesta) =>
      respuesta.url().includes("/api/covers/"),
    );
    await page.goto(`/app/anime/${idDelAnime}`);
    const respuesta = await respuestaPortada;

    await expect(portada(page)).toBeVisible();
    page.off("request", escucha);

    // 1. El endpoint responde de verdad (200, o 304 si el navegador la tenía).
    expect([200, 304]).toContain(respuesta.status());

    // 2. NI UNA petición de imagen fuera de nuestro origen. Es lo que el DOM no
    //    puede demostrar: un preload al dominio original se vería idéntico.
    const foraneas = imagenes.filter((url) => !url.startsWith(ORIGEN));
    expect(foraneas, `imágenes pedidas a otro dominio: ${foraneas.join(", ")}`).toEqual([]);

    // 3. Y sí se pidió la portada: si `imagenes` estuviera vacío, el punto 2
    //    pasaría por no haber mirado nada.
    const portadas = imagenes.filter((url) => url.includes("/api/covers/"));
    expect(portadas.length).toBeGreaterThan(0);

    // 4. Con su `?v=<checksum>`: la respuesta es `immutable` durante un año, así
    //    que sin el checksum en la URL un cambio de portada no se vería nunca.
    expect(
      portadas.some((url) => url.includes(`/api/covers/${idDelAnime}?v=`)),
      `la portada se pidió sin ?v=: ${portadas.join(", ")}`,
    ).toBe(true);

    // 5. Y el `src` del DOM apunta a nuestro endpoint, no al dominio de origen.
    await expect(portada(page)).toHaveAttribute("src", new RegExp(`^/api/covers/${idDelAnime}`));
  });

  test("LA ACCIÓN PRIMARIA enseña su estado «sin enlaces», que hoy es el único", async () => {
    await page.goto(`/app/anime/${idDelAnime}`);

    // `continue_link` está VACÍA en la base: `enlaceMasReciente()` devuelve
    // `null` para los 83 animes, así que este es el estado que ve el dueño del
    // vault, no un caso de borde. El día que existan enlaces, esta aserción
    // pasa a comprobar el botón dorado de «Continuar viendo».
    await expect(page.getByText("Sin enlaces para continuar.")).toBeVisible();

    // Y NO se pinta una acción que no lleva a ninguna parte.
    await expect(page.getByRole("link", { name: /continuar viendo/i })).toHaveCount(0);
  });

  test("RECARGAR la ficha no la rompe", async () => {
    const { titulo } = await abrirPrimeraFicha(page);
    const url = page.url();

    await page.reload();

    expect(page.url()).toBe(url);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    await expect(portada(page)).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("VOLVER ATRÁS deja la biblioteca usable", async () => {
    const { titulo } = await abrirPrimeraFicha(page);

    await page.goBack();

    // El botón de atrás sirve el HTML de la caché, y ahí es donde una pantalla
    // mal hidratada se queda inerte: se ve, pero no responde.
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tu biblioteca" })).toBeVisible();

    // «Usable» no es «visible»: se vuelve a pulsar y tiene que navegar otra vez.
    await page
      .getByRole("list", { name: "Tus series" })
      .getByRole("listitem")
      .first()
      .getByRole("link")
      .first()
      .click();

    await expect(page).toHaveURL(/\/app\/anime\/[0-9a-f-]{36}$/i);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
  });

  test("EQUIVOCARSE: un uuid que NO EXISTE responde 404, y el 404 es usable", async () => {
    const respuesta = await page.goto(`/app/anime/${UUID_INEXISTENTE}`);

    // El CÓDIGO DE ESTADO, no un mensaje dentro de un 200. Es la diferencia
    // entre un 404 de verdad y un `return null` con cara de error.
    expect(respuesta?.status(), "la ficha inexistente no respondió 404").toBe(404);

    await expect(page.getByRole("heading", { level: 1, name: "Aquí no hay nada" })).toBeVisible();

    // Y se puede salir: una pantalla de error sin salida deja al usuario con el
    // botón de atrás como única herramienta.
    await page.getByRole("link", { name: "Volver a la biblioteca" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tu biblioteca" })).toBeVisible();
  });

  /**
   * Sin parsear el parámetro de ruta, Postgres responde «invalid input syntax
   * for type uuid» y eso sube como **500**: la pantalla de error genérica en
   * vez del 404 usable, y una traza del driver en los logs por cada visita de
   * un bot a una dirección inventada.
   *
   * Un caso por test —el equivalente a `it.each`—, no un bucle dentro de uno:
   * si falla, el informe dice cuál.
   */
  for (const basura of ["no-es-un-uuid", "123", "%27%20OR%201=1--"]) {
    test(`EQUIVOCARSE: «${basura}» en vez de un uuid responde 404, NO un 500`, async () => {
      const respuesta = await page.goto(`/app/anime/${basura}`);

      expect(respuesta?.status(), `«${basura}» no respondió 404`).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Aquí no hay nada" })).toBeVisible();
    });
  }

  test("A 390 px la PORTADA VA A SANGRE y no hay scroll horizontal", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/anime/${idDelAnime}`);
    await expect(portada(page)).toBeVisible();

    const medidas = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      visible: document.documentElement.clientWidth,
    }));

    expect(
      medidas.scroll,
      `la ficha desborda ${String(medidas.scroll - medidas.visible)} px a 390`,
    ).toBeLessThanOrEqual(medidas.visible);

    // «A sangre» (§12) significa que la portada toca los dos bordes: se sale
    // del padding lateral de 20 px con un margen negativo del mismo tamaño. Si
    // alguien cambiara el padding y olvidara el margen, la imagen quedaría
    // encajonada y esto lo vería.
    const caja = await portada(page).boundingBox();
    expect(caja, "no se pudo medir la portada").not.toBeNull();
    expect(caja?.x ?? 99, "la portada no llega al borde izquierdo").toBeLessThanOrEqual(1);
    expect(caja?.width ?? 0, "la portada no ocupa el ancho de la pantalla").toBeGreaterThanOrEqual(
      medidas.visible - 1,
    );

    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe("la ficha de OTRA persona", () => {
  /**
   * LA COMPROBACIÓN DE SEGURIDAD DE ESTA PANTALLA.
   *
   * `vault.obtener()` devuelve `null` tanto si el anime no existe como si es de
   * otro usuario, y los dos casos tienen que ser **indistinguibles desde
   * fuera**: mismo código de estado y misma pantalla. Un 403 —o un texto
   * distinto para cada caso, que es la misma fuga escrita en español—
   * confirmaría que el recurso existe, y con eso se enumera el vault ajeno un
   * uuid cada vez (`security.md` §1).
   *
   * Este test entra por el CAMINO REAL: navegador, cookie de verdad emitida por
   * el servidor, middleware, `auth()` y la consulta real. No fabrica la sesión
   * ni llama a la función directamente.
   *
   * VERIFICADO POR MUTACIÓN (2026-08-24): quitando `mias()` del `WHERE` de
   * `vault.obtener` —o devolviendo el anime sin filtrar por `user_id`—, este
   * test se pone en rojo: la cuenta nueva vería la ficha del propietario. Es la
   * mutación que hay que repetir si alguien toca `src/lib/db/vault.ts`.
   */
  test("responde 404 IGUAL que uno que no existe: no se distingue", async ({ browser }) => {
    // ── 1. Como propietario, se averigua el id de un anime SUYO ───────────
    const contextoDueno = await browser.newContext();
    const paginaDueno = await contextoDueno.newPage();

    await entrarComoPropietario(paginaDueno);
    const { url } = await abrirPrimeraFicha(paginaDueno);
    const idAjeno = url.split("/").pop() ?? "";

    expect(idAjeno).toMatch(/^[0-9a-f-]{36}$/i);
    await contextoDueno.close();

    // ── 2. Una cuenta nueva, creada por el formulario de verdad ───────────
    const contextoIntruso = await browser.newContext();
    const intruso = await contextoIntruso.newPage();
    const email = `ficha-${randomUUID().slice(0, 8)}@ejemplo.test`;

    await intruso.goto("/registro");
    await intruso.getByLabel("Correo").fill(email);
    await intruso.getByLabel("Contraseña", { exact: false }).fill(PASSWORD_DE_PRUEBA);
    // EL NOMBRE SE DEJA EN BLANCO A PROPÓSITO: es el campo opcional, es lo que
    // hace la mayoría, y es exactamente el caso que rompió el registro en
    // producción («EsquemaNombre convertía "" en null»). La ficha no tiene
    // formulario propio, así que este es el envío con lo opcional vacío que
    // pide `testing.md`.
    await intruso.getByRole("button", { name: /crear mi vault/i }).click();
    await expect(intruso.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });

    await entrar(intruso, email, PASSWORD_DE_PRUEBA);

    // ── 3. Pide la ficha del propietario ─────────────────────────────────
    const respuestaAjena = await intruso.goto(`/app/anime/${idAjeno}`);

    expect(respuestaAjena?.status(), "el anime ajeno NO respondió 404").toBe(404);
    // Y desde luego no un 403, que confirmaría que existe.
    expect(respuestaAjena?.status()).not.toBe(403);

    const textoAjena = (await intruso.locator("main").innerText()).trim();
    const tituloAjena = await intruso.title();

    // ── 4. Y la MISMA pantalla que un uuid inexistente ───────────────────
    const respuestaInexistente = await intruso.goto(`/app/anime/${UUID_INEXISTENTE}`);
    expect(respuestaInexistente?.status()).toBe(404);

    const textoInexistente = (await intruso.locator("main").innerText()).trim();
    const tituloInexistente = await intruso.title();

    // Si estos dos textos se separaran, quien sabe leer distinguiría «existe
    // pero no es tuyo» de «no existe», que es justo lo que no puede pasar.
    expect(textoAjena, "el 404 del anime ajeno NO es idéntico al del inexistente").toBe(
      textoInexistente,
    );
    expect(
      textoAjena.length,
      "el 404 se pintó vacío: la comparación no prueba nada",
    ).toBeGreaterThan(0);

    // Ni el título de la pestaña puede delatarlo. Se comparan entre sí en vez
    // de contra un literal: lo que importa es que sean EL MISMO, no cuál.
    expect(tituloAjena, "el título de la pestaña distingue los dos casos").toBe(tituloInexistente);

    await contextoIntruso.close();
  });
});
