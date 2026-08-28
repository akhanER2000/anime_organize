import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashearPassword } from "@/lib/auth/password";
import { marcaDeRevocacion } from "@/lib/auth/sesion";
import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "@/lib/db/cliente-test";
import { laAppPuedeUsar } from "@/lib/db/motor";
import { clavePorEmail, clavePorIp } from "@/lib/rate-limit";
import { LIMITES } from "@/lib/rate-limit/politica";
import { rateLimitBucket, users } from "@/lib/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REVOCACIÓN DE SESIÓN · POR EL CAMINO REAL.
 *
 * CAMINO REAL (2026-08-23) — `.claude/rules/testing.md` § «Verificación por el
 * CAMINO REAL».
 *
 * Este test **no fabrica nada**: arranca el servidor de producción, hace login
 * contra el endpoint de verdad, guarda la cookie que devuelve el servidor,
 * cambia la contraseña en la base, y comprueba que la siguiente petición —con
 * esa misma cookie, atravesando el middleware y los callbacks reales— ya no
 * autentica.
 *
 * POR QUÉ EXISTE: `sessions_valid_from` estaba implementado, testeado con 17
 * casos y verificado por mutación… y **no se disparaba nunca**. El middleware
 * de Auth.js re-firma el JWT en cada navegación, así que `iat` era siempre
 * «ahora» y la comparación con el corte pasaba siempre. Los tests fabricaban el
 * `iat`, así que jamás vieron el problema.
 *
 * **La mutación demostró que la función funcionaba. Nadie comprobó que
 * estuviera conectada.**
 *
 * Si este test se pone en verde con la protección desconectada, no vale nada:
 * por eso lleva su verificación por mutación al final del fichero.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── VERIFICADO POR MUTACIÓN · 2026-08-23 ──────────────────────────────────
 *
 * | Mutación | Qué se rompe | Resultado |
 * |---|---|---|
 * | `if (false && emitidoMs < corteMs)` en `sesion.ts` | la revocación no se evalúa | **ROJO** · «cookie robada» |
 * | `if (!veredicto.valida) { }` en `auth.ts:236` | `evaluarSesion` queda INTACTA; solo se ignora su veredicto | **ROJO** · «cookie robada» + «borrar la cuenta» |
 *
 * La segunda es la que da valor a este fichero, y responde exactamente a la
 * pregunta de la regla: *«si alguien desconectara este mecanismo del sistema
 * —sin tocar su código—, ¿se pondría rojo algún test?»*. Con la mutación 2 la
 * función sigue siendo perfectamente correcta y todos sus tests unitarios
 * siguen verdes; **solo este se entera**. Eso es justo lo que faltaba cuando
 * `sessions_valid_from` pasó meses sin dispararse.
 *
 * ── DOS FALLOS REALES QUE ENCONTRÓ AL ESCRIBIRLO ──────────────────────────
 *
 * 1. **`src/app/api/auth/[...nextauth]/route.ts` no existía.** `auth.ts`
 *    exportaba `handlers` y nadie los montaba: la autenticación estaba escrita
 *    y **desconectada**. Ningún test lo vio porque todos fabricaban la sesión.
 * 2. **Truncamiento al segundo.** `em` iba en segundos enteros y
 *    `sessions_valid_from` en milisegundos: una cuenta creada a las
 *    `10:00:00.800` cuyo dueño entraba a las `10:00:00.900` quedaba **revocada
 *    en el mismo segundo de registrarse**. El primer arreglo —truncar los dos
 *    lados— cambió un agujero por el contrario: una contraseña cambiada en el
 *    mismo segundo dejaba de revocar, y este test se volvió intermitente según
 *    la carga de la máquina. Arreglado de raíz: `em` es un claim nuestro, así
 *    que va en MILISEGUNDOS y no se trunca nada.
 *
 * 3. **El reloj de Neon va ~600 ms por delante del de la aplicación** (medido:
 *    566–737 ms). `sessions_valid_from` tenía `DEFAULT now()`, del reloj de la
 *    BASE, y se comparaba contra una marca del reloj de la APLICACIÓN: una
 *    sesión iniciada justo tras registrarse nacía revocada. Se quitó el
 *    default (migración 0003), así que omitirlo es ahora un error de tipos.
 *
 * Los dos son fallos de CONEXIÓN, no de lógica. Ninguna suite de unidad podía
 * verlos, por bien escrita que estuviese.
 */

const PUERTO = 3994;
const BASE = `http://127.0.0.1:${PUERTO}`;
const PASSWORD = "una contraseña larga de prueba 123";

const url = urlDePruebas();
const hayBase = url !== undefined;

