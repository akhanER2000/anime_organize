import { randomUUID } from "node:crypto";
import { liberarLimiteDeRegistro } from "./ayuda-recuperacion";

import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — AJUSTES Y EL CAMBIO DE CONTRASEÑA (artboard 09).
 *
 * Chromium, contra `build` + `start`, **sin `bypassCSP`**.
 *
 * ── EL CICLO ENTERO, NO LA MITAD ──────────────────────────────────────────
 *
 * El fallo más caro de este proyecto fue exactamente esto en el flujo de
 * recuperación: `/recuperar` devolvía 200, el formulario se veía, se dio por
 * bueno — y **nadie completó el ciclo**: restablecer Y ENTRAR después. En
 * producción no funcionaba, y cada intento del dueño empeoraba el bloqueo.
 *
 * Así que aquí el recorrido cambia la contraseña **y vuelve a entrar con la
 * nueva**, y además comprueba que la vieja ya no vale. Con una cuenta propia y
 * desechable: la del propietario no se toca, porque su contraseña es la que
 * usa toda la suite.
 *
 * ── SE COMPRUEBA TAMBIÉN QUE LA SESIÓN ACTUAL SOBREVIVE ──────────────────
 *
 * Cambiar la contraseña revoca las sesiones de los DEMÁS dispositivos, y la
 * interfaz lo dice antes de pulsar. Si revocara también la actual, el usuario
 * se echaría a sí mismo cada vez que cambia la contraseña — que es lo que
 * pasaría si `sessions_valid_from` se comparara mal contra el token vigente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const marca = randomUUID().slice(0, 8);
const EMAIL = `ajustes-${marca}@ejemplo.test`;
const PASSWORD_VIEJA = `Vieja-${marca}-larga`;
const PASSWORD_NUEVA = `Nueva-${marca}-larga`;

async function entrar(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /entrar al vault/i }).click();
}

/**
 * Crea una cuenta por el formulario de verdad y entra con ella.
 *
 * ── EL REGISTRO NO INICIA SESIÓN, Y ESO ESTÁ BIEN ────────────────────────
 *
 * La pantalla dice «Cuenta creada. Ya puedes entrar con tu correo y tu
 * contraseña» y se queda en `/registro`. Es coherente con la política
 * anti-enumeración: el mensaje es el mismo exista o no la cuenta, así que no
 * puede llevarte dentro solo cuando de verdad se creó.
 *
 * El ayudante lo daba por hecho y esperaba `/app`. Se anota aquí porque quien
 * escriba el siguiente spec va a suponer lo mismo.
 */
async function registrarse(page: Page, email: string, password: string) {
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /crear mi vault/i }).click();

  await expect(page.getByRole("status").filter({ hasText: /cuenta creada/i })).toBeVisible({
    timeout: 30_000,
  });

  await entrar(page, email, password);
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

