import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  emitirTokenDeReset,
  esperarSinBase,
  hayBase,
  liberarLimiteDeRegistro,
  liberarLimiteDeLogin,
} from "./ayuda-recuperacion";

import type { Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESTABLECER LA CONTRASEÑA **Y DESPUÉS ENTRAR**
 *
 * ── EL FALLO QUE TRAJO ESTE FICHERO ───────────────────────────────────────
 *
 * La recuperación se dio por buena porque `/recuperar` y `/recuperar/nueva`
 * devolvían 200 y los formularios se veían. Nadie completó el ciclo: resetear
 * **y a continuación entrar**. En producción no funcionaba, y costó horas de
 * intentos que además empeoraban el problema.
 *
 * Es literalmente la regla del camino real, incumplida en el sitio donde más
 * caro sale: el flujo cuyo único propósito es devolverte el acceso.
 *
 * ── LO QUE SE MIDIÓ, Y QUE ESTE TEST DEJA CLAVADO ─────────────────────────
 *
 * Reproducido contra la aplicación arrancada:
 *
 *   1. cinco intentos fallidos                   → bloqueado 15 minutos
 *   2. login con la contraseña CORRECTA          → rechazado
 *   3. restablecer                               → «Contraseña cambiada»
 *   4. login con la NUEVA                        → **rechazado**
 *   5. vaciando solo el cubo, sin tocar nada más → **entra**
 *
 * El paso 5 es el control: la contraseña siempre fue buena. Quien bloqueaba era
 * el limitador, y **restablecer no lo liberaba**. Peor: cada reintento renovaba
 * el bloqueo, así que el dueño legítimo se quedaba fuera indefinidamente
 * haciendo exactamente lo que hay que hacer.
 *
 * Y había un segundo fallo debajo: la Server Action del login llamaba a
 * `registrarIntentos` para poder enseñar «demasiados intentos», y `authorize`
 * volvía a registrar. **Un envío del formulario gastaba dos intentos** —medido,
 * `contador = 2`—, así que el límite de cinco se agotaba al tercer envío.
 *
 * ── POR QUÉ EL TOKEN SE EMITE DESDE EL TEST ───────────────────────────────
 *
 * El correo va al log del servidor —no hay Resend configurado—, y desde el
 * navegador no hay forma de leerlo. Así que el test emite el token llamando a
 * la misma función que usa la pantalla.
 *
 * Lo que NO se reconstruye es nada de lo que falla: el formulario de
 * `/recuperar` se rellena y se envía de verdad, la contraseña nueva se escribe
 * en `/recuperar/nueva` de verdad, y el login posterior se hace tecleando en el
 * formulario de verdad. La emisión es el único eslabón fabricado, y es el único
 * que ya estaba probado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test.describe.configure({ mode: "serial" });

const VIEJA = "ContrasenaVieja2026";
const NUEVA = "ContrasenaNueva2026";

/**
 * Rellena el formulario de login y devuelve si se entró.
 *
 * `esperaMs` corto cuando el fallo es lo ESPERADO: seis intentos fallidos con
 * la espera larga son noventa segundos, y el test entero moría por tiempo antes
 * de llegar a lo que prueba.
 */
async function intentarEntrar(
  page: Page,
  email: string,
  password: string,
  esperaMs = 15_000,
): Promise<boolean> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(password);
  await page.getByRole("button", { name: /entrar al vault/i }).click();

  try {
    await page.waitForURL(/\/app/, { timeout: esperaMs });
    return true;
  } catch {
    return false;
  }
}

test.skip(!hayBase(), esperarSinBase());

// ── ANTES DE CADA TEST, NO UNA VEZ POR FICHERO ──────────────────────────
//
// Los ficheros de la suite corren en trabajadores paralelos, así que otro spec
// puede agotar el cubo de `registro:ip` entre el primer test de aquí y el
// segundo. Con `beforeAll` fallaba justo así: el primero pasaba y el segundo no
// llegaba a crear su cuenta.
//
// Los dos cubos se vacían AL EMPEZAR cada test, y esa precisión importa: el
// segundo recorrido **agota el de login a propósito**, porque es justo lo que
// está probando. Partir de un cubo limpio es lo que hace que ese agotamiento
// sea suyo y no herencia de los ochenta y tantos inicios de sesión que hace el
// resto de la suite desde esta misma IP. Vaciarlo a MITAD invalidaría el test;
// vaciarlo al empezar es lo que lo hace repetible.
test.beforeEach(async () => {
  await liberarLimiteDeRegistro();
  await liberarLimiteDeLogin();
});

