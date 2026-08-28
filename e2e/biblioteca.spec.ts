import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

import config from "../playwright.config";
import { config as cargarEnv } from "dotenv";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — LA BIBLIOTECA EN REJILLA (artboard 03).
 *
 * Chromium, contra `build` + `start`, y **sin `bypassCSP`**.
 * `.claude/rules/testing.md` § «Ninguna pantalla está terminada sin un
 * RECORRIDO EN NAVEGADOR»: es el único nivel que ejercita la aplicación entera
 * —red, CSP, hidratación, el viaje de ida y vuelta de los datos— y el que
 * destapó que la aplicación se servía en blanco con la política puesta.
 *
 * ── QUÉ COMPRUEBA, Y POR QUÉ CADA COSA ────────────────────────────────────
 *
 * 1. Que la rejilla **se pinta** con la CSP de producción.
 * 2. Que **todas** las portadas salen de `/api/covers` y **ninguna petición de
 *    imagen sale a otro dominio**. Es la invariante del proyecto: la URL que
 *    pegó el usuario es solo el origen; los bytes viven en Postgres. Se
 *    comprueba interceptando la red, no leyendo el HTML: un `<img>` correcto y
 *    un `<link rel=preload>` al dominio de origen se verían igual en el DOM.
 * 3. Que los chips **filtran de verdad** y que la URL cambia con ellos.
 * 4. Que el **botón de atrás** devuelve el filtro anterior — la consecuencia de
 *    que el filtro viva en la URL y no en `useState`.
 * 5. Que **recargar** con el filtro puesto lo mantiene.
 * 6. Que un filtro **sin resultados** tiene su propio vacío, distinto del de un
 *    vault sin animes: decirle «tu vault está vacío» a quien acaba de leer «83
 *    series» es hacerle creer que ha perdido sus datos.
 * 7. Que a **390 px** no hay scroll horizontal.
 * 8. Que una **URL con basura** no rompe la pantalla. Es el «equivocarse» de
 *    esta pantalla, que no tiene formulario: lo que aquí escribe cualquiera es
 *    la dirección.
 *
 * ── UN SOLO LOGIN PARA TODO EL FICHERO ────────────────────────────────────
 * `security.md` §5 limita el login a **5 intentos / 15 min por email**. Ocho
 * tests con su login agotarían el cubo y el fichero fallaría por 429 en mitad
 * de la tanda, que se lee como un fallo de la pantalla. Se entra UNA vez en
 * `beforeAll` y se comparte la pestaña; `mode: "serial"` hace que el orden sea
 * el que se lee.
 *
 * ── POR QUÉ LA CUENTA REAL Y NO UNA RECIÉN CREADA ─────────────────────────
 * Una cuenta nueva tiene el vault VACÍO, y entonces no hay rejilla que pintar,
 * ni portadas que interceptar, ni recuentos que comprobar. Los 83 animes del
 * propietario —con sus 83 portadas— son el único juego de datos real que
 * existe. El vacío de un vault sin animes sí se prueba con una cuenta nueva,
 * al final del fichero, que es donde ese caso vive de verdad.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Playwright no carga `.env.local` (Next sí lo hace por su cuenta para la app).
cargarEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const EMAIL_PROPIETARIO = process.env.SEED_OWNER_EMAIL ?? "";
const PASSWORD_PROPIETARIO = process.env.SEED_OWNER_PASSWORD ?? "";

/**
 * El origen del servidor bajo prueba.
 *
 * Sale de `baseURL` en vez de estar escrito a mano. Estuvo fijado a
 * `127.0.0.1` y, al cambiar la suite a `localhost` —porque es como se
 * identifica la app y la guarda CSRF rechazaba lo demás—, este test empezó a
 * marcar **nuestras propias portadas** como «pedidas a otro dominio».
 *
 * Un test que sabe la dirección del servidor por su cuenta miente en cuanto la
 * dirección cambia, y encima lo hace en la forma más alarmante posible.
 */
const ORIGEN = new URL(config.use?.baseURL ?? "http://localhost:3000").origin;