test.describe("ajustes", () => {
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

  test("SE LLEGA DESDE LA BARRA: la pantalla no está huérfana", async ({ page }) => {
    // El problema simétrico del enlace muerto: una pantalla a la que no se
    // llega. Se comprueba navegando como lo haría una persona, no con un
    // `goto` directo, que la encontraría aunque nada enlazara a ella.
    await entrarComoPropietario(page);

    await page.getByRole("link", { name: /ajustes de la cuenta/i }).click();

    await expect(page).toHaveURL(/\/app\/ajustes/);
    await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  });

  test("LAS PESTAÑAS SE MUEVEN CON LAS FLECHAS, y el grupo es UNA parada", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app/ajustes");

    const perfil = page.getByRole("tab", { name: "Perfil" });
    await expect(perfil).toHaveAttribute("aria-selected", "true");

    // El patrón `tablist` de ARIA: una sola parada de tabulador y las flechas
    // dentro. Sin esto, `role="tab"` promete algo que no ocurre.
    await perfil.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Importar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Circular: desde la primera hacia atrás se va a la última, no a ninguna.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Peligro" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("LO QUE NO ESTÁ CONSTRUIDO NO TIENE BOTONES INERTES", async ({ page }) => {
    // El encargo: un control que no hace nada es peor que su ausencia, porque
    // parece roto en vez de pendiente.
    await entrarComoPropietario(page);
    await page.goto("/app/ajustes");

    await page.getByRole("tab", { name: "Importar" }).click();
    const panel = page.getByRole("tabpanel");

    await expect(panel).toContainText(/todavía no está construida/i);
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
  });

  test("CAMBIAR LA CONTRASEÑA, Y ENTRAR DESPUÉS CON LA NUEVA", async ({ page, browser }) => {
    // Tres autenticaciones de verdad —registro, login, y login con la nueva—,
    // cada una pagando su Argon2id de ~30 ms más el viaje a Neon. Los 30 s por
    // defecto se quedan cortos, y NO es que el test sea frágil: es que este
    // recorrido hace tres veces el trabajo caro a propósito. Acortarlo
    // saltándose un login sería quitarle justo lo que comprueba.
    test.setTimeout(120_000);

    // ── EL CICLO ENTERO ─────────────────────────────────────────────────
    //
    // Es la lección del flujo de recuperación: comprobar que el formulario
    // responde 200 no es comprobar que el cambio SIRVE.
    await registrarse(page, EMAIL, PASSWORD_VIEJA);

    await page.goto("/app/ajustes");
    await page.getByLabel("Contraseña actual").fill(PASSWORD_VIEJA);
    await page.getByLabel("Contraseña nueva").fill(PASSWORD_NUEVA);
    await page.getByRole("button", { name: /cambiar la contraseña/i }).click();

    await expect(page.getByRole("status").filter({ hasText: /contraseña cambiada/i })).toBeVisible({
      timeout: 30_000,
    });

    // Los campos se vacían: no se deja la contraseña escrita en pantalla.
    await expect(page.getByLabel("Contraseña actual")).toHaveValue("");
    await expect(page.getByLabel("Contraseña nueva")).toHaveValue("");

    // LA SESIÓN ACTUAL SOBREVIVE. Si `sessions_valid_from` se comparara mal
    // contra el token vigente, el usuario se echaría a sí mismo al cambiarla.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);

    // ── Y CON LA NUEVA SE ENTRA DE VERDAD, DESDE CERO ─────────────────
    //
    // Contexto NUEVO y no `clearCookies()`: con la sesión aún válida, `/login`
    // manda de vuelta a `/app`, así que el formulario nunca aparecía y el test
    // se quedaba esperando un campo que no estaba. Un navegador limpio no tiene
    // esa ambigüedad — y es además lo que «entrar desde cero» significa.
    const limpio = await browser.newContext();
    const otra = await limpio.newPage();
    await entrar(otra, EMAIL, PASSWORD_NUEVA);
    await expect(otra, "no se puede entrar con la contraseña NUEVA").toHaveURL(/\/app/, {
      timeout: 30_000,
    });
    await limpio.close();
  });

  test("LA VIEJA YA NO VALE", async ({ browser }) => {
    // Depende del test anterior, que ya cambió la contraseña de esta cuenta.
    // Contexto nuevo por el mismo motivo: con sesión, `/login` redirige.
    const limpio = await browser.newContext();
    const otra = await limpio.newPage();

    await entrar(otra, EMAIL, PASSWORD_VIEJA);

    // Se queda en el login con su mensaje. No entra.
    await expect(otra, "la contraseña VIEJA sigue valiendo").toHaveURL(/\/login/);
    await expect(otra.getByRole("alert")).toBeVisible({ timeout: 20_000 });

    await limpio.close();
  });

  test("LA CONTRASEÑA ACTUAL EQUIVOCADA SE DICE EN SU CAMPO", async ({ page }) => {
    // Re-autenticación obligatoria (`security.md` §2): sin la actual no se
    // cambia nada, ni siquiera con la sesión abierta.
    const email = `ajustes-mal-${randomUUID().slice(0, 8)}@ejemplo.test`;
    const password = `Correcta-${randomUUID().slice(0, 8)}-larga`;
    await registrarse(page, email, password);

    await page.goto("/app/ajustes");
    await page.getByLabel("Contraseña actual").fill("esto-no-es-la-suya-pero-es-larga");
    await page.getByLabel("Contraseña nueva").fill(`Otra-${randomUUID().slice(0, 8)}-larga`);
    await page.getByRole("button", { name: /cambiar la contraseña/i }).click();

    await expect(page.getByRole("alert").filter({ hasText: /actual no es correcta/i })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    // Y la sesión sigue abierta: fallar la re-autenticación no echa a nadie.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("LA NUEVA NO PUEDE SER LA MISMA QUE LA ACTUAL", async ({ page }) => {
    // No es higiene: cambiar la contraseña revoca las demás sesiones, así que
    // «cambiarla» por la misma haría creer que se echó al intruso.
    const email = `ajustes-igual-${randomUUID().slice(0, 8)}@ejemplo.test`;
    const password = `Repetida-${randomUUID().slice(0, 8)}-larga`;
    await registrarse(page, email, password);

    await page.goto("/app/ajustes");
    await page.getByLabel("Contraseña actual").fill(password);
    await page.getByLabel("Contraseña nueva").fill(password);
    await page.getByRole("button", { name: /cambiar la contraseña/i }).click();

    await expect(page.getByRole("alert").filter({ hasText: /distinta de la actual/i })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
  });
});