/**
 * No basta con que HAYA una base: hace falta una que **la aplicación** sepa
 * usar.
 *
 * Los demás tests contra base van por `cliente-test.ts`, que elige driver y
 * habla con cualquier Postgres. Este arranca `next start`, y ahí dentro manda
 * `src/lib/db/interno.ts`, que usa el driver HTTP de Neon y no es
 * configurable: contra un `postgres:18` no hay endpoint `/sql` al otro lado.
 *
 * Sin esta comprobación el fallo era INVISIBLE, y de la peor manera. En CI el
 * worker de vitest moría durante el arranque, y el informe decía «57 passes ·
 * 57 total» contando solo los ficheros que llegaron a terminar, cuando el
 * total real era 58. Un test que desaparece del recuento se lee igual que un
 * test que pasa.
 */
const appPuedeUsarla = url !== undefined && laAppPuedeUsar(url);
const sePuede = hayBase && appPuedeUsarla;

const describeSiSePuede = describe.skipIf(!sePuede);

if (hayBase && !appPuedeUsarla) {
  console.warn(
    "\n[camino-real] OMITIDO: la base no es de Neon, y la APLICACIÓN solo\n" +
      "  sabe hablar por el driver HTTP de Neon. Arrancarla contra este\n" +
      "  Postgres da un \u00abfetch failed\u00bb a mitad del login.\n" +
      "\n" +
      "  Omitirlo NO es aprobarlo. Hacen falta las dos cosas:\n" +
      "    · en local → DATABASE_URL apuntando a tu rama de Neon (lo normal)\n" +
      "    · en CI    → un proxy HTTP de Neon delante del contenedor\n",
  );
}

if (!hayBase) {
  console.warn(
    "\n[camino-real] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que una sesión revocada deja de autenticar DE VERDAD.\n" +
      "  Omitirlo NO es aprobarlo.\n",
  );
}

/** Cliente HTTP mínimo que recuerda las cookies, como haría un navegador. */
class Navegador {
  #cookies = new Map<string, string>();
  readonly #base: string;

  /**
   * La base es un parámetro porque este fichero arranca DOS servidores: el
   * normal y uno con las duraciones de sesión acortadas para poder esperar a
   * que caduquen. Un solo build, dos entornos.
   */
  constructor(base: string = BASE) {
    this.#base = base;
  }

  /** El valor crudo de una cookie, para poder descifrar el token de verdad. */
  cookie(nombre: string): string | undefined {
    return this.#cookies.get(nombre);
  }

