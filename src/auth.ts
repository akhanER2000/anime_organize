import "server-only";

import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { encode as encodeJwtPorDefecto } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { LARGA_POR_DEFECTO, segundosRestantes, sesionCaducada } from "./lib/auth/duracion";
import { evaluarSesion, hayQueComprobarContraLaBase, type Sensibilidad } from "./lib/auth/sesion";
import { ContextoUsuario } from "./lib/db/contexto";
import {
  clavePorEmail,
  clavePorIp,
  ipDelCliente,
  registrarIntentos,
  type NombreLimite,
} from "./lib/rate-limit";
import { verificarPassword } from "./lib/auth/password";
import { seExigeVerificacionEmail } from "./lib/config/entorno";
import { dbInterna } from "./lib/db/interno";
import { users } from "./lib/db/schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN COMPLETA DE AUTH.JS — CORRE EN NODE.
 *
 * Aquí SÍ hay base de datos y Argon2id. La versión apta para Edge,
 * que usa el middleware, es `auth.config.ts` y no importa nada de esto.
 *
 * Ver `.claude/rules/security.md` §1 bis: el middleware protege el enrutado, no
 * es el límite de seguridad. Lo que de verdad para a un token revocado es el
 * callback `jwt` de este fichero — **`jwt`, no `session`**: es el único cuyo
 * valor de retorno se persiste, y el único que puede invalidar devolviendo
 * `null`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Marca del último chequeo contra la base, en segundos epoch. */
const CLAVE_ULTIMO_CHEQUEO = "cs";

/**
 * Marca PROPIA de emisión, en segundos epoch.
 *
 * NO se usa `iat`: el middleware re-firma el JWT en cada navegación y
 * `jwt.encode()` lo pone a «ahora», así que `iat` nunca envejece y la
 * revocación no se dispararía jamás. Esta marca se pone SOLO al autenticar y
 * el callback `jwt` la copia intacta en cada refresco.
 */
const CLAVE_EMITIDO = "em";

/**
 * «Recordarme», guardado en el token en el momento del `authorize`.
 *
 * Nombre corto porque el JWT viaja en una cookie en cada petición, igual que
 * `em` y `cs`. Lo que decide es cuánto vive la sesión: 12 horas si está a
 * `false` —el valor por defecto— y 30 días si el usuario marcó la casilla.
 * Ver `src/lib/auth/duracion.ts`.
 */
const CLAVE_RECORDARME = "rd";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      /**
       * Marca de emisión del token, en segundos epoch.
       *
       * Viaja hasta aquí para que `exigirSesionParaMutar` pueda comprobar la
       * revocación SIN volver a decodificar el JWT. No es sensible: es una
       * fecha, y quien tiene la sesión ya la tiene.
       */
      emitido?: number | undefined;
    };
  }

  /**
   * `authorize` devuelve la elección de «Recordarme» junto al usuario.
   *
   * No es un dato de la CUENTA —no se guarda en `users`—: es una preferencia de
   * ESTA sesión, y su único destino es el callback `jwt`, que la congela en el
   * token. Se declara aquí porque Auth.js tipa el retorno de `authorize` como
   * `User`, y sin la augmentación el campo se perdería en silencio.
   */
  interface User {
    recordarme?: boolean;
  }
}

/**
 * Lee un campo numérico del token sin augmentación de módulo.
 *
 * El JWT de Auth.js es un objeto abierto; declarar la forma con
 * `declare module` ata el proyecto a una ruta interna del paquete que en la beta
 * v5 cambia entre versiones. Un guard local es más estable y no miente sobre el
 * tipo: lo comprueba.
 */