/** Las cinco etiquetas de estado, tal cual se leen en los chips. */
const ETIQUETAS_DE_ESTADO = ["Visto", "Viendo", "En espera", "Abandonado", "Pendiente"] as const;

/** Palabras con las que el navegador informa de que ha bloqueado algo. */
const AVISO_DE_BLOQUEO = /Content Security Policy|refused to (execute|load|apply|connect)/i;

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------
// Ayudantes. Selectores por rol y nombre accesible, nunca por CSS frágil.
// ---------------------------------------------------------------------------

function barraDeFiltros(page: Page) {
  return page.getByRole("navigation", { name: "Filtros de la biblioteca" });
}

function chip(page: Page, etiqueta: string) {
  return barraDeFiltros(page).getByRole("link", { name: new RegExp(`^${etiqueta}\\b`, "i") });
}

function tarjetas(page: Page) {
  return page.getByRole("list", { name: "Tus series" }).getByRole("listitem");
}

/** El contador de la cabecera: «83 de 83 series». */
function contador(page: Page) {
  return page
    .locator("p")
    .filter({ hasText: /^\d+ de \d+ series?$/ })
    .first();
}

/** El recuento que muestra un chip, leído de la propia pantalla. */
async function recuentoDeChip(page: Page, etiqueta: string): Promise<number> {
  const texto = (await chip(page, etiqueta).innerText()).trim();
  const capturado = /(\d+)\s*$/.exec(texto)?.[1];

  if (capturado === undefined) {
    throw new Error(`El chip «${etiqueta}» no muestra recuento. Texto leído: «${texto}»`);
  }
  return Number(capturado);
}

/** Entra por el formulario de verdad. Nada de fabricar la cookie. */
async function entrar(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /entrar al vault/i }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
}

/**
 * El primer estado cuyo chip cumple una condición, leído de la pantalla.
 *
 * Evita clavar «Abandonado» en el test: el día que el vault tenga un abandonado,
 * un test que diera por hecho que ese chip está a 0 fallaría sin que nada esté
 * roto. Lo que se afirma aquí es la RELACIÓN entre el chip y la rejilla.
 */
async function primerEstadoCon(page: Page, cumple: (n: number) => boolean): Promise<string> {
  for (const etiqueta of ETIQUETAS_DE_ESTADO) {
    if (cumple(await recuentoDeChip(page, etiqueta))) return etiqueta;
  }
  throw new Error("Ningún chip de estado cumple la condición: revisa los datos de desarrollo");
}

/** «En espera» → `EN_ESPERA`, que es lo que viaja en la URL. */
function etiquetaAEstado(etiqueta: string): string {
  return etiqueta.toUpperCase().replace(/\s+/g, "_");
}

// ---------------------------------------------------------------------------