  async ir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
    const cabeceras = new Headers(opciones.headers);
    if (this.#cookies.size > 0) {
      cabeceras.set("cookie", [...this.#cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }

    const respuesta = await fetch(`${this.#base}${ruta}`, {
      ...opciones,
      headers: cabeceras,
      redirect: "manual",
    });

    for (const bruta of respuesta.headers.getSetCookie()) {
      const [par] = bruta.split(";");
      const i = par?.indexOf("=") ?? -1;
      if (par !== undefined && i > 0) {
        const nombre = par.slice(0, i);
        const valor = par.slice(i + 1);
        // Una cookie vaciada es una cookie borrada: así invalida Auth.js.
        if (valor === "" || /expires=Thu, 01 Jan 1970/i.test(bruta)) {
          this.#cookies.delete(nombre);
        } else {
          this.#cookies.set(nombre, valor);
        }
      }
    }

    return respuesta;
  }

  /** Copia el tarro de cookies: así se «roba» una sesión. */
  clonar(): Navegador {
    const otro = new Navegador(this.#base);
    for (const [k, v] of this.#cookies) otro.#cookies.set(k, v);
    return otro;
  }

  tieneCookieDeSesion(): boolean {
    return [...this.#cookies.keys()].some((k) => k.includes("session-token"));
  }
}

/** Mata lo que esté escuchando en un puerto. Antes y después del test. */
async function matarPuerto(puerto: number): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const ejecutar = promisify(execFile);

  try {
    if (process.platform === "win32") {
      await ejecutar("powershell", [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${puerto} -State Listen -ErrorAction SilentlyContinue | ` +
          `ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ]);
    } else {
      // `-sTCP:LISTEN` NO es un detalle: es lo que impide que este proceso se
      // suicide.
      //
      // `lsof -i tcp:N` casa cualquier socket con ese puerto en CUALQUIERA de
      // los dos extremos. Este test es quien hace las peticiones al servidor,
      // asi que sus propias conexiones salientes tienen 3994 como puerto
      // REMOTO y entraban en la lista. El `kill -9` del `afterAll` mataba
      // entonces al worker de vitest junto con el servidor.
      //
      // El sintoma era perfecto para despistar: los diez tests PASABAN y el
      // paso salia con codigo 1 igualmente, con un «Worker exited
      // unexpectedly» sin mensaje y el fichero fuera del recuento.
      //
      // En Windows nunca ocurrio porque la rama de PowerShell ya filtra
      // `-State Listen`. Las dos ramas hacen ahora lo mismo.
      await ejecutar("sh", ["-c", `lsof -ti tcp:${puerto} -sTCP:LISTEN | xargs -r kill -9`]);
    }
  } catch {
    // No había nada escuchando, que es el caso normal.
  }
  await new Promise((r) => setTimeout(r, 500));
}

async function esperarServidor(intentos = 120, base: string = BASE): Promise<void> {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(`${base}/api/auth/csrf`);
      if (r.ok) return;
    } catch {
      // El servidor todavía no escucha. Se reintenta.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no arrancó en ${base}`);
}

describeSiSePuede("revocación de sesión · camino real", () => {
  let servidor: ChildProcess;
  let cliente: ClientePrueba;
  let userId: string;
  const marca = randomUUID().slice(0, 8);
  const email = `camino-real-${marca}@ejemplo.test`;
  const clavesALimpiar: string[] = [];

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable");
    // Por si una ejecución anterior dejó el puerto ocupado.
    await matarPuerto(PUERTO);
    cliente = crearClientePrueba(url);

    // ── ESTE FICHERO SE ENVENENABA A SÍ MISMO ────────────────────────────
    // Todos los logins salen de esta máquina, así que comparten el cubo
    // `login:ip` de `127.0.0.1`. Los casos del limitador gastan decenas de
    // intentos a propósito, y el máximo por IP es 20 en 15 minutos: a la
    // segunda o tercera ejecución del fichero, **el login legítimo empezaba a
    // fallar** y los tests se ponían rojos por un motivo que no tenía nada que
    // ver con lo que probaban.
    //
    // Me pasó: cuatro casos en rojo tras restaurar una mutación, con el código
    // correcto. La primera lectura fue «he roto algo al restaurar»; la tabla
    // decía 55 intentos acumulados en el cubo de localhost.
    //
    // Se limpian los cubos de login ANTES de empezar. No debilita nada: lo que
    // se comprueba es que el limitador CUENTA y BLOQUEA, y eso se mide dentro
    // de cada caso partiendo de cero.
    await cliente.db.delete(rateLimitBucket).where(sql`${rateLimitBucket.clave} LIKE 'login:%'`);

    const [fila] = await cliente.db
      .insert(users)
      .values({
        email,
        passwordHash: await hashearPassword(PASSWORD),
        displayName: "Camino Real",
        // Verificado, para que la bandera no interfiera con lo que se prueba.
        emailVerified: new Date(),
        // Del RELOJ DE LA APLICACIÓN, igual que hará el registro real. Dejarlo
        // en manos de la base lo pondría con el reloj de Neon, que va ~600 ms
        // por delante: la sesión nacería revocada. Ver `marcaDeRevocacion`.
        sessionsValidFrom: marcaDeRevocacion(new Date()),
      })
      .returning({ id: users.id });
    if (fila === undefined) throw new Error("no se pudo crear el usuario");
    userId = fila.id;

    // EL SERVIDOR DE PRODUCCIÓN, no `dev`: es el que tiene el middleware
    // compilado y los callbacks reales.
    // ── SE COMPILA AQUÍ, Y NO ES POR COMODIDAD ──────────────────────────
    // `next start` sirve lo que haya en `.next`. Si el test no compila, una
    // edición en `auth.ts` o `sesion.ts` se prueba contra el build ANTERIOR:
    // el test se pone verde sobre código que ya no existe. Es el peor verde
    // posible —dice que la protección funciona cuando ni siquiera se ejecutó—
    // y me pasó al escribir este mismo fichero.
    // ── ¿HAY QUE COMPILAR, O YA ESTÁ COMPILADO? ───────────────────────
    //
    // En CI NO: el paso «Build de producción» acaba de dejar un `.next` de
    // ESTE commit y con ESTE entorno, y este test corre justo después.
    // Compilar aquí dentro además MATABA el worker de vitest —sin mensaje,
    // y sin que el fichero apareciera siquiera en el recuento—.
    //
    // En local SÍ, y no es opcional: `next start` sirve lo que haya en
    // `.next`, así que sin compilar una edición en `auth.ts` o `sesion.ts` se
    // probaría contra el build ANTERIOR. El test se pondría verde sobre
    // código que ya no existe —el peor verde posible, y me pasó escribiendo
    // este mismo fichero—. Por eso la bandera solo la pone el workflow, en el
    // único sitio donde saltarse el build es seguro.
    if (process.env.CAMINO_REAL_REUSA_BUILD !== "1") {
      await new Promise<void>((resolver, rechazar) => {
        let salidaBuild = "";
        const compilacion = spawn("npx", ["next", "build"], {
          cwd: process.cwd(),
          shell: process.platform === "win32",
          // NO `ignore`: tragarse esta salida es lo que hizo que un fallo de
          // compilación se viera como «el worker murió» y nada más.
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, NODE_ENV: "production" },
        });
        compilacion.stdout?.on("data", (d: Buffer) => (salidaBuild += d.toString()));
        compilacion.stderr?.on("data", (d: Buffer) => (salidaBuild += d.toString()));
        compilacion.on("exit", (codigo) =>
          codigo === 0
            ? resolver()
            : rechazar(
                new Error(
                  `next build salió con ${String(codigo)}

${salidaBuild.slice(-4000)}`,
                ),
              ),
        );
      });
    }

    servidor = spawn("npx", ["next", "start", "-p", String(PUERTO)], {
      cwd: process.cwd(),
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        // La ventana de acotado a CERO: cada petición consulta la base.
        //
        // No es fabricar el insumo — el token, la cookie, el middleware y los
        // callbacks son los reales. Es quitar una optimización que, con su
        // valor de producción, obligaría al test a esperar 60 segundos.
        // Ver `ventanaDeChequeoSegundos` en `sesion.ts`.
        AUTH_VENTANA_CHEQUEO_SEGUNDOS: "0",
      },
    });

    // Sin esto, un fallo de arranque se ve como «no arrancó» y no se sabe por qué.
    // La salida se ACOTA y se escribe TAMBIÉN en directo.
    //
    // Acumularla y enseñarla solo dentro del error parecía suficiente, y no lo
    // era: cuando el worker de vitest se cae, ese error no llega a contarse y
    // la salida se va con él. Un arranque fallido se veía entonces como
    // «Worker exited unexpectedly» y nada más — sesenta segundos de sondeo sin
    // una sola pista de por qué el servidor no contestaba.
    //
    // El tope evita lo contrario: sesenta segundos de errores repetidos
    // convertidos en un mensaje de megabytes.
    const TOPE_SALIDA = 8000;
    let salida = "";
    const anotar = (d: Buffer): void => {
      const texto = d.toString();
      salida = (salida + texto).slice(-TOPE_SALIDA);
      process.stdout.write(`[servidor] ${texto}`);
    };
    servidor.stdout?.on("data", anotar);
    servidor.stderr?.on("data", anotar);

    try {
      await esperarServidor();
    } catch (error) {
      throw new Error(`${(error as Error).message}

Salida del servidor:
${salida}`);
    }
  }, 180_000);

  afterAll(async () => {
    // `kill()` a secas no basta en Windows: `next start` lanza un hijo y el
    // padre muere dejando el puerto ocupado. Un test que deja basura hace que
    // el SIGUIENTE falle con EADDRINUSE, y el motivo real queda enterrado.
    await matarPuerto(PUERTO);
    servidor?.kill("SIGKILL");
    if (cliente !== undefined) {
      if (clavesALimpiar.length > 0) {
        await cliente.db
          .delete(rateLimitBucket)
          .where(inArray(rateLimitBucket.clave, clavesALimpiar));
      }
      await cliente.db.delete(users).where(eq(users.id, userId));
      await cliente.cerrar();
    }
  }, 30_000);

  /** Login POR EL ENDPOINT REAL de Auth.js, con su token CSRF. */
  async function iniciarSesion(nav: Navegador): Promise<void> {
    const rCsrf = await nav.ir("/api/auth/csrf");
    const { csrfToken } = (await rCsrf.json()) as { csrfToken: string };

    await nav.ir("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password: PASSWORD, csrfToken }).toString(),
    });
  }

