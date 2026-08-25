import { exigirSesionParaLeer } from "@/auth";
import { vaultDe } from "@/lib/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/covers/[animeId]?size=full|thumb&v=<checksum>
 *
 * ── POR QUÉ UN ROUTE HANDLER Y NO UNA SERVER ACTION ────────────────────────
 * Porque devuelve BINARIO con sus cabeceras: `Content-Type`, `ETag`,
 * `Cache-Control`. Una Server Action no puede hacer eso (`api-conventions.md`).
 *
 * ── LA PROPIEDAD SE COMPRUEBA ANTES DE SERVIR UN SOLO BYTE ─────────────────
 * `vault.portada()` filtra por `user_id` en el `WHERE`. Un anime ajeno devuelve
 * `null`, y eso se traduce en **404**, no en 403: un 403 confirma que el
 * recurso existe (`security.md` §1).
 *
 * ── LA CACHÉ ES AGRESIVA, Y ES SEGURO ─────────────────────────────────────
 * `immutable` durante un año. Es seguro porque:
 *   · el `animeId` es un uuid, no se adivina;
 *   · la propiedad se comprueba en cada petición ANTES de servir;
 *   · la URL lleva `?v=<checksum>`, así que un cambio de portada cambia la URL.
 *
 * `private` y no `public`: son datos de una persona. Un proxy compartido no
 * debe guardarlos para servírselos a otra.
 *
 * ── SIN PORTADA, UN PLACEHOLDER DE LAJA ───────────────────────────────────
 * No un 404 seco: la rejilla necesita algo que ocupe su 2:3 o el diseño se
 * descuadra. Se genera al vuelo, es diminuto y no toca la base.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UN_ANO = 31_536_000;

/**
 * Los dos únicos colores del placeholder.
 *
 * Un SVG que se sirve como binario **no resuelve `var(--token)`**: no hay
 * documento con `:root` alrededor. Así que aquí no queda más remedio que el
 * valor. Se declaran como constantes con nombre —y no repartidos por la
 * plantilla— para que haya UN sitio donde cambiarlos, y se atan a sus tokens
 * con un test que falla si `globals.css` cambia y esto no.
 */
// lint-tokens-ok: un SVG servido suelto no resuelve var(); atado a globals.css por test
const LAJA_FONDO = "#171A1E"; // --slate-850
// lint-tokens-ok: idem
const LAJA_FRACTURA = "#282D33"; // --slate-700

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ animeId: string }> },
): Promise<Response> {
  const { animeId } = await params;

  let ctx;
  try {
    ({ ctx } = await exigirSesionParaLeer());
  } catch {
    // Sin sesión no se sirve nada. 401 y no 404: aquí no hay nada que ocultar
    // —la ruta existe para cualquiera— y quien llame necesita saber que le falta
    // iniciar sesión, no creer que el anime no existe.
    return new Response(null, { status: 401 });
  }

  const url = new URL(peticion.url);
  const tamano = url.searchParams.get("size") === "thumb" ? "thumb" : "full";

  const portada = await vaultDe(ctx).portada(animeId, tamano);

  if (portada === null || portada.bytes === null) {
    return placeholder();
  }

  // 304 cuando el navegador ya la tiene. El cuerpo va vacío: es el punto.
  const etag = `"${portada.checksum}-${tamano}"`;
  if (peticion.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(new Uint8Array(portada.bytes), {
    status: 200,
    headers: {
      "content-type": portada.mime,
      "content-length": String(portada.bytes.byteLength),
      etag,
      "cache-control": `private, max-age=${String(UN_ANO)}, immutable`,
    },
  });
}

/**
 * Una losa de laja negra, generada al vuelo.
 *
 * Sin colores literales: los tres tonos son los del sistema y están aquí como
 * `currentColor` no se puede usar en un SVG servido suelto. Se mantienen
 * sincronizados a mano con `--slate-850` y `--slate-700`, y por eso llevan
 * la marca de excepción del linter con su motivo.
 */
function placeholder(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
<rect width="480" height="720" fill="${LAJA_FONDO}"/>
<path d="M0 0 L180 0 L120 260 L0 200 Z M180 0 L480 0 L480 180 L300 240 Z M0 200 L120 260 L60 520 L0 460 Z M120 260 L300 240 L340 520 L60 520 Z M300 240 L480 180 L480 520 L340 520 Z M0 460 L60 520 L0 720 Z M60 520 L340 520 L300 720 L0 720 Z M340 520 L480 520 L480 720 L300 720 Z" fill="none" stroke="${LAJA_FRACTURA}" stroke-width="1"/>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml",
      // Corta: en cuanto haya portada de verdad, que se pida.
      "cache-control": "private, max-age=60",
    },
  });
}
