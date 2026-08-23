import NextAuth from "next-auth";

import { authConfig } from "./auth.config";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MIDDLEWARE PROTEGE EL ENRUTADO. **NO ES EL LÍMITE DE SEGURIDAD.**
 *
 * Corre en Edge y solo comprueba que el JWT tenga firma válida. NO sabe si el
 * usuario sigue existiendo ni si sus sesiones han sido revocadas: eso exige
 * consultar Postgres, y aquí no hay Postgres.
 *
 * La comprobación REAL ocurre en cada Server Action y en cada lectura de datos,
 * vía `auth()` de `src/auth.ts`, que sí corre en Node.
 *
 * La tentación futura será confiar en esto. No lo hagas: un token de una cuenta
 * borrada pasa este middleware sin despeinarse. Lo que lo para es la consulta de
 * `evaluarSesion` aguas abajo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  /**
   * Se excluyen los recursos estáticos y las rutas de la API.
   *
   * `/api/*` queda FUERA a propósito: cada Route Handler comprueba la sesión por
   * su cuenta con `auth()`, en Node, donde sí puede consultar la base. Hacerlo
   * también aquí sería una comprobación más débil dando falsa sensación de red.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|texturas|.*\.(?:png|jpg|jpeg|webp|avif|svg|ico)$).*)",
  ],
};
