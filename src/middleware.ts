import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig, decidirAcceso } from "./auth.config";
import { CABECERA_NONCE, construirCsp, generarNonce } from "./lib/security/csp";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MIDDLEWARE HACE DOS COSAS: ENRUTADO Y NONCE. NINGUNA ES EL LÍMITE DE
 * SEGURIDAD DE LOS DATOS.
 *
 * ── 1. ENRUTADO ───────────────────────────────────────────────────────────
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
 *
 * ── 2. EL NONCE DE LA CSP ─────────────────────────────────────────────────
 * Aquí se genera un nonce por petición y se pone en DOS sitios:
 *
 *   · en las cabeceras de la PETICIÓN, porque es de ahí de donde Next lo lee
 *     para estamparlo en sus propios `<script>`;
 *   · en las cabeceras de la RESPUESTA, que es la CSP que aplica el navegador.
 *
 * Si solo se pusiera en la respuesta, Next no sabría qué nonce usar y sus
 * scripts en línea seguirían bloqueados: la aplicación se serviría en blanco,
 * que es exactamente el fallo que esto arregla. Ver `src/lib/security/csp.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const { auth } = NextAuth(authConfig);

export default auth((peticion) => {
  // ── LA AUTORIZACIÓN SE APLICA AQUÍ, Y ANTES NO SE APLICABA ────────────────
  //
  // Al pasar un handler a `auth()`, `next-auth` **deja de usar la rama que
  // redirige cuando `authorized` devuelve `false`** (mirar `handleAuth` en
  // `node_modules/next-auth/lib/index.js`: el `else if (!authorized)` va
  // después del `else if (userMiddlewareOrRoute)`).
  //
  // O sea que este handler, escrito para el nonce de la CSP, **desactivó en
  // silencio la protección de `/app`**: 200 sin sesión. El build salía a 0, el
  // lint también, y ningún test de unidad podía verlo. Lo cazó el test del
  // camino real pidiendo `/app` con cookie y sin ella.
  //
  // La regla no se copia: se llama a `decidirAcceso`, la misma que usa el
  // callback `authorized`. Dos consumidores, una definición.
  const decision = decidirAcceso({
    haySesion: peticion.auth?.user !== undefined,
    url: peticion.nextUrl,
  });

  if (decision instanceof Response) return decision;

  if (decision === false) {
    const alLogin = peticion.nextUrl.clone();
    alLogin.pathname = "/login";
    // Para volver a donde iba después de entrar.
    alLogin.searchParams.set("callbackUrl", peticion.nextUrl.href);
    return NextResponse.redirect(alLogin);
  }

  const nonce = generarNonce();
  const csp = construirCsp({ nonce, desarrollo: process.env.NODE_ENV !== "production" });

  // ── SOLO SE TOCAN LAS CABECERAS DE UN DOCUMENTO, NO LAS DE UNA RSC ────────
  //
  // Next pide los trozos de página para la navegación de cliente con la
  // cabecera `RSC: 1`. Si el middleware **modifica las cabeceras de petición**
  // en esas peticiones, Next las trata como una reescritura, la carga útil no
  // casa y el navegador **aborta la navegación**: `net::ERR_ABORTED`.
  //
  // Consecuencia medida: pulsar cualquier enlace de la aplicación no hacía
  // nada. La URL no cambiaba, no salía ni un error en consola, y el servidor
  // devolvía la página correcta si la pedías directamente. La aplicación se
  // veía perfecta y **no se podía navegar por ella**.
  //
  // Y el nonce no hace ninguna falta ahí: solo lo consumen los `<script>` del
  // documento HTML inicial. Una respuesta RSC no lleva scripts que estampar.
  const esPeticionRsc = peticion.headers.get("RSC") === "1";

  const respuesta = esPeticionRsc
    ? NextResponse.next()
    : NextResponse.next({ request: { headers: cabecerasConNonce(peticion.headers, nonce, csp) } });

  // La cabecera de RESPUESTA sí va siempre: es la política que aplica el
  // navegador, y una respuesta sin ella sería un agujero.
  respuesta.headers.set("Content-Security-Policy", csp);

  return respuesta;
});

/**
 * Las cabeceras que Next necesita para estampar el nonce en sus `<script>`.
 *
 * El nonce viaja por DOS sitios y ninguno sobra: `x-nonce` para que lo pueda
 * leer un Server Component, y dentro de la propia `Content-Security-Policy`,
 * que es de donde lo saca Next para ponérselo a sus scripts.
 */
function cabecerasConNonce(originales: Headers, nonce: string, csp: string): Headers {
  const cabeceras = new Headers(originales);
  cabeceras.set(CABECERA_NONCE, nonce);
  cabeceras.set("Content-Security-Policy", csp);
  return cabeceras;
}

export const config = {
  /**
   * Se excluyen los recursos estáticos y las rutas de la API.
   *
   * `/api/*` queda FUERA a propósito: cada Route Handler comprueba la sesión por
   * su cuenta con `auth()`, en Node, donde sí puede consultar la base. Hacerlo
   * también aquí sería una comprobación más débil dando falsa sensación de red.
   *
   * Consecuencia para la CSP: las respuestas de `/api/*` no llevan nonce, y no
   * lo necesitan —son JSON y binarios, no HTML con scripts—. Sus cabeceras de
   * seguridad las pone `next.config.ts`.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|texturas|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico)$).*)",
  ],
};
