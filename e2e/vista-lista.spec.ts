import { randomUUID } from "node:crypto";
import { liberarLimiteDeRegistro } from "./ayuda-recuperacion";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";
import { config as cargarEnv } from "dotenv";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — LA VISTA LISTA (artboard 04), en Chromium y contra
 * el build de producción.
 *
 * `.claude/rules/testing.md` § «Ninguna pantalla está terminada sin un
 * RECORRIDO EN NAVEGADOR». No es una comprobación más: es el único nivel que
 * ejercita la aplicación entera —red, CSP, hidratación de React, el viaje de
 * ida y vuelta de los datos— y es donde aparecen los fallos que todo lo demás
 * deja pasar.
 *
 * **Sin `bypassCSP`, y no es negociable.** El peor fallo del proyecto fue una
 * CSP que servía la aplicación EN BLANCO con el build a 0 y las cabeceras
 * impecables. Un spec que desactiva la política deja de ver exactamente eso.
 *
 * ── POR QUÉ EL RECORRIDO LARGO ES UN SOLO TEST ────────────────────────────
 *
 * Porque cada `test` de Playwright abre un contexto limpio, y eso significa
 * **un login más**. El login está limitado a 5 intentos / 15 min por correo
 * (`security.md` §5, `LIMITES["login:email"]`), así que trocear el recorrido en
 * seis tests haría que la propia suite se autobloqueara al segundo intento del
 * día. Un recorrido —entrar, mirar, ordenar, volver, recargar, filtrar,
 * estrechar la ventana— es además lo que hace una persona: en ese orden y sin
 * volver a entrar entre paso y paso.
 *
 * Los pasos van en `test.step`, así que el informe dice cuál falló.
 *
 * ── DE DÓNDE SALEN LOS DATOS ──────────────────────────────────────────────
 *
 * De la cuenta sembrada (`npm run seed`), cuyas credenciales están en
 * `.env.local`. **No hay otra forma hoy**: la pantalla de añadir un anime es el
 * artboard 06 y todavía no existe, así que un usuario recién registrado no
 * puede tener ni una serie por ningún camino de la interfaz. Si esas variables
 * no están, el recorrido con datos se salta y se dice por qué; lo que NO
 * depende de los datos —el vacío, el registro, la protección de la ruta— se
 * comprueba igual. Anotado en `SUPUESTOS.md`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Playwright no carga `.env.local`; Vitest sí lo hace en su config. Sin esto,