  /**
   * La sesión que ve el servidor. `/api/auth/session` devuelve `null` —no un
   * objeto vacío— cuando no hay sesión, así que se normaliza aquí.
   */
  async function sesionActual(
    nav: Navegador,
    _base: string = BASE,
  ): Promise<{ user?: { id?: string } }> {
    const r = await nav.ir("/api/auth/session");
    const cuerpo: unknown = await r.json();
    return typeof cuerpo === "object" && cuerpo !== null
      ? (cuerpo as { user?: { id?: string } })
      : {};
  }

  it("el login por el endpoint real devuelve una cookie de sesión", async () => {
    const nav = new Navegador();
    await iniciarSesion(nav);

    expect(nav.tieneCookieDeSesion()).toBe(true);
    expect((await sesionActual(nav)).user?.id).toBe(userId);
  }, 60_000);

  it("con la cookie real se llega a /app; sin ella, redirige a /login", async () => {
    const conSesion = new Navegador();
    await iniciarSesion(conSesion);
    const sinSesion = new Navegador();

    const dentro = await conSesion.ir("/app");
    const fuera = await sinSesion.ir("/app");

    expect(dentro.status).toBe(200);
    // El middleware redirige, no devuelve la página.
    expect([302, 307].includes(fuera.status)).toBe(true);
    expect(fuera.headers.get("location")).toContain("/login");
  }, 60_000);

