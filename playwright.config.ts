import { defineConfig, devices } from "@playwright/test";
import { config as cargarEnv } from "dotenv";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `.env.local` SE CARGA AQUÍ, UNA VEZ, Y NO EN CADA SPEC.
 *
 * ── EL FALLO QUE LO TRAJO, Y ES DE LA FAMILIA DE SIEMPRE ──────────────────
 *
 * `sesion-propietario.setup.ts` lee `SEED_OWNER_EMAIL` y `SEED_OWNER_PASSWORD`,
 * y **se salta solo** cuando faltan. Como la configuración no cargaba
 * `.env.local`, faltaban siempre: el setup se saltaba en silencio, los specs
 * reutilizaban unas cookies viejas del fichero de sesión, y los siete fallaban
 * con «la sesión reutilizada del propietario no vale».
 *
 * Ese mensaje manda a mirar la autenticación —¿caducó el token?, ¿cambió el
 * secreto?, ¿está mal el middleware?— cuando el problema era una variable de
 * entorno que nunca llegó. Es «la operación tuvo éxito, ¿SOBRE QUÉ?» aplicado
 * al arnés: el salto era correcto y actuaba sobre un entorno vacío.
 *
 * Cargarlo aquí lo arregla en un sitio. Los specs que lo hacían por su cuenta
 * pueden dejar de hacerlo: era el mismo `dotenv` escrito cuatro veces.
 * ═══════════════════════════════════════════════════════════════════════════
 */
cargarEnv({ path: ".env.local", quiet: true });

/**
 * Playwright para el flujo crítico (`.claude/rules/testing.md`).
 *
 * Los specs llegan en la FASE 6; la configuración existe ya para que
 * `npm run test:e2e` no sea un script declarado que apunta al vacío, y para
 * fijar aquí las decisiones que la regla da por cerradas.
 */
export default defineConfig({
  /**
   * Se ejecuta una vez, antes de todo: vacía los cubos del limitador de login.
   *
   * La suite hace varios logins —uno por spec— y el límite es 5 cada 15
   * minutos, así que dos pasadas seguidas se autobloqueaban y el 429 se leía
   * como un fallo de pantalla. Ver el porqué completo en el fichero.
   */
  globalSetup: "./e2e/preparar-suite.ts",

  testDir: "./e2e",
  fullyParallel: false,

  /**
   * ── UN SOLO WORKER, Y NO ES POR LENTITUD ────────────────────────────────
   *
   * `fullyParallel: false` serializa los tests DENTRO de un fichero. Los
   * ficheros seguían corriendo en paralelo, y **todos comparten el mismo
   * vault**: el del propietario, con sus 83 animes de verdad.
   *
   * Eso hace imposible cualquier aserción sobre un recuento. Medido: el spec de
   * la biblioteca leyó `84` en el chip «Todos» y contó `83` tarjetas en la
   * rejilla, porque el spec de alta estaba creando y borrando animes en otro
   * worker entre las dos lecturas. El rojo decía «un filtro sin resultados
   * pierde una serie», que no era ni de lejos el problema.
   *
   * Probar contra el vault real es a propósito: es lo que hace que estas
   * pruebas valgan más que un fixture inventado. El precio es que **no se
   * pueden paralelizar**, y declararlo aquí es más honesto que perseguir
   * intermitencias.
   */
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI !== undefined ? "github" : "list",

  use: {
    /**
     * ── `localhost`, NO `127.0.0.1`, Y NO ES UN DETALLE ───────────────────
     *
     * Son ORÍGENES DISTINTOS para el navegador, y la app se identifica a sí
     * misma con `AUTH_URL` = `http://localhost:3000`. Entrando por
     * `127.0.0.1`, toda petición que MUTE desde un Route Handler la rechaza la
     * guarda CSRF —correctamente: para la app, ese origen es un tercero—.
     *
     * Lo destapó el recorrido de importación, que es el primer Route Handler
     * que muta: subir la hoja devolvía «Petición rechazada por su origen» y la
     * pantalla no llegaba a leer el fichero nunca. Con la ruta de portadas
     * —`GET`, que no pasa por la guarda— no se notaba.
     *
     * Cambiarlo aquí no debilita nada: hace que el navegador de pruebas llegue
     * por la misma puerta por la que llega el navegador de verdad, que es lo
     * único que hace que este nivel valga para algo.
     */
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Sin capturas por defecto: el diseño se verifica con `ui-fidelity-checker`
    // contra design/screens/, no con un diff de píxeles frágil.
    screenshot: "only-on-failure",
  },

  /**
   * DOS PROYECTOS, Y EL PRIMERO NO PRUEBA NADA.
   *
   * `sesion` entra UNA vez como propietario por el formulario de verdad y
   * guarda las cookies; `chromium` depende de él, así que corre después. El
   * motivo —la suite se comía el límite de 5 intentos/15 min de `login:email`
   * y dos specs fallaban por eso— está escrito en `e2e/sesion-propietario.ts`.
   *
   * `testIgnore` en `chromium` evita que el fichero de preparación se ejecute
   * otra vez como si fuera un spec normal.
   */
  projects: [
    { name: "sesion", testMatch: /sesion-propietario\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["sesion"],
      testIgnore: /sesion-propietario\.setup\.ts/,
    },
  ],

  /**
   * Contra el BUILD DE PRODUCCIÓN, nunca contra `dev`: `dev` tiene otros tiempos
   * y otros límites, y esconde fallos que solo aparecen al construir.
   */
  webServer: {
    command: "npm run build && npm run start",
    // El mismo origen que `baseURL`: ver la nota de arriba.
    url: "http://localhost:3000",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 180_000,
  },
});