// las credenciales del vault sembrado no existen y el recorrido con datos se
// saltaría siempre en local, que es donde más falta hace.
cargarEnv({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

const PROPIETARIO = process.env.SEED_OWNER_EMAIL ?? "";
const CLAVE_PROPIETARIO = process.env.SEED_OWNER_PASSWORD ?? "";
const HAY_VAULT_SEMBRADO = PROPIETARIO !== "" && CLAVE_PROPIETARIO !== "";

const MOTIVO_SIN_DATOS =
  "Falta SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD en .env.local: sin el vault sembrado " +
  "no hay ninguna serie que listar, y la app todavía no tiene pantalla para añadir una " +
  "(artboard 06). Ejecuta `npm run seed`.";

const CLAVE_NUEVA = "una frase larga y tranquila para el vault";

/** Palabras con las que el navegador informa de que ha bloqueado algo. */
const AVISO_DE_BLOQUEO = /Content Security Policy|refused to (execute|load|apply|connect)/i;

/**
 * El favicon no es una portada. Chromium headless normalmente ni lo pide, pero
 * si lo pidiera lo clasifica como imagen y ensuciaría la comprobación de que
 * **todas** las imágenes salen de `/api/covers`.
 */
const ES_FAVICON = /\/favicon\.ico(\?|$)/;

async function entrar(pagina: Page, email: string, clave: string): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel("Correo").fill(email);
  await pagina.getByLabel("Contraseña", { exact: false }).fill(clave);
  await pagina.getByRole("button", { name: /entrar al vault/i }).click();

  // Es la comprobación de que la cadena entera está enchufada: Server Action →
  // `signIn` → `authorize` → Argon2id → JWT → middleware → `/app`.
  await expect(pagina).toHaveURL(/\/app/, { timeout: 20_000 });
}

/** Los títulos de la tabla, en el orden en que se ven. */
function titulosDeLaTabla(pagina: Page): Promise<string[]> {
  // `rowheader` son exactamente las celdas de título: el título es la CABECERA
  // DE FILA (`<th scope="row">`). Nada de `nth-child`, que se rompe en cuanto
  // una columna se cae por breakpoint.
  return pagina.getByRole("rowheader").allInnerTexts();
}

test.describe("la vista lista, usada como la usaría una persona", () => {
  /**
   * ── EL LÍMITE DE REGISTRO SE LIBERA ANTES DE CADA TEST ─────────────────
   *
   * `registro:ip` son **5 por hora** y todos los specs salen de la misma
   * máquina, así que comparten cubo. La suite crea más cuentas desechables que
   * eso, y el que corre último se queda sin: el fallo aparece como «no sale
   * “Cuenta creada”», que se lee como un fallo de la pantalla de registro y no
   * lo es.
   *
   * Es el mismo razonamiento que ya está escrito en `preparar-suite.ts`: una
   * suite que prueba PANTALLAS no debe estar probando el limitador de paso. El
   * limitador tiene sus propios tests —ocho contra Postgres real, más los del
   * camino real que martillean el endpoint— y son mejores que este uso
   * accidental.
   */
  test.beforeEach(async () => {
    await liberarLimiteDeRegistro();
  });

  test("sin sesión, /app/lista manda al login", async ({ page }) => {
    await page.goto("/app/lista");

    await expect(page).toHaveURL(/\/login/);
  });

  test("un vault RECIÉN CREADO enseña su vacío, y la pantalla sigue usable", async ({ page }) => {
    const bloqueos: string[] = [];
    page.on("console", (mensaje) => {
      if (AVISO_DE_BLOQUEO.test(mensaje.text())) bloqueos.push(mensaje.text());
    });

    const email = `lista-${randomUUID().slice(0, 8)}@ejemplo.test`;

    await test.step("registrarse DEJANDO EN BLANCO todo lo opcional", async () => {
      // El nombre es opcional y se deja vacío A PROPÓSITO: ese es el caso que
      // se coló en producción una vez (`testing.md`), y es el que más gente
      // hace. Rellenarlo sería probar el camino cómodo.
      await page.goto("/registro");
      await page.getByLabel("Correo").fill(email);
      await page.getByLabel("Contraseña", { exact: false }).fill(CLAVE_NUEVA);
      await page.getByRole("button", { name: /crear mi vault/i }).click();

      await expect(page.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });
    });

    await entrar(page, email, CLAVE_NUEVA);

    await test.step("la lista se PINTA aunque no haya ni una serie", async () => {
      await page.goto("/app/lista");

      await expect(page.getByRole("heading", { level: 1, name: "Todas las series" })).toBeVisible();
      // §6, fila de tabla · vacío. Y el mensaje distingue «no tienes nada» de
      // «este filtro no devuelve nada»: son dos situaciones y dos salidas.
      await expect(page.getByRole("heading", { name: "Tu vault está vacío" })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    });

    await test.step("RECARGAR a mitad no la rompe", async () => {
      await page.reload();

      await expect(page.getByRole("heading", { name: "Tu vault está vacío" })).toBeVisible();
    });

    await test.step("filtrar y VOLVER ATRÁS deja la pantalla usable", async () => {
      await page.getByRole("link", { name: /viendo/i }).click();
      await expect(page).toHaveURL(/estado=VIENDO/);
      // ── EL TITULAR CAMBIÓ, Y FUE UNA DECISIÓN ─────────────────────
      //
      // Decía «Sin resultados». La lista y la rejilla tenían cada una su
      // componente de vacío y decían cosas distintas para lo mismo; peor: el
      // de la lista **no ofrecía salida**, solo pedía «quita alguno de los
      // chips de arriba». Con el conmutador de vista encima, la misma
      // situación daba o no daba un botón según en qué vista estuvieras.
      //
      // Gana la versión de la rejilla en las tres diferencias. Ver
      // `components/anime/vacio.tsx` y `code-style.md`.
      await expect(page.getByRole("heading", { name: "Ninguna serie coincide" })).toBeVisible();

      await page.goBack();

      // El botón de atrás sirve el HTML de la caché, y ahí es donde una
      // pantalla mal hidratada se queda inerte: se ve, pero no responde.
      await expect(page).toHaveURL(/\/app\/lista$/);
      await expect(page.getByRole("heading", { name: "Tu vault está vacío" })).toBeVisible();
      await expect(page.getByRole("link", { name: /viendo/i })).toBeEnabled();
    });

    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);
  });

  test("EL RECORRIDO COMPLETO sobre el vault sembrado", async ({ page, baseURL }) => {
    test.skip(!HAY_VAULT_SEMBRADO, MOTIVO_SIN_DATOS);

    const imagenes: string[] = [];
    page.on("request", (peticion) => {
      if (peticion.resourceType() === "image") imagenes.push(peticion.url());
    });

    const bloqueos: string[] = [];
    page.on("console", (mensaje) => {
      if (AVISO_DE_BLOQUEO.test(mensaje.text())) bloqueos.push(mensaje.text());
    });

    await entrarComoPropietario(page);

    const titulo = page.getByRole("columnheader", { name: /Título/ });

    await test.step("la tabla SE PINTA, con sus cabeceras y sus filas", async () => {
      await page.goto("/app/lista");

      await expect(page.getByRole("heading", { level: 1, name: "Todas las series" })).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
      await expect(titulo).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Estado/ })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Progreso/ })).toBeVisible();

      // Más de una fila: con una sola, medio recorrido (ordenar, invertir) no
      // demostraría nada.
      await expect(page.getByRole("rowheader").first()).toBeVisible();
      expect(await page.getByRole("rowheader").count()).toBeGreaterThan(1);
    });

    await test.step("las miniaturas salen de /api/covers y de NINGÚN otro sitio", async () => {
      // La invariante del proyecto: la URL que pegó el usuario es solo el
      // ORIGEN. Los bytes viven en Postgres, ya re-encodeados por sharp, y se
      // sirven tras comprobar la propiedad. Apuntar al dominio original
      // filtraría a ese host qué mira el usuario y cuándo.
      await expect
        .poll(() => imagenes.length, { message: "no se pidió ni una miniatura" })
        .toBeGreaterThan(0);

      const ajenas = imagenes.filter(
        (url) => !ES_FAVICON.test(url) && !url.startsWith(`${baseURL ?? ""}/api/covers/`),
      );

      expect(ajenas, "hay imágenes que NO salen de /api/covers").toEqual([]);
    });

    const porDefecto = await titulosDeLaTabla(page);
    let ascendente: string[] = [];

    await test.step("ORDENAR por Título cambia el orden Y la URL", async () => {
      await titulo.getByRole("link").click();

      await expect(page).toHaveURL(/orden=titulo&dir=asc/);
      // Se espera por el `aria-sort` y no por un tiempo: cuando cambia, el
      // árbol entero ya se ha vuelto a pintar con las filas nuevas.
      await expect(titulo).toHaveAttribute("aria-sort", "ascending");

      ascendente = await titulosDeLaTabla(page);
      expect(ascendente).toHaveLength(porDefecto.length);
    });

    await test.step("pulsar otra vez INVIERTE el orden", async () => {
      await titulo.getByRole("link").click();

      await expect(page).toHaveURL(/orden=titulo&dir=desc/);
      await expect(titulo).toHaveAttribute("aria-sort", "descending");

      const descendente = await titulosDeLaTabla(page);

      // La comprobación fuerte, y no depende del locale ni de qué datos haya:
      // descendente tiene que ser la inversa EXACTA de ascendente.
      expect(descendente).toEqual([...ascendente].reverse());
      // Y el orden ha cambiado de verdad respecto a como se entró.
      expect(descendente).not.toEqual(porDefecto);
    });

    await test.step("VOLVER ATRÁS devuelve el orden anterior", async () => {
      await page.goBack();

      await expect(page).toHaveURL(/orden=titulo&dir=asc/);
      await expect(titulo).toHaveAttribute("aria-sort", "ascending");
      expect(await titulosDeLaTabla(page)).toEqual(ascendente);
    });

    await test.step("RECARGAR con el orden puesto lo conserva", async () => {
      await page.reload();

      await expect(page).toHaveURL(/orden=titulo&dir=asc/);
      await expect(titulo).toHaveAttribute("aria-sort", "ascending");
      expect(await titulosDeLaTabla(page)).toEqual(ascendente);
    });

    await test.step("un filtro SIN RESULTADOS enseña su vacío", async () => {
      const chipAbandonado = page.getByRole("link", { name: /abandonado/i });

      // Precondición explícita: el vault sembrado no tiene abandonados. Si
      // algún día los tuviera, el test falla AQUÍ y se lee por qué, en vez de
      // fallar más abajo con un mensaje que no dice nada.
      await expect(chipAbandonado).toContainText("0");

      await chipAbandonado.click();

      await expect(page).toHaveURL(/estado=ABANDONADO/);
      // El orden sobrevive al filtro: reordenar y filtrar no se pisan.
      await expect(page).toHaveURL(/orden=titulo/);
      await expect(page.getByRole("heading", { name: "Ninguna serie coincide" })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    });

    await test.step("quitar el filtro devuelve la tabla", async () => {
      await page.getByRole("link", { name: /^Todos/ }).click();

      await expect(page.getByRole("table")).toBeVisible();
    });

    await test.step("al estrechar la ventana, las columnas se caen (§3)", async () => {
      const generos = page.getByRole("columnheader", { name: /Géneros/ });
      const actualizado = page.getByRole("columnheader", { name: /Actualizado/ });

      await page.setViewportSize({ width: 1500, height: 900 });
      await expect(generos).toBeVisible();
      await expect(actualizado).toBeVisible();

      await page.setViewportSize({ width: 1200, height: 900 });
      await expect(generos).toHaveCount(0);
      await expect(actualizado).toBeVisible();

      await page.setViewportSize({ width: 900, height: 900 });
      await expect(actualizado).toHaveCount(0);
      await expect(titulo).toBeVisible();
    });

    await test.step("a 390 px YA NO HAY TABLA: hay cards, y nada se va de lado", async () => {
      await page.setViewportSize({ width: 390, height: 844 });

      // §3: «Vista lista · móvil → se sustituye por cards». No es una tabla
      // estrecha con scroll lateral: la tabla desaparece.
      await expect(page.locator("table")).toBeHidden();
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByRole("article").first()).toBeVisible();

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(desborde, "el body hace scroll horizontal a 390 px").toBeLessThanOrEqual(0);
    });

    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);
  });
});
