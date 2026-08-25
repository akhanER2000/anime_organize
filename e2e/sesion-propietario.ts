import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "@playwright/test";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA SESIÓN DEL PROPIETARIO SE ABRE UNA VEZ Y SE REPARTE
 *
 * ── EL PROBLEMA, MEDIDO ───────────────────────────────────────────────────
 *
 * `login:email` permite **5 intentos cada 15 minutos**, y está bien que los
 * permita: es la protección contra la fuerza bruta contra UNA cuenta concreta.
 *
 * Pero la suite entraba con el propietario **cinco veces** —una por cada
 * `beforeAll` y otra por cada test que abre su propio contexto—, así que se
 * comía el cubo entero y los últimos se quedaban en `/login`. Contador real
 * tras una pasada: **7**. Los dos fallos que salían de ahí se leían como «la
 * vista lista no carga» y «la ficha ajena no responde 404», que no era ni una
 * cosa ni la otra.
 *
 * ── POR QUÉ ESTO NO ES SALTARSE NADA ──────────────────────────────────────
 *
 * El formulario de login **se sigue rellenando de verdad**: una vez, en
 * `sesion-propietario.setup.ts`, con el mismo navegador y la misma CSP. Y
 * `auth-humo.spec.ts` sigue haciendo el recorrido completo de registro y
 * entrada, que es el spec al que le toca probar esa pantalla.
 *
 * Lo que se quita es que la biblioteca, la lista y la ficha —que prueban OTRA
 * cosa— vuelvan a atravesar el login cinco veces. Es la misma razón por la que
 * `preparar-suite.ts` vacía los cubos: **una suite que prueba pantallas no debe
 * estar probando el limitador de paso**, porque entonces cada pantalla hereda
 * un motivo de fallo que no es suyo y el rojo deja de señalar dónde está el
 * problema.
 *
 * De propina, cada reutilización ahorra un Argon2id de ~30 ms y una consulta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Donde el proyecto `sesion` deja las cookies. Está en `.gitignore`. */
export const RUTA_SESION_PROPIETARIO = join(process.cwd(), "e2e", ".sesion-propietario.json");

/**
 * Lo que Playwright escribe en `storageState`, de lo que solo usamos cookies.
 *
 * El tipo se DERIVA de `BrowserContext["cookies"]` en vez de escribirlo a mano:
 * así `addCookies` lo acepta sin castear, y si Playwright cambia la forma de
 * una cookie esto deja de compilar en lugar de fallar al inyectarlas.
 */
type EstadoGuardado = { cookies: Awaited<ReturnType<BrowserContext["cookies"]>> };

/**
 * Deja a `page` dentro del vault del propietario, sin pasar por el formulario.
 *
 * Se inyectan las cookies en el contexto de la página y se navega. Si el
 * fichero no existe —porque alguien lanzó un spec suelto sin el proyecto
 * `sesion`— el error lo dice con esas palabras, en vez de fallar más adelante
 * con un «no aparece la rejilla» que no explica nada.
 */
export async function entrarComoPropietario(page: Page): Promise<void> {
  let estado: EstadoGuardado;
  try {
    estado = JSON.parse(readFileSync(RUTA_SESION_PROPIETARIO, "utf-8")) as EstadoGuardado;
  } catch {
    throw new Error(
      `No existe ${RUTA_SESION_PROPIETARIO}. Lo escribe el proyecto \`sesion\` de ` +
        "Playwright, que entra una vez por el formulario de verdad. Si lanzas un spec " +
        "suelto, hazlo con `npm run test:e2e` o añade `--project=chromium`, que arrastra " +
        "esa dependencia.",
    );
  }

  await page.context().addCookies(estado.cookies);
  await page.goto("/app");

  // Se comprueba que la sesión inyectada VALE: si el token hubiera caducado o
  // las cookies fueran de otra rama de la base, el middleware manda a /login y
  // el test siguiente fallaría por un motivo que no es el suyo.
  await expect(page, "la sesión reutilizada del propietario no vale").toHaveURL(/\/app/, {
    timeout: 20_000,
  });
}