test.describe("la biblioteca, usada por una persona", () => {
  let contexto: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    expect(
      EMAIL_PROPIETARIO,
      "Falta SEED_OWNER_EMAIL en .env.local: sin la cuenta del propietario no hay animes que pintar",
    ).not.toBe("");
    expect(PASSWORD_PROPIETARIO, "Falta SEED_OWNER_PASSWORD en .env.local").not.toBe("");

    contexto = await browser.newContext();
    page = await contexto.newPage();
    await entrarComoPropietario(page);
  });

  test.afterAll(async () => {
    await contexto.close();
  });

  test("LA REJILLA SE PINTA con la CSP de producción puesta", async () => {
    const bloqueos: string[] = [];
    const escucha = (mensaje: { text: () => string }): void => {
      if (AVISO_DE_BLOQUEO.test(mensaje.text())) bloqueos.push(mensaje.text());
    };
    page.on("console", escucha);

    await page.goto("/app");

    // Si la CSP bloqueara los scripts de Next, React vaciaría el árbol y estas
    // aserciones se caerían a la vez.
    await expect(page.getByRole("heading", { level: 1, name: "Tu biblioteca" })).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(barraDeFiltros(page)).toBeVisible();

    // Hay rejilla y tiene cards de verdad, no un hueco.
    await expect(page.getByRole("list", { name: "Tus series" })).toBeVisible();
    expect(await tarjetas(page).count()).toBeGreaterThan(0);

    page.off("console", escucha);
    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);
  });

  test("el CONTADOR y los RECUENTOS de los chips dicen la verdad", async () => {
    await page.goto("/app");

    const total = await recuentoDeChip(page, "Todos");
    expect(total).toBeGreaterThan(0);

    // Sin filtro se ven todas: «N de N series» y N cards.
    await expect(contador(page)).toHaveText(`${String(total)} de ${String(total)} series`);
    await expect(tarjetas(page)).toHaveCount(total);

    // Y los recuentos por estado suman el total: si no, un chip miente.
    let suma = 0;
    for (const etiqueta of ETIQUETAS_DE_ESTADO) {
      suma += await recuentoDeChip(page, etiqueta);
    }
    expect(suma).toBe(total);
  });

  test("LAS PORTADAS SALEN DE /api/covers, y NINGUNA imagen sale a otro dominio", async ({
    browser,
  }) => {
    // ── PESTAÑA CON LA CACHÉ FRÍA, NO OTRO LOGIN ──────────────────────────
    // `/api/covers` responde `immutable` durante un año, así que en la pestaña
    // compartida —que ya ha estado en `/app`— las portadas saldrían de la caché
    // del navegador y NO habría una sola petición de red que interceptar: el
    // test pasaría sin haber mirado nada, o se quedaría esperando una respuesta
    // que no llega. Un contexto nuevo con las MISMAS cookies nace con la caché
    // vacía y no gasta un intento del limitador de login.
    const contextoFrio = await browser.newContext({ storageState: await contexto.storageState() });
    const fria = await contextoFrio.newPage();

    const imagenes: string[] = [];
    fria.on("request", (peticion) => {
      if (peticion.resourceType() === "image") imagenes.push(peticion.url());
    });

    // Se espera POR ESTADO —la primera respuesta de portada—, no por un reloj.
    const primeraPortada = fria.waitForResponse((respuesta) =>
      respuesta.url().includes("/api/covers/"),
    );
    await fria.goto("/app");
    const respuesta = await primeraPortada;

    await expect(fria.getByRole("list", { name: "Tus series" })).toBeVisible();

    // 1. El endpoint responde de verdad (200, o 304 si el navegador ya la tenía).
    expect([200, 304]).toContain(respuesta.status());

    // 2. NI UNA petición de imagen fuera de nuestro origen. Es la comprobación
    //    que el `<img>` del DOM no puede dar: un preload al dominio original se
    //    vería idéntico en el HTML.
    const foraneas = imagenes.filter((url) => !url.startsWith(ORIGEN));
    expect(foraneas, `imágenes pedidas a otro dominio: ${foraneas.join(", ")}`).toEqual([]);

    // 3. Y sí se pidieron portadas: si `imagenes` estuviera vacío, el punto 2
    //    pasaría por no haber mirado nada.
    const portadas = imagenes.filter((url) => url.includes("/api/covers/"));
    expect(portadas.length).toBeGreaterThan(0);

    // 4. El `?v=<checksum>` de la URL versionada. Sin él, la respuesta
    //    `immutable` a un año dejaría la portada vieja para siempre.
    expect(portadas.some((url) => url.includes("?v="))).toBe(true);

    // 5. Y en el DOM, todos los `src` apuntan a nuestro endpoint.
    const fuentes = await fria
      .getByRole("list", { name: "Tus series" })
      .locator("img")
      .evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute("src") ?? ""));

    expect(fuentes.length).toBeGreaterThan(0);
    expect(fuentes.filter((src) => !src.startsWith("/api/covers/"))).toEqual([]);

    await contextoFrio.close();
  });

  test("FILTRAR con un chip cambia el resultado Y la URL", async () => {
    await page.goto("/app");
    const total = await recuentoDeChip(page, "Todos");

    // Se elige un estado que SÍ tenga animes, leyéndolo de la pantalla: así el
    // test no depende de cómo esté el vault el día que se ejecute.
    const conAnimes = await primerEstadoCon(page, (n) => n > 0);
    const esperados = await recuentoDeChip(page, conAnimes);

    await chip(page, conAnimes).click();

    // La URL lleva el filtro: la vista se comparte pegando la dirección.
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(conAnimes)}`));
    await expect(tarjetas(page)).toHaveCount(esperados);
    await expect(contador(page)).toHaveText(`${String(esperados)} de ${String(total)} series`);
  });

  test("LAS BARRAS DE PROGRESO tienen relleno: el dato de la base llega a la pantalla", async () => {
    // ── QUÉ ESTÁ PROTEGIENDO ESTE TEST ────────────────────────────────────
    //
    // Las tres pantallas pintaban la barra con `porcentaje={null}` escrito a
    // mano. La regla que calcula el relleno existía, estaba testeada y aplicaba
    // la tabla de la skill §4 entera… y nadie la llamaba con datos: vivía en la
    // carpeta de la ficha, así que la rejilla y la lista no podían importarla.
    //
    // Mientras tanto `progress` tenía 83 filas —69 COMPLETO— y `vault.listar()`
    // ya devolvía los seis campos necesarios. O sea que 69 de 83 barras tenían
    // que estar llenas y estaban vacías, en las tres pantallas a la vez.
    //
    // Ningún test lo veía porque todos comprobaban que la barra SE PINTA, no
    // que diga algo. Este mira el ancho del relleno, que es el dato.
    await page.goto("/app");
    await expect(page.getByRole("list", { name: "Tus series" })).toBeVisible();

    const conRelleno = await page.evaluate(() =>
      [...document.querySelectorAll("[style*='width']")]
        .map((elemento) => (elemento as HTMLElement).style.width)
        .filter((ancho) => ancho !== "" && ancho !== "0%"),
    );

    expect(
      conRelleno.length,
      "ninguna barra tiene relleno: alguien ha vuelto a pasar porcentaje={null}",
    ).toBeGreaterThan(0);

    // Un COMPLETO es 100 %, no «casi». Si esto empezara a dar 99 % o 33 %,
    // sería que la fracción se está calculando donde debería devolver el tope.
    expect(conRelleno).toContain("100%");
  });

  test("DOS CLICS SEGUIDOS: el segundo filtro también entra", async () => {
    // ── EL TEST QUE CERRÓ EL DEBATE DEL ESQUELETO ─────────────────────────
    //
    // Esta pantalla no tiene esqueleto de carga porque ninguna frontera de
    // Suspense puede vivir sobre ella: ni un `loading.tsx` de segmento ni uno
    // interno. Con cualquiera de los dos, `router.push()` al mismo pathname con
    // distinta query deja de sincronizar la URL.
    //
    // Con el `loading.tsx` fallaba desde el PRIMER clic, y por eso se vio
    // pronto. Con un `<Suspense>` interno el primer clic funciona y **falla el
    // segundo**, que es un fallo mucho más caro: parece que va, y deja de ir
    // cuando alguien filtra por dos estados seguidos. Medido 3/3 en las dos
    // configuraciones antes de decidir.
    //
    // Por eso este test pulsa DOS veces. Uno solo dejaba pasar el fallo.
    await page.goto("/app");
    await expect(page.getByRole("list", { name: "Tus series" })).toBeVisible();

    const primero = await primerEstadoCon(page, (n) => n > 0);
    const segundo = await primerEstadoCon(page, (n) => n === 0);

    await chip(page, primero).click();
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(primero)}`));

    await chip(page, segundo).click();

    // Las facetas se ACUMULAN: los dos estados en la URL, no el último.
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(primero)}`));
    await expect(
      page,
      "el segundo clic no entró: alguien ha vuelto a poner un Suspense sobre esta ruta",
    ).toHaveURL(new RegExp(`estado=${etiquetaAEstado(segundo)}`));
  });

  test("FILTRAR NO RECARGA LA PÁGINA: cero navegaciones de documento", async () => {
    // ── POR QUÉ ESTE TEST EXISTE ──────────────────────────────────────────
    //
    // Durante un tiempo los chips fueron `<a>` normales, porque con `<Link>`
    // no navegaban. Funcionaba, pero cada filtro costaba una **recarga
    // completa de página**: documento, JS, y otra vez las 83 portadas. En el
    // control que más se usa de la pantalla.
    //
    // La causa era `loading.tsx` en el segmento —está contada en
    // `src/app/app/sin-loading.test.ts`—, no el elemento. Quitado el fichero,
    // los `<Link>` volvieron y esto es lo que lo mantiene así: si alguien
    // reintroduce una frontera de carga, los chips volverán a «funcionar»
    // recargando, la pantalla se sentirá lenta, y ningún test de los otros lo
    // notaría porque el resultado final es el mismo.
    //
    // Se cuentan peticiones de DOCUMENTO, no de datos: una navegación de
    // cliente pide su carga RSC y eso está bien; lo que no puede volver a
    // pasar es pedir el HTML entero.
    await page.goto("/app");

    const documentos: string[] = [];
    page.on("request", (peticion) => {
      if (peticion.isNavigationRequest()) documentos.push(peticion.url());
    });

    const conAnimes = await primerEstadoCon(page, (n) => n > 0);
    const esperadas = await recuentoDeChip(page, conAnimes);

    await chip(page, conAnimes).click();
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(conAnimes)}`));
    await expect(tarjetas(page)).toHaveCount(esperadas);

    expect(
      documentos,
      "filtrar recargó el documento entero: alguien ha vuelto a meter un loading.tsx",
    ).toEqual([]);

    // Y volver atrás tampoco recarga.
    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    expect(documentos, "volver atrás recargó el documento entero").toEqual([]);
  });

  test("VOLVER ATRÁS devuelve el filtro anterior", async () => {
    await page.goto("/app");

    const primero = await primerEstadoCon(page, (n) => n > 0);
    const segundo = await primerEstadoCon(page, (n) => n === 0);

    // Mismo motivo que en «RECARGAR con el filtro puesto»: el número sale del
    // recuento del chip y se afirma con `toHaveCount`, que reintenta. Un
    // `count()` aquí pasaba por suerte —carrera con la carga de página—, y una
    // prueba que pasa por suerte falla el día que la máquina va más cargada.
    const conElPrimero = await recuentoDeChip(page, primero);

    await chip(page, primero).click();
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(primero)}`));
    await expect(tarjetas(page)).toHaveCount(conElPrimero);

    // Las facetas se acumulan: ahora la URL lleva los dos estados.
    await chip(page, segundo).click();
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(segundo)}`));

    await page.goBack();

    // Y el botón de atrás devuelve exactamente el filtro anterior. Con el
    // filtro en `useState` esto habría vuelto a la pantalla sin filtrar.
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(primero)}`));
    await expect(page).not.toHaveURL(new RegExp(`estado=${etiquetaAEstado(segundo)}`));
    await expect(tarjetas(page)).toHaveCount(conElPrimero);
  });

  test("RECARGAR con el filtro puesto lo mantiene", async () => {
    await page.goto("/app");

    const conAnimes = await primerEstadoCon(page, (n) => n > 0);

    // ── EL NÚMERO SALE DEL CHIP, NO DE UN `count()` ─────────────────────
    //
    // La primera versión hacía `await tarjetas(page).count()` justo después de
    // pulsar el chip. `count()` es una **foto sin reintento**, y los chips son
    // anclas normales —ver `barra-filtros.tsx`—, así que pulsar uno provoca una
    // carga de página COMPLETA: la foto salía **0** porque la rejilla nueva
    // todavía no existía. Luego la recarga sí daba tiempo, salían 83, y el test
    // fallaba con «esperaba 0, recibí 83», que se lee como si recargar hubiera
    // PERDIDO el filtro. Era justo al revés.
    //
    // Tomando el número del recuento del chip —que es dato del servidor— y
    // afirmando con `toHaveCount`, que SÍ reintenta, la comprobación además se
    // vuelve más fuerte: ya no dice «tantas como antes», dice «tantas como el
    // chip promete».
    const esperadas = await recuentoDeChip(page, conAnimes);

    await chip(page, conAnimes).click();
    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(conAnimes)}`));
    await expect(tarjetas(page)).toHaveCount(esperadas);

    const url = page.url();

    await page.reload();

    expect(page.url()).toBe(url);
    await expect(tarjetas(page)).toHaveCount(esperadas);
    // Y el chip sigue en su sitio: lo que lo marca sale de la URL, no de memoria.
    await expect(chip(page, conAnimes)).toBeVisible();
  });

  test("UN FILTRO SIN RESULTADOS tiene su propio vacío, y no dice que el vault esté vacío", async () => {
    await page.goto("/app");

    const total = await recuentoDeChip(page, "Todos");
    const sinAnimes = await primerEstadoCon(page, (n) => n === 0);

    await chip(page, sinAnimes).click();

    await expect(page).toHaveURL(new RegExp(`estado=${etiquetaAEstado(sinAnimes)}`));
    await expect(page.getByRole("heading", { name: "Ninguna serie coincide" })).toBeVisible();

    // El contador sigue diciendo cuántas hay EN TOTAL: nada se ha perdido.
    await expect(contador(page)).toHaveText(`0 de ${String(total)} series`);

    // Y NO se dice lo del vault vacío, que sería mentira y daría un susto.
    await expect(page.getByText("Tu vault está vacío")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Tus series" })).toHaveCount(0);

    // La salida existe y funciona.
    await page.getByRole("link", { name: "Quitar los filtros" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(tarjetas(page)).toHaveCount(total);
  });

  test("EQUIVOCARSE: una URL con basura no rompe la pantalla", async () => {
    // Lo que en esta pantalla escribe cualquiera es la dirección. Un
    // `searchParams` inválido no puede tumbar la biblioteca.
    await page.goto("/app?estado=DROP%20TABLE%20anime&estado=visto&favorito=quiz%C3%A1&pagina=-1");

    await expect(page.getByRole("heading", { level: 1, name: "Tu biblioteca" })).toBeVisible();

    const total = await recuentoDeChip(page, "Todos");
    await expect(tarjetas(page)).toHaveCount(total);
    await expect(contador(page)).toHaveText(`${String(total)} de ${String(total)} series`);
  });

  test("A 390 px NO hay scroll horizontal", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await expect(page.getByRole("list", { name: "Tus series" })).toBeVisible();

    const ancho = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      visible: document.documentElement.clientWidth,
    }));

    expect(
      ancho.scroll,
      `la página desborda ${String(ancho.scroll - ancho.visible)} px a 390`,
    ).toBeLessThanOrEqual(ancho.visible);

    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe("la biblioteca de un vault recién creado", () => {
  test("VACÍO DE VAULT: una cuenta nueva ve el vacío, no una rejilla rota", async ({ browser }) => {
    const contextoNuevo = await browser.newContext();
    const nueva = await contextoNuevo.newPage();

    const email = `biblioteca-${randomUUID().slice(0, 8)}@ejemplo.test`;
    const password = "una frase larga y tranquila para el vault";

    await nueva.goto("/registro");
    await nueva.getByLabel("Correo").fill(email);
    await nueva.getByLabel("Contraseña", { exact: false }).fill(password);
    // El NOMBRE se deja EN BLANCO a propósito: es opcional, es lo que hace la
    // mayoría, y es exactamente el caso que se coló en producción una vez
    // (`testing.md` § «Ninguna pantalla está terminada…»).
    await nueva.getByRole("button", { name: /crear mi vault/i }).click();
    await expect(nueva.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });

    await entrar(nueva, email, password);

    // El vacío que corresponde: sin animes, no sin filtro.
    await expect(nueva.getByRole("heading", { name: "Tu vault está vacío" })).toBeVisible();
    await expect(nueva.getByText("0 de 0 series")).toBeVisible();
    await expect(nueva.getByRole("list", { name: "Tus series" })).toHaveCount(0);

    // Los chips siguen ahí, todos a 0: el filtro no desaparece por estar vacío.
    await expect(barraDeFiltros(nueva)).toBeVisible();

    // Y recargar no lo rompe.
    await nueva.reload();
    await expect(nueva.getByRole("heading", { name: "Tu vault está vacío" })).toBeVisible();

    await contextoNuevo.close();
  });
});
