import "server-only";

import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { evaluarSesion, hayQueComprobarContraLaBase, type Sensibilidad } from "./lib/auth/sesion";
import { verificarPassword } from "./lib/auth/password";
import { seExigeVerificacionEmail } from "./lib/config/entorno";
import { db } from "./lib/db";
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
 * callback `session` de este fichero.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Marca del último chequeo contra la base, en segundos epoch. */
const CLAVE_ULTIMO_CHEQUEO = "cs";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
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
  const [fila] = await db()
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

        const [usuario] = await db()
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

    jwt({ token, user, trigger }) {
      if (user?.id !== undefined) {
        token.sub = user.id;
        // Recién emitido: se acaba de comprobar todo al autenticar.
        token[CLAVE_ULTIMO_CHEQUEO] = Math.floor(Date.now() / 1000);
      }

      // Un `update()` explícito desde el cliente fuerza el próximo chequeo.
      if (trigger === "update") {
        delete token[CLAVE_ULTIMO_CHEQUEO];
      }

      return token;
    },

    /**
     * AQUÍ ESTÁ EL LÍMITE DE SEGURIDAD REAL.
     *
     * Comprueba contra la base que el usuario existe, que no está desactivado y
     * que el token se emitió después de `sessions_valid_from`. Acotado a una
     * consulta cada 60 s en lecturas; las mutaciones usan
     * `exigirSesionParaMutar()`, que nunca se acota.
     */
    async session({ session, token }) {
      const userId = token.sub;
      if (userId === undefined) {
        // Sin `sub` no hay a quién comprobar. Se devuelve una sesión sin usuario,
        // que el resto del código trata como «no autenticado».
        return { ...session, user: undefined } as unknown as typeof session;
      }

      const ahoraSegundos = Math.floor(Date.now() / 1000);
      const hayQue = hayQueComprobarContraLaBase({
        sensibilidad: "LECTURA",
        ultimaComprobacion: numeroDelToken(token, CLAVE_ULTIMO_CHEQUEO),
        ahoraSegundos,
      });

      if (!hayQue) {
        return { ...session, user: { ...session.user, id: userId } };
      }

      const cuenta = await estadoDeCuenta(userId);
      const veredicto = evaluarSesion(
        cuenta === undefined
          ? null
          : { deletedAt: cuenta.deletedAt, sessionsValidFrom: cuenta.sessionsValidFrom },
        numeroDelToken(token, "iat"),
      );

      if (!veredicto.valida) {
        // La sesión se devuelve SIN usuario. `auth()` lo interpretará como no
        // autenticado y el middleware redirigirá al login en la siguiente
        // navegación.
        return { ...session, user: undefined } as unknown as typeof session;
      }

      token[CLAVE_ULTIMO_CHEQUEO] = ahoraSegundos;

      return {
        ...session,
        user: {
          ...session.user,
          id: userId,
          email: cuenta?.email ?? session.user.email,
          name: cuenta?.displayName ?? null,
          image: cuenta?.avatarUrl ?? null,
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
    return { userId, email: cuenta.email };
  }

  return { userId, email: sesion?.user?.email ?? "" };
}
