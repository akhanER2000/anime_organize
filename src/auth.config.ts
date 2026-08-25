import { sesionCaducada } from "./lib/auth/duracion";

import type { NextAuthConfig } from "next-auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN APTA PARA EL RUNTIME EDGE.
 *
 * El middleware de Auth.js v5 corre en **Edge**, donde NO existen:
 *   · módulos nativos (Argon2id),
 *   · el driver TCP/WebSocket de Neon,
 *   · buena parte de las APIs de Node.
 *
 * Por eso este fichero **no importa el adaptador, ni la base, ni el proveedor de
 * credenciales**. Solo lo justo para decidir el enrutado. La configuración
 * completa vive en `src/auth.ts`, que corre en Node.
 *
 * Si algún día alguien importa aquí `@/lib/db` o `@/lib/auth/password`, el build
 * del middleware revienta —o peor, falla en runtime en producción—.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Rutas del vault. Todo lo que cuelgue de aquí exige sesión. */
const PREFIJO_PRIVADO = "/app";

/** Rutas de autenticación: con sesión iniciada no tiene sentido volver a ellas. */
const RUTAS_DE_AUTH = ["/login", "/registro", "/recuperar"];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA REGLA DE ENRUTADO, EN UN SOLO SITIO.
 *
 * ── POR QUÉ ESTÁ EXTRAÍDA Y NO DENTRO DEL CALLBACK ────────────────────────
 *
 * Porque hay **dos** consumidores, y descubrirlo costó una regresión de
 * seguridad de las gordas.
 *
 * `src/middleware.ts` pasa un handler propio a `auth()` para poder generar el
 * nonce de la CSP por petición. Y mirando el código de `next-auth`:
 *
 *     if (authorized instanceof Response)      → se usa esa respuesta
 *     else if (userMiddlewareOrRoute)          → se usa la del handler
 *     else if (!authorized)                    → se redirige al login
 *
 * **En cuanto hay handler, la última rama no se alcanza jamás.** Así que el
 * `return haySesion` de este callback dejó de proteger nada: `/app` empezó a
 * responder **200 sin sesión**, y nada en el build ni en el lint lo dijo. Lo
 * cazó el test del camino real, que pide `/app` con y sin cookie.
 *
 * Ahora la regla vive aquí y la llaman los dos: el callback —para cuando no hay
 * handler— y el middleware, que la aplica él mismo antes de añadir el nonce.
 * Una regla, dos consumidores, cero copias que se desincronicen.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export type DecisionAcceso = true | false | Response;

export function decidirAcceso({
  haySesion,
  url,
}: {
  haySesion: boolean;
  url: URL;
}): DecisionAcceso {
  const ruta = url.pathname;

  // El vault: sin sesión no se entra. La comprobación REAL —cuenta viva,
  // sesiones no revocadas— la hace `auth()` en Node, aguas abajo.
  if (ruta === PREFIJO_PRIVADO || ruta.startsWith(`${PREFIJO_PRIVADO}/`)) {
    return haySesion;
  }

  // Con sesión, las pantallas de auth no tienen sentido: al vault.
  if (haySesion && RUTAS_DE_AUTH.includes(ruta)) {
    return Response.redirect(new URL(PREFIJO_PRIVADO, url));
  }

  return true;
}

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: { strategy: "jwt" },

  // Se rellenan en `src/auth.ts`. Aquí vacío A PROPÓSITO: el proveedor de
  // credenciales necesita Argon2 y la base, que no existen en Edge.
  providers: [],

  callbacks: {
    /**
     * Decide el ENRUTADO, no la seguridad.
     *
     * Lo único que puede saber aquí es si hay un token con firma válida. NO
     * puede saber si el usuario sigue existiendo ni si sus sesiones han sido
     * revocadas: eso exige consultar Postgres, y aquí no hay Postgres.
     *
     * Ver el aviso de `.claude/rules/security.md` §1 bis.
     */
    authorized({ auth, request }) {
      return decidirAcceso({ haySesion: auth?.user !== undefined, url: request.nextUrl });
    },

    /**
     * Solo lo que se puede hacer sin base de datos: copiar el `sub` al token.
     * La comprobación de revocación se añade en `src/auth.ts`.
     */
    jwt({ token, user }) {
      if (user?.id !== undefined) {
        token.sub = user.id;
      }

      // ── LA CADUCIDAD SE COMPRUEBA TAMBIÉN AQUÍ, EN EDGE ────────────────
      //
      // Y no es duplicar la de `src/auth.ts`: es que **hacen falta las dos**.
      //
      // El middleware refirma el JWT en cada navegación usando ESTA
      // configuración. Sin esta comprobación, refirmaba tan tranquilo un token
      // caducado y le ponía un `exp` nuevo: `/api/auth/session` decía `null`
      // —porque el lado Node sí comprobaba— mientras `/app` **seguía pintando
      // la biblioteca con sus 83 animes**. Medido, no supuesto.
      //
      // Es exactamente el mismo mecanismo que ya destrozó la revocación de
      // sesiones en su día: el refirmado del middleware borrando la marca que
      // debía matar el token. Dos veces la misma trampa.
      //
      // Aquí se puede hacer porque es ARITMÉTICA PURA sobre el propio token:
      // no hace falta Postgres, que es lo que Edge no tiene. Lo que sigue sin
      // poder saberse aquí es si la cuenta existe o si las sesiones fueron
      // revocadas: eso sigue siendo cosa de `auth()` en Node.
      if (
        sesionCaducada({
          emitidoMs: typeof token.em === "number" ? token.em : undefined,
          recordarme: token.rd === true,
        })
      ) {
        return null;
      }

      return token;
    },
  },
} satisfies NextAuthConfig;
