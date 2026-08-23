import "server-only";

import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { evaluarSesion, hayQueComprobarContraLaBase, type Sensibilidad } from "./lib/auth/sesion";
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
      },

      /**
       * OJO CON EL ORDEN. Aquí NO se comprueba el rate limit: eso ya lo ha hecho
       * la Server Action ANTES de llamar a `signIn`, porque Argon2id cuesta
       * 19 MiB y decenas de ms y este punto no debe alcanzarse bajo avalancha.
       * Ver `src/lib/auth/login.ts` y `security.md` §2.
       */
      async authorize(credenciales) {
        const email = typeof credenciales?.email === "string" ? credenciales.email.trim() : "";
        const password = typeof credenciales?.password === "string" ? credenciales.password : "";

        if (email.length === 0 || password.length === 0) return null;

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
        };
      },
    }),
  ],

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
        token[CLAVE_EMITIDO] = ahoraSegundos;
        token[CLAVE_ULTIMO_CHEQUEO] = ahoraSegundos;
        return token;
      }

      const userId = token.sub;
      if (userId === undefined) return null;

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
export async function exigirSesionParaMutar(): Promise<{ userId: string; email: string }> {
  return exigirSesion("MUTACION");
}

/** Sesión para una LECTURA. Acotada a una consulta cada 60 s. */
export async function exigirSesionParaLeer(): Promise<{ userId: string; email: string }> {
  return exigirSesion("LECTURA");
}

export class ErrorSesionInvalida extends Error {
  override readonly name = "ErrorSesionInvalida";
  readonly codigo = "NO_AUTENTICADO" as const;
  readonly estadoHttp = 401 as const;

  constructor(readonly motivo: string) {
    super("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
  }
}

async function exigirSesion(
  sensibilidad: Sensibilidad,
): Promise<{ userId: string; email: string }> {
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

    return { userId, email: cuenta.email };
  }

  return { userId, email: sesion?.user?.email ?? "" };
}