function numeroDelToken(token: Record<string, unknown>, clave: string): number | undefined {
  const valor = token[clave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

/** Estado de la cuenta, por clave primaria. La consulta más barata posible. */
async function estadoDeCuenta(userId: string) {
  const [fila] = await dbInterna()
    .select({
      deletedAt: users.deletedAt,
      sessionsValidFrom: users.sessionsValidFrom,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return fila;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * SIN ADAPTADOR, A PROPÓSITO Y POR AHORA.
   *
   * `DrizzleAdapter` exige un esquema con SUS nombres de columna: `name`,
   * `image`, `refresh_token`, `access_token`… El nuestro usa `display_name`,
   * `avatar_url` y camelCase, que es lo que dicta `db-conventions.md`.
   *
   * Cablearlo hoy obligaría a deformar el esquema **para un adaptador que no se
   * usa**: el proveedor Credentials de Auth.js v5 fuerza JWT, así que ni
   * `sessions` ni `accounts` reciben una fila mientras Google esté apagado.
   *
   * Se añadirá el día que se active Google, y ESE día se decide si se renombran
   * las columnas o se le pasa un mapeo. Mientras tanto, las tablas están creadas
   * y vacías —no rotas— y el esquema conserva sus convenciones.
   * Ver `.claude/rules/db-conventions.md` § «Tablas que están vacías A PROPÓSITO».
   * ══════════════════════════════════════════════════════════════════════════
   */

  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
        // Declararla aquí es lo que hace que Auth.js la deje pasar hasta
        // `authorize`. Sin esta línea, el campo del formulario llega y se
        // descarta: la casilla marcaría y no haría nada, que es exactamente lo
        // que había que arreglar.
        recordarme: { label: "Recordarme", type: "checkbox" },
      },

      /**
       * ═══════════════════════════════════════════════════════════════════
       * EL RATE LIMIT VA AQUÍ, Y ANTES ESTABA EN EL SITIO EQUIVOCADO.
       *
       * Este comentario decía que no hacía falta comprobar el límite aquí
       * «porque ya lo ha hecho la Server Action antes de llamar a `signIn`».
       * **Era falso**, y lo demostró un agente cuyo único trabajo era refutar
       * las afirmaciones de este repositorio:
       *
       *   `POST /api/auth/callback/credentials` es un endpoint PÚBLICO que
       *   monta Auth.js, y llega hasta aquí **sin pasar por ninguna Server
       *   Action**. El matcher del middleware lo excluye a propósito. Medido
       *   contra la aplicación arrancada y la base real:
       *
       *       30 intentos fallidos en 5351 ms · máximo login:email = 5
       *       cubos del limitador encontrados: []
       *       tras 30 fallos, la contraseña correcta entra a la primera
       *
       *   Cero cubos, cero bloqueo, y Argon2id ejecutado las 30 veces (~178 ms
       *   por intento). La fuerza bruta estaba abierta de par en par, y la
       *   amplificación de denegación de servicio que `security.md` §2 dice
       *   impedir, disponible.
       *
       * La lección es la de siempre en este proyecto: **la protección estaba
       * escrita, era correcta, y no estaba en el camino que la gente recorre.**
       * `authorize` es el único punto por el que pasan TODOS los intentos de
       * login —la Server Action, el endpoint directo, y cualquier cliente
       * futuro—, así que es el único sitio donde el límite significa algo.
       *
       * La Server Action mantiene su comprobación: sirve para devolver un 429
       * con mensaje decente en vez de un «credenciales inválidas» genérico.
       * Que se cuente dos veces un intento por la UI es aceptable — el límite
       * queda más estricto, nunca más laxo.
       * ═══════════════════════════════════════════════════════════════════
       */
      async authorize(credenciales, peticion) {
        const email = typeof credenciales?.email === "string" ? credenciales.email.trim() : "";
        const password = typeof credenciales?.password === "string" ? credenciales.password : "";

        // ── «RECORDARME» SE LEE AQUÍ, Y SOLO AQUÍ ─────────────────────────
        // Llega como cadena por el formulario. **Cualquier cosa que no sea un
        // "true" explícito es `false`**: la opción larga se elige a propósito,
        // no por un valor ambiguo que se cuele. Es la misma razón por la que la
        // casilla viene desmarcada.
        const recordarme = credenciales?.recordarme === "true";

        if (email.length === 0 || password.length === 0) return null;

        // ── LÍMITE ANTES DE LA BASE Y ANTES DEL HASH ──────────────────────
        // En este orden exacto: una petición bloqueada no consulta al usuario
        // ni ejecuta Argon2id. Es lo que impide que el login sea un
        // amplificador de denegación de servicio.
        if (!(await sePermiteIntentoDeLogin(email, peticion))) {
          // `null` = «no autenticado», indistinguible de una contraseña mala.
          // Deliberado: decir «demasiados intentos» aquí confirmaría que la
          // cuenta existe y merece la pena seguir insistiendo. Quien entra por
          // la pantalla recibe el mensaje bueno desde la Server Action.
          return null;
        }

        const [usuario] = await dbInterna()
          .select({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            emailVerified: users.emailVerified,
            deletedAt: users.deletedAt,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // SIEMPRE se verifica, exista o no el usuario: con `null`,
        // `verificarPassword` usa el hash señuelo y tarda lo mismo. Es lo que
        // impide enumerar cuentas cronometrando. Ver `password.ts`.
        const correcta = await verificarPassword(password, usuario?.passwordHash ?? null);

        if (usuario === undefined || usuario.deletedAt !== null || !correcta) return null;

        if (seExigeVerificacionEmail() && usuario.emailVerified === null) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.displayName,
          image: usuario.avatarUrl,
          // Viaja hasta el callback `jwt`, que es quien puede escribir en el
          // token. No se guarda en la base: es una preferencia de ESTA sesión.
          recordarme,
        };
      },
    }),
  ],

  /**
   * ── LA COOKIE DURA LO MÁXIMO; EL TOKEN, LO QUE TOQUE ──────────────────────
   *
   * Auth.js calcula la caducidad de la COOKIE con `session.maxAge`, que es
   * global: no hay forma oficial de variarla por inicio de sesión. Lo que sí es
   * variable es el `exp` del JWT, con un `encode` propio (abajo).
   *
   * Así que la cookie se emite con el plazo largo y **el token manda**: pasadas
   * las 12 horas de una sesión corta, el JWT ya no descifra, Auth.js lo trata
   * como si no hubiera sesión y limpia la cookie en esa misma petición.
   *
   * La contrapartida, dicha sin adornos: en un ordenador ajeno queda una cookie
   * hasta 30 días. **No da acceso a nada** —lleva un token muerto— pero está
   * ahí. Si algún día molesta, la salida es leer la elección desde una cookie
   * propia en la función de configuración de `NextAuth((request) => …)`.
   */
  session: { strategy: "jwt", maxAge: LARGA_POR_DEFECTO },

  jwt: {
    /**
     * El `exp` del JWT se alinea con la caducidad ABSOLUTA de la sesión.
     *
     * Auth.js refirma el token en cada navegación, y su `encode` por defecto
     * usaría `session.maxAge` cada vez: 30 días, siempre, renovados. Eso
     * convertiría cualquier sesión en eterna mientras se navegue.
     *
     * Aquí se calcula lo que le QUEDA desde `em`, así que el token caduca
     * cuando toca por muchas veces que se refirme.
     */
    async encode(parametros) {
      const token = parametros.token ?? {};

      return encodeJwtPorDefecto({
        ...parametros,
        maxAge: segundosRestantes({
          emitidoMs: numeroDelToken(token, CLAVE_EMITIDO),
          recordarme: token[CLAVE_RECORDARME] === true,
        }),
      });
    },
  },

  callbacks: {
    ...authConfig.callbacks,

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * AQUÍ ESTÁ EL LÍMITE DE SEGURIDAD REAL. **En `jwt`, no en `session`.**
     *
     * DOS FALLOS QUE ENCONTRÓ UNA REVISIÓN ADVERSARIAL, y los dos anulaban por
     * completo la revocación de sesiones:
     *
     * 1. **`iat` NO SIRVE COMO FECHA DE EMISIÓN.** El middleware de Auth.js
     *    llama a `getSession()` en cada navegación, y eso **vuelve a firmar el
     *    JWT** y lo reenvía en un `Set-Cookie`. `jwt.encode()` llama a
     *    `setIssuedAt()`, así que `iat` es SIEMPRE «ahora».
     *
     *    Secuencia real: 10:00 te roban la cookie. 10:05 cambias la contraseña
     *    → `sessions_valid_from = 10:04:59`. 10:06 el atacante carga cualquier
     *    página → el middleware le devuelve el token re-firmado con `iat=10:06`
     *    → `evaluarSesion` compara 10:06 > 10:04:59 y **lo deja pasar para
     *    siempre**.
     *
     *    Solución: una marca PROPIA (`emitido`) que se pone SOLO al autenticar.
     *    Sobrevive a los re-firmados porque este callback la copia tal cual.
     *
     * 2. **Escribir en `token` desde el callback `session` NO PERSISTE.** El
     *    orden es `jwt` → codificar → `session`. Lo que toca `session` se pierde
     *    en la siguiente petición, así que el acotado de 60 s no acotaba nada:
     *    consultaba la base en CADA petición.
     *
     * Por eso todo vive aquí: `jwt` es lo único cuyo valor de retorno se
     * persiste, y devolver `null` invalida la sesión de verdad.
     * ═══════════════════════════════════════════════════════════════════════
     */
    async jwt({ token, user, trigger }) {
      const ahoraSegundos = Math.floor(Date.now() / 1000);

      // ── Autenticación: se acaba de comprobar todo. ──────────────────────
      if (user?.id !== undefined) {
        token.sub = user.id;
        // MILISEGUNDOS, no segundos: ver `evaluarSesion`. `em` es un claim
        // nuestro, no el `iat` del estándar, y no truncarlo cierra dos agujeros.
        token[CLAVE_EMITIDO] = Date.now();
        token[CLAVE_ULTIMO_CHEQUEO] = ahoraSegundos;
        // La elección se congela AQUÍ, en el instante del `authorize`, y la
        // caducidad se cuenta desde `em`. Ni la elección ni la fecha se
        // renuevan después: un refirmado no alarga una sesión.
        token[CLAVE_RECORDARME] = user.recordarme === true;
        return token;
      }

      const userId = token.sub;
      if (userId === undefined) return null;

      // ── LA CADUCIDAD SE COMPRUEBA EN CADA PETICIÓN, ANTES QUE NADA ───────
      // Va antes del acotado de 60 s a propósito: es aritmética sobre el propio
      // token, no cuesta una consulta, y no puede quedar «pendiente del próximo
      // chequeo». Una sesión caducada muere en la siguiente navegación, no
      // hasta un minuto después.
      if (
        sesionCaducada({
          emitidoMs: numeroDelToken(token, CLAVE_EMITIDO),
          recordarme: token[CLAVE_RECORDARME] === true,
        })
      ) {
        return null;
      }

      // Un `update()` explícito desde el cliente fuerza el chequeo.
      const forzar = trigger === "update";

      const hayQue =
        forzar ||
        hayQueComprobarContraLaBase({
          sensibilidad: "LECTURA",
          ultimaComprobacion: numeroDelToken(token, CLAVE_ULTIMO_CHEQUEO),
          ahoraSegundos,
        });

      if (!hayQue) return token;

      const cuenta = await estadoDeCuenta(userId);
      const veredicto = evaluarSesion(
        cuenta === undefined
          ? null
          : { deletedAt: cuenta.deletedAt, sessionsValidFrom: cuenta.sessionsValidFrom },
        // La marca PROPIA, no `iat`. Sin ella —un token de antes de este
        // cambio—, se fuerza el rechazo: ante la duda, fuera.
        numeroDelToken(token, CLAVE_EMITIDO),
      );

      // `null` invalida la sesión de verdad: Auth.js borra la cookie.
      if (!veredicto.valida) return null;

      token[CLAVE_ULTIMO_CHEQUEO] = ahoraSegundos;
      // El perfil se refresca aprovechando la consulta: si el usuario cambia su
      // nombre en Ajustes, la barra superior se entera en el próximo chequeo sin
      // una consulta extra.
      if (cuenta?.email !== undefined) token.email = cuenta.email;
      token.name = cuenta?.displayName ?? null;
      token.picture = cuenta?.avatarUrl ?? null;

      return token;
    },

    /**
     * Solo proyecta el token a la sesión. **No consulta la base** y **no escribe
     * en el token**: lo que se escriba aquí se pierde (ver el comentario de
     * `jwt`). Si el token llegó hasta aquí, `jwt` ya lo validó.
     */
    session({ session, token }) {
      const userId = token.sub;
      if (userId === undefined) {
        return { ...session, user: undefined } as unknown as typeof session;
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
          email: typeof token.email === "string" ? token.email : session.user.email,
          name: typeof token.name === "string" ? token.name : null,
          image: typeof token.picture === "string" ? token.picture : null,
          emitido: numeroDelToken(token, CLAVE_EMITIDO),
        },
      };
    },
  },
});

