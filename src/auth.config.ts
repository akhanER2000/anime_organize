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
      const haySesion = auth?.user !== undefined;
      const ruta = request.nextUrl.pathname;

      if (ruta === PREFIJO_PRIVADO || ruta.startsWith(`${PREFIJO_PRIVADO}/`)) {
        return haySesion;
      }

      if (haySesion && RUTAS_DE_AUTH.includes(ruta)) {
        return Response.redirect(new URL(PREFIJO_PRIVADO, request.nextUrl));
      }

      return true;
    },

    /**
     * Solo lo que se puede hacer sin base de datos: copiar el `sub` al token.
     * La comprobación de revocación se añade en `src/auth.ts`.
     */
    jwt({ token, user }) {
      if (user?.id !== undefined) {
        token.sub = user.id;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;