  it("UNA COOKIE ROBADA DEJA DE VALER AL CAMBIAR LA CONTRASEÑA", async () => {
    // ── El dueño entra ────────────────────────────────────────────────────
    const dueno = new Navegador();
    await iniciarSesion(dueno);
    expect((await sesionActual(dueno)).user?.id).toBe(userId);

    // ── Le roban la cookie ────────────────────────────────────────────────
    const ladron = dueno.clonar();
    expect((await sesionActual(ladron)).user?.id).toBe(userId);

    // ── El dueño cambia la contraseña ─────────────────────────────────────
    // Se escribe el corte tal como lo hará la Server Action de cambio de
    // contraseña: `sessions_valid_from = ahora`.
    await cliente.db
      .update(users)
      .set({
        passwordHash: await hashearPassword("otra contraseña completamente distinta"),
        sessionsValidFrom: new Date(),
      })
      .where(eq(users.id, userId));

    // ── LA COMPROBACIÓN ───────────────────────────────────────────────────
    // La MISMA cookie, atravesando el middleware y los callbacks reales.
    const despues = await sesionActual(ladron);

    expect(
      despues.user?.id,
      "la cookie robada SIGUE autenticando tras cambiar la contraseña",
    ).toBeUndefined();

    // Y la navegación a una página protegida tampoco pasa.
    const navegacion = await ladron.ir("/app");
    expect([302, 307].includes(navegacion.status)).toBe(true);
    expect(navegacion.headers.get("location")).toContain("/login");
  }, 120_000);