/**
 * Sesión para una MUTACIÓN. Comprueba contra la base **siempre**, sin caché.
 *
 * Toda Server Action que escriba —y todo lo que toque la cuenta: ajustes,
 * contraseña, borrado, vinculación— usa esta y no `auth()`. La ventana de una
 * sesión revocada para escribir es CERO.
 *
 * @throws {ErrorSesionInvalida} si la sesión ya no vale.
 */
export async function exigirSesionParaMutar(): Promise<SesionVerificada> {
  return exigirSesion("MUTACION");
}

/** Sesión para una LECTURA. Acotada a una consulta cada 60 s. */
export async function exigirSesionParaLeer(): Promise<SesionVerificada> {
  return exigirSesion("LECTURA");
}

/**
 * Lo que devuelven las dos funciones de arriba.
 *
 * ── EL `ctx` FALTABA, Y ESO DEJABA EL CONTRATO SIN USAR ────────────────────
 *
 * Devolvían `{ userId, email }`. El `ContextoUsuario` —toda la maquinaria de
 * tipado nominal, marca privada, testigo de construcción y doce intentos de
 * salto verificados en CI— **no se podía obtener en ninguna parte de la
 * aplicación**: `desdeSesionVerificada` solo se llamaba desde el helper de
 * pruebas, y el ejemplo que la propia puerta pública documentaba
 * (`const { ctx } = await exigirSesionParaLeer()`) ni siquiera compilaba.
 *
 * Lo destapó el agente refutador: las doce barreras del contrato aguantaban
 * porque **ninguna pantalla consultaba datos de usuario todavía**. El día que
 * la primera lo intentara, se habría encontrado con que la única vía oficial no
 * existía — y el atajo habría sido inevitable.
 *
 * Es el mismo patrón que este proyecto lleva persiguiendo todo el día: una
 * protección escrita, correcta, verificada… y desconectada. Aquí el síntoma era
 * más sutil, porque no fallaba nada: simplemente no había nada conectado.
 */