test("EL CICLO ENTERO: registrarse, olvidarla, restablecer y VOLVER A ENTRAR", async ({ page }) => {
  const email = `ciclo-${randomUUID().slice(0, 8)}@ejemplo.test`;

  // ── 1. Una cuenta de verdad, por el formulario de verdad ────────────────
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(VIEJA);
  // El nombre se deja EN BLANCO: es el campo opcional, y es el caso que ya
  // rompió el registro una vez.
  await page.getByRole("button", { name: /crear mi vault/i }).click();
  await expect(page.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });

  // ── 2. Restablecer, empezando por pedirlo en la pantalla ────────────────
  await page.goto("/recuperar");
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("button", { name: /enviar|recuperar|enlace/i }).click();

  // La respuesta es la misma exista o no la cuenta: no se enumera a nadie.
  await expect(page.getByText(/si esa dirección|te hemos enviado|revisa tu correo/i)).toBeVisible({
    timeout: 20_000,
  });

  // ── 3. El enlace, y la contraseña nueva escrita en su formulario ────────
  const token = await emitirTokenDeReset(email);

  await page.goto(`/recuperar/nueva?token=${token}`);
  await page
    .getByLabel(/contraseña/i)
    .first()
    .fill(NUEVA);
  const repetir = page.getByLabel(/repite|confirma/i);
  if ((await repetir.count()) > 0) await repetir.fill(NUEVA);
  await page.getByRole("button", { name: /cambiar|guardar|establecer/i }).click();

  await expect(page.getByText(/contraseña cambiada/i)).toBeVisible({ timeout: 20_000 });

  // ── 4. Y AHORA LO QUE NADIE COMPROBABA ──────────────────────────────────
  expect(
    await intentarEntrar(page, email, NUEVA),
    "restablecer la contraseña y entrar a continuación NO funciona: es el fallo que costó horas",
  ).toBe(true);

  // ── 5. Y la vieja ya no vale ────────────────────────────────────────────
  // `GET /api/auth/signout` solo enseña la confirmación: NO cierra la sesión
  // —hace falta el POST—. Con la cookie viva, `/login` redirige a `/app` y el
  // formulario no existe. Se limpian las cookies, que es lo que de verdad deja
  // el navegador como el de alguien sin sesión.
  await page.context().clearCookies();
  expect(
    await intentarEntrar(page, email, VIEJA),
    "la contraseña vieja sigue valiendo tras el restablecimiento",
  ).toBe(false);
});

test("BLOQUEARSE Y RESTABLECER: el reseteo devuelve el acceso, no lo deja bloqueado", async ({
  page,
}) => {
  // Seis intentos fallidos, un restablecimiento y dos logins más: no cabe en
  // los 30 s por defecto.
  test.setTimeout(120_000);

  const email = `bloqueo-${randomUUID().slice(0, 8)}@ejemplo.test`;

  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña", { exact: false }).fill(VIEJA);
  await page.getByRole("button", { name: /crear mi vault/i }).click();
  await expect(page.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });
  await page.context().clearCookies();

  // ── 1. Agotar el límite equivocándose, que es lo que hace una persona ───
  for (let i = 0; i < 6; i += 1) {
    await intentarEntrar(page, email, "EstaNoEsLaBuena123", 2_000);
  }

  // La pantalla lo dice: no miente hablando de la contraseña.
  await expect(page.getByText(/demasiados intentos/i)).toBeVisible({ timeout: 15_000 });

  // ── 2. Restablecer es lo único razonable que queda ──────────────────────
  const token = await emitirTokenDeReset(email);
  await page.goto(`/recuperar/nueva?token=${token}`);
  await page
    .getByLabel(/contraseña/i)
    .first()
    .fill(NUEVA);
  const repetir = page.getByLabel(/repite|confirma/i);
  if ((await repetir.count()) > 0) await repetir.fill(NUEVA);
  await page.getByRole("button", { name: /cambiar|guardar|establecer/i }).click();
  await expect(page.getByText(/contraseña cambiada/i)).toBeVisible({ timeout: 20_000 });

  // ── 3. Y AHORA SE ENTRA. Este es el callejón sin salida que se cerró ────
  expect(
    await intentarEntrar(page, email, NUEVA),
    "sigues bloqueado después de restablecer: el callejón sin salida ha vuelto. " +
      "Consumir un token de un solo uso prueba control del buzón, que es mejor prueba " +
      "que saber la contraseña — mantener el límite después no protege nada.",
  ).toBe(true);
});