  it("BORRAR LA CUENTA invalida la sesión en la siguiente navegación", async () => {
    const otro = `camino-real-borrado-${marca}@ejemplo.test`;
    const [creado] = await cliente.db
      .insert(users)
      .values({
        email: otro,
        passwordHash: await hashearPassword(PASSWORD),
        emailVerified: new Date(),
        sessionsValidFrom: marcaDeRevocacion(new Date()),
      })
      .returning({ id: users.id });
    if (creado === undefined) throw new Error("no se pudo crear el usuario");

    const nav = new Navegador();
    const rCsrf = await nav.ir("/api/auth/csrf");
    const { csrfToken } = (await rCsrf.json()) as { csrfToken: string };
    await nav.ir("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: otro, password: PASSWORD, csrfToken }).toString(),
    });
    expect((await sesionActual(nav)).user?.id).toBe(creado.id);

    // Borrado real, en cascada.
    await cliente.db.delete(users).where(eq(users.id, creado.id));

    const despues = await sesionActual(nav);
    expect(despues.user?.id, "la sesión sobrevive al borrado de la cuenta").toBeUndefined();
  }, 120_000);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * EL LÍMITE DEL LOGIN, POR LA PUERTA QUE DE VERDAD SE ATACA.
   *
   * ── EL AGUJERO QUE ESTE TEST CIERRA ────────────────────────────────────
   *
   * El límite de `security.md` §5 vivía SOLO dentro de la Server Action de
   * `/login`. Pero el proveedor Credentials también es alcanzable
   * directamente en `POST /api/auth/callback/credentials` —lo monta Auth.js,
   * está fuera del matcher del middleware, y `/api/auth/csrf` regala el token
   * que hace falta—. Por esa puerta no había ningún límite.
   *
   * Medido antes del arreglo, contra la aplicación arrancada y la base real:
   *
   *     30 intentos fallidos en 5351 ms · máximo login:email = 5
   *     cubos del limitador encontrados: []
   *     tras 30 fallos, la contraseña correcta entra a la primera
   *
   * Cero cubos, cero bloqueo, y Argon2id ejecutado las 30 veces. Fuerza bruta
   * sin límite, y un amplificador de denegación de servicio de 19 MiB por
   * petición — exactamente lo que `security.md` §2 dice impedir.
   *
   * Lo encontraron DOS verificadores independientes el mismo día, cada uno por
   * su lado. La suite de unidad no podía verlo: probaba el orden dentro del
   * orquestador con dependencias inyectadas, nunca el endpoint.
   *
   * El límite está ahora en `authorize()` (`src/auth.ts`), que es el único
   * punto por el que pasan TODOS los intentos.
   * ═══════════════════════════════════════════════════════════════════════
   */
  describe("el límite del login, por el endpoint directo de Auth.js", () => {
    /**
     * CUENTA PROPIA, y no es cosmético.
     *
     * La primera versión reutilizaba la cuenta del resto del fichero, y el cubo
     * `login:email` es COMPARTIDO: los 3 intentos del primer caso dejaban el
     * contador a 3, así que en el segundo caso los «permitidos» ya estaban
     * bloqueados y las dos medianas salían iguales (297 ms contra 296 ms). El
     * test fallaba por un fallo del test, no del código — y de no haberlo
     * mirado, «arreglarlo» habría sido relajar la aserción hasta que pasara.
     */
    let emailAislado: string;
    let idAislado: string;

    beforeAll(async () => {
      emailAislado = `limite-${randomUUID().slice(0, 8)}@ejemplo.test`;
      const [fila] = await cliente.db
        .insert(users)
        .values({
          email: emailAislado,
          passwordHash: await hashearPassword(PASSWORD),
          emailVerified: new Date(),
          sessionsValidFrom: marcaDeRevocacion(new Date()),
        })
        .returning({ id: users.id });
      if (fila === undefined) throw new Error("no se pudo crear la cuenta aislada");
      idAislado = fila.id;
    }, 60_000);

    afterAll(async () => {
      if (idAislado !== undefined) {
        await cliente.db.delete(users).where(eq(users.id, idAislado));
      }
    }, 30_000);

    /** Un intento fallido por el endpoint crudo. Devuelve cuánto tardó. */
    async function intentoFallido(desdeIp: string): Promise<number> {
      const nav = new Navegador();
      const rCsrf = await nav.ir("/api/auth/csrf");
      const { csrfToken } = (await rCsrf.json()) as { csrfToken: string };

      const t0 = Date.now();
      await nav.ir("/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": desdeIp,
        },
        body: new URLSearchParams({
          email: emailAislado,
          password: "esta contraseña no es la buena",
          csrfToken,
        }).toString(),
      });
      return Date.now() - t0;
    }

    it("CUENTA los intentos que entran por el endpoint, no solo los de la pantalla", async () => {
      const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
      for (let i = 0; i < 3; i++) await intentoFallido(ip);

      const cubos = await cliente.db
        .select({ clave: rateLimitBucket.clave, contador: rateLimitBucket.contador })
        .from(rateLimitBucket)
        .where(sql`${rateLimitBucket.clave} = ${clavePorIp("login", ip)}`);

      // Antes del arreglo esta consulta devolvía CERO filas: el endpoint no
      // tocaba el limitador en absoluto.
      expect(cubos, "el endpoint directo no registra intentos").toHaveLength(1);
      expect(cubos[0]?.contador).toBeGreaterThanOrEqual(3);

      clavesALimpiar.push(
        clavePorIp("login", ip),
        clavePorEmail("login", emailAislado.toLowerCase()),
      );
    }, 60_000);

    it("UNA VEZ BLOQUEADO, NO EJECUTA ARGON2ID: la respuesta se abarata", async () => {
      // Es la mitad que importa. Si el límite se comprobara DESPUÉS del hash,
      // el contador subiría igual —el test anterior pasaría— y el endpoint
      // seguiría siendo un amplificador de denegación de servicio: 19 MiB y
      // decenas de ms de CPU por cada petición basura, facturados por
      // milisegundo en serverless.
      // El cubo por EMAIL lo comparten los dos casos de este describe, y el
      // anterior ya gastó tres intentos. Se limpia para que los `maximo`
      // primeros de aquí sean de verdad los permitidos: si no, se comparan
      // bloqueados contra bloqueados y las dos medianas salen iguales.
      await cliente.db
        .delete(rateLimitBucket)
        .where(
          sql`${rateLimitBucket.clave} = ${clavePorEmail("login", emailAislado.toLowerCase())}`,
        );

      const ip = `198.51.100.${Math.floor(Math.random() * 55) + 201}`;
      const maximo = LIMITES["login:email"].maximo;

      const tiempos: number[] = [];
      for (let i = 0; i < maximo + 4; i++) tiempos.push(await intentoFallido(ip));

      const antesDelCorte = tiempos.slice(0, maximo);
      const despuesDelCorte = tiempos.slice(maximo + 1);

      const mediana = (xs: number[]): number =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

      const conHash = mediana(antesDelCorte);
      const sinHash = mediana(despuesDelCorte);

      // Argon2id con m=19456 cuesta decenas de ms. Los bloqueados no lo pagan,
      // así que tienen que ser claramente más baratos. Se compara con holgura
      // porque la latencia de red a Neon domina y varía.
      expect(
        sinHash,
        `bloqueados ${String(sinHash)} ms vs permitidos ${String(conHash)} ms: ` +
          "los bloqueados NO deberían estar pagando el hash",
      ).toBeLessThan(conHash);

      clavesALimpiar.push(
        clavePorIp("login", ip),
        clavePorEmail("login", emailAislado.toLowerCase()),
      );
    }, 120_000);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * «RECORDARME», POR EL CAMINO REAL.
   *
   * Decisión del propietario: **12 horas** sin marcar, **30 días** marcada, y
   * la casilla viene desmarcada. La elección se congela en el token en el
   * momento del `authorize` y la caducidad se cuenta desde ahí.
   *
   * ── POR QUÉ ESTE TEST ARRANCA UN SEGUNDO SERVIDOR ──────────────────────
   *
   * Necesita duraciones de segundos para poder esperar a que caduquen, y el
   * resto del fichero necesita sesiones que duren lo normal. Dos entornos, dos
   * servidores — pero **un solo `next build`**, el de arriba: dos compilaciones
   * a la vez corrompen `.next`.
   *
   * ── QUÉ SE FABRICA AQUÍ: NADA ─────────────────────────────────────────
   *
   * La cookie la emite el servidor de verdad, tras un login de verdad contra el
   * endpoint de Auth.js. El token se descifra con el MISMO secreto y la MISMA
   * sal que usa la aplicación, y lo que se lee es el `exp` que ella escribió.
   * Acortar las duraciones por entorno no es fabricar el insumo: es quitar una
   * espera de doce horas, igual que `AUTH_VENTANA_CHEQUEO_SEGUNDOS` quita la de
   * sesenta segundos.
   *
   * La comprobación de comportamiento —esperar a que caduque y navegar— sí
   * atraviesa el middleware y los callbacks reales.
   *
   * ── VERIFICADO POR MUTACIÓN · 2026-08-24 ───────────────────────────────
   *
   * Son TRES piezas y cada una se puede desconectar por su cuenta, así que hay
   * tres mutaciones con tres firmas distintas:
   *
   * | Mutación | Qué se rompe | Rojo en |
   * |---|---|---|
   * | `const recordarme = false` en `authorize` | la casilla deja de leerse | «MARCADA…» + «Y SE CUMPLE…» |
   * | quitar `sesionCaducada(...)` del callback `jwt` | nadie expulsa al caducar | los DOS de comportamiento |
   * | quitar el `encode` propio | el `exp` vuelve al global de 30 días | los DOS de `exp` |
   * | quitar `sesionCaducada` del callback `jwt` de **`auth.config.ts`** (Edge) | el middleware refirma un token muerto | «no es solo el endpoint» |
   * | quitar `decidirAcceso` del handler de `middleware.ts` | `/app` deja de estar protegido | «se llega a /app» + «cookie robada» |
   *
   * **La segunda enseñó algo que yo daba por hecho y era falso:** creía que el
   * `exp` del JWT bastaría para echar a la sesión caducada, y que la
   * comprobación del callback era defensa en profundidad. No: con el `exp`
   * intacto y la comprobación fuera, la sesión corta **seguía autenticando**.
   * Quien de verdad expulsa es el callback. El `exp` es el que impide que un
   * token robado sirva fuera de plazo si alguien lo usa por otra vía.
   *
   * Las dos hacen falta, y ahora sé por qué en vez de suponerlo.
   *
   * ── Y DOS REGRESIONES QUE ESTE FICHERO CAZÓ EL MISMO DÍA ────────────────
   *
   * Las dos las introduje yo arreglando otra cosa, las dos pasaban `tsc`,
   * `eslint` y `build` con exit 0, y **ninguna suite de unidad podía verlas**:
   *
   * 1. **`/app` dejó de estar protegido: 200 sin sesión.** Al pasar un handler
   *    a `auth()` para generar el nonce de la CSP, `next-auth` deja de usar la
   *    rama que redirige cuando `authorized` devuelve `false` (ver `handleAuth`
   *    en sus fuentes). El callback seguía ahí, correcto, y sin efecto.
   *
   * 2. **El middleware refirmaba tokens caducados.** `auth.config.ts` no sabía
   *    nada de la caducidad, así que en cada navegación reponía el `exp`:
   *    `/api/auth/session` decía `null` mientras `/app` **pintaba la biblioteca
   *    entera con sus 83 animes**. Es el mismo mecanismo que ya destrozó la
   *    revocación de sesiones meses atrás — el refirmado del middleware
   *    borrando la marca que debía matar el token—, y volvió a colarse por otra
   *    puerta.
   *
   * Cuatro comprobaciones de este fichero, tres de ellas escritas para otra
   * cosa, son lo único que separó esas dos de producción.
   * ═══════════════════════════════════════════════════════════════════════
   */
  describe("«Recordarme» decide cuánto dura la sesión", () => {
    const PUERTO_CORTO = 3995;
    const BASE_CORTO = `http://127.0.0.1:${PUERTO_CORTO}`;
    /** Segundos. Cortas de verdad, para poder esperar a que caduquen. */
    const CORTA = 3;
    const LARGA = 300;

    let servidorCorto: ChildProcess;
    let emailDuracion: string;
    let idDuracion: string;

    beforeAll(async () => {
      await matarPuerto(PUERTO_CORTO);

      emailDuracion = `duracion-${randomUUID().slice(0, 8)}@ejemplo.test`;
      const [fila] = await cliente.db
        .insert(users)
        .values({
          email: emailDuracion,
          passwordHash: await hashearPassword(PASSWORD),
          emailVerified: new Date(),
          sessionsValidFrom: marcaDeRevocacion(new Date()),
        })
        .returning({ id: users.id });
      if (fila === undefined) throw new Error("no se pudo crear la cuenta de duración");
      idDuracion = fila.id;

      servidorCorto = spawn("npx", ["next", "start", "-p", String(PUERTO_CORTO)], {
        cwd: process.cwd(),
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "production",
          AUTH_VENTANA_CHEQUEO_SEGUNDOS: "0",
          AUTH_SESION_CORTA_SEGUNDOS: String(CORTA),
          AUTH_SESION_LARGA_SEGUNDOS: String(LARGA),
        },
      });

      await esperarServidor(120, BASE_CORTO);
    }, 120_000);

    afterAll(async () => {
      await matarPuerto(PUERTO_CORTO);
      servidorCorto?.kill("SIGKILL");
      if (idDuracion !== undefined) {
        await cliente.db.delete(users).where(eq(users.id, idDuracion));
      }
    }, 30_000);

    /** Login real contra el servidor corto. Devuelve el navegador con su cookie. */
    async function entrar(recordarme: boolean): Promise<Navegador> {
      const nav = new Navegador(BASE_CORTO);
      const rCsrf = await nav.ir("/api/auth/csrf");
      const { csrfToken } = (await rCsrf.json()) as { csrfToken: string };

      await nav.ir("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: emailDuracion,
          password: PASSWORD,
          recordarme: recordarme ? "true" : "false",
          csrfToken,
        }).toString(),
      });

      return nav;
    }

    /**
     * El `exp` que escribió la aplicación, leído del token que ella emitió.
     *
     * Se descifra con el secreto y la sal REALES —la sal de Auth.js es el
     * nombre de la cookie—, así que si el token no fuera el que la app emitió,
     * esto ni siquiera descifraría.
     */
    async function caducidadDelToken(nav: Navegador): Promise<number> {
      const { decode } = await import("next-auth/jwt");
      const nombreCookie = "authjs.session-token";
      const bruto = nav.cookie(nombreCookie);
      if (bruto === undefined) throw new Error("el servidor no devolvió cookie de sesión");

      const secreto = process.env.AUTH_SECRET;
      if (secreto === undefined) throw new Error("falta AUTH_SECRET");

      const token = await decode({ token: bruto, secret: secreto, salt: nombreCookie });
      const exp = token?.exp;
      if (typeof exp !== "number") throw new Error("el token no lleva `exp`");
      return exp;
    }

    it("SIN marcar, el token caduca a las 12 horas (aquí, acortadas)", async () => {
      const antes = Math.floor(Date.now() / 1000);
      const nav = await entrar(false);
      const exp = await caducidadDelToken(nav);

      // Con margen de 2 s por la latencia del login: lo que se comprueba es que
      // el plazo es el CORTO, no el largo.
      expect(exp - antes).toBeGreaterThanOrEqual(CORTA - 2);
      expect(exp - antes).toBeLessThanOrEqual(CORTA + 2);
    }, 60_000);

    it("MARCADA, el token caduca a los 30 días (aquí, acortados)", async () => {
      const antes = Math.floor(Date.now() / 1000);
      const nav = await entrar(true);
      const exp = await caducidadDelToken(nav);

      expect(exp - antes).toBeGreaterThanOrEqual(LARGA - 5);
      expect(exp - antes).toBeLessThanOrEqual(LARGA + 5);
    }, 60_000);

    it("Y SE CUMPLE: la sesión corta muere; la larga sigue viva", async () => {
      // La comprobación de COMPORTAMIENTO, que es la que de verdad importa. Un
      // `exp` correcto en un token que nadie mira no protege de nada.
      const corta = await entrar(false);
      const larga = await entrar(true);

      // Las dos entran ahora mismo.
      expect((await sesionActual(corta, BASE_CORTO)).user?.id).toBe(idDuracion);
      expect((await sesionActual(larga, BASE_CORTO)).user?.id).toBe(idDuracion);

      await new Promise((r) => setTimeout(r, (CORTA + 2) * 1000));

      // Y después de la ventana corta, solo una sigue.
      expect(
        (await sesionActual(corta, BASE_CORTO)).user?.id,
        "la sesión SIN «Recordarme» sigue viva pasadas sus 12 horas",
      ).toBeUndefined();
      expect(
        (await sesionActual(larga, BASE_CORTO)).user?.id,
        "la sesión CON «Recordarme» ha muerto antes de tiempo",
      ).toBe(idDuracion);
    }, 90_000);

    it("y la sesión corta tampoco entra en /app: no es solo el endpoint", async () => {
      const corta = await entrar(false);
      await new Promise((r) => setTimeout(r, (CORTA + 2) * 1000));

      const r = await corta.ir("/app", { redirect: "manual" });
      expect([302, 307], `/app devolvió ${String(r.status)} con una sesión caducada`).toContain(
        r.status,
      );
    }, 90_000);
  });
});