export type SesionVerificada = {
  /** La llave del vault. No se construye en ningún otro sitio. */
  ctx: ContextoUsuario;
  userId: string;
  email: string;
};

export class ErrorSesionInvalida extends Error {
  override readonly name = "ErrorSesionInvalida";
  readonly codigo = "NO_AUTENTICADO" as const;
  readonly estadoHttp = 401 as const;

  constructor(readonly motivo: string) {
    super("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
  }
}

async function exigirSesion(sensibilidad: Sensibilidad): Promise<SesionVerificada> {
  const sesion = await auth();
  const userId = sesion?.user?.id;

  if (userId === undefined) {
    throw new ErrorSesionInvalida("SIN_SESION");
  }

  // En una mutación NO se confía en lo que dijo el callback de sesión, que pudo
  // servirse de la ventana de 60 s. Se vuelve a preguntar.
  if (sensibilidad === "MUTACION") {
    const cuenta = await estadoDeCuenta(userId);
    if (cuenta === undefined) {
      throw new ErrorSesionInvalida("USUARIO_NO_EXISTE");
    }
    if (cuenta.deletedAt !== null) {
      throw new ErrorSesionInvalida("CUENTA_DESACTIVADA");
    }

    // Y TAMBIÉN el corte de revocación. Antes solo se miraba `deleted_at`, así
    // que una sesión revocada por cambio de contraseña podía SEGUIR ESCRIBIENDO
    // durante la ventana de 60 s — justo lo contrario de «ventana CERO para
    // escrituras», que es lo que promete `security.md` §1 bis.
    //
    // Se compara con la marca de emisión REAL, que viaja en la sesión. Usar
    // `Date.now()` aquí sería el mismo error que usar `iat`: siempre pasaría.
    const veredicto = evaluarSesion(
      { deletedAt: cuenta.deletedAt, sessionsValidFrom: cuenta.sessionsValidFrom },
      sesion?.user?.emitido,
    );

    if (!veredicto.valida) {
      throw new ErrorSesionInvalida(veredicto.motivo);
    }

    return {
      // AQUÍ nace el único `ContextoUsuario` que existe en producción, y nace
      // DESPUÉS de haber comprobado contra la base que la cuenta vive y que la
      // sesión no está revocada. Ese es el significado del nombre.
      ctx: ContextoUsuario.desdeSesionVerificada(userId),
      userId,
      email: cuenta.email,
    };
  }

  return {
    ctx: ContextoUsuario.desdeSesionVerificada(userId),
    userId,
    email: sesion?.user?.email ?? "",
  };
}

/**
 * ¿Se permite este intento de login?
 *
 * Dos claves independientes, como manda `security.md` §5: por **email** frena
 * la fuerza bruta contra UNA cuenta aunque el atacante rote IPs —que es
 * barato—, y por **IP** frena el barrido de muchas cuentas desde un mismo
 * origen. Se registran las dos aunque una ya haya bloqueado: cortocircuitar
 * dejaría el contador de la otra sin avanzar.
 *
 * El email se normaliza antes de construir la clave. `users.email` es `citext`,
 * así que sin normalizar `A@B.com` y `a@b.com` consumirían cubos distintos y el
 * límite se saltaría cambiando la caja de las letras.
 *
 * **Falla cerrado.** Si la base no responde, se deniega — y no es una decisión
 * dura: el login necesita la base para verificar la contraseña, así que si está
 * caída no hay login que permitir.
 */
async function sePermiteIntentoDeLogin(email: string, peticion: unknown): Promise<boolean> {
  const emailNormalizado = email.trim().toLowerCase();

  const claves: { nombre: NombreLimite; clave: string }[] = [
    { nombre: "login:email", clave: clavePorEmail("login", emailNormalizado) },
  ];

  // `authorize` recibe la petición como segundo argumento, pero su tipo no lo
  // garantiza en todas las versiones: se estrecha en vez de castear.
  const cabeceras =
    typeof peticion === "object" && peticion !== null && "headers" in peticion
      ? (peticion as { headers: Headers }).headers
      : undefined;

  const ip = cabeceras !== undefined ? ipDelCliente(cabeceras) : null;
  if (ip !== null) {
    claves.push({ nombre: "login:ip", clave: clavePorIp("login", ip) });
  }

  try {
    return (await registrarIntentos(claves)).permitido;
  } catch {
    return false;
  }
}
