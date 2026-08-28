import "server-only";

import { peticionFijada, validarDestino } from "@/lib/red/peticion-segura";

import type { FalloDeDestino, RespuestaCruda } from "@/lib/red/peticion-segura";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DESCARGA DE UNA IMAGEN REMOTA — **el punto más peligroso de la aplicación**.
 *
 * Acepta una URL que escribe el usuario y la pide desde el servidor. Eso es un
 * SSRF de manual si se implementa mal: el servidor está DENTRO de la red, así
 * que puede alcanzar sitios que el usuario no puede — la base de datos, un
 * panel interno, y sobre todo `169.254.169.254`, el metadata de la nube, que en
 * AWS y en GCP devuelve **credenciales**.
 *
 * El checklist completo está en `.claude/rules/security.md` §4 y se sigue
 * entero. Los tres puntos que la gente se salta y que aquí NO se saltan:
 *
 * ── 1. SE RESUELVE EL DNS ANTES DE CONECTAR, Y SE CONECTA A ESA IP ─────────
 *
 * Comprobar el hostname no sirve de nada: `mi-dominio.com` puede resolver a
 * `127.0.0.1`. Y comprobar la IP y luego conectar por hostname tampoco, porque
 * entre las dos cosas el DNS puede cambiar de respuesta — es el **DNS
 * rebinding**, y es un ataque real, no teórico.
 *
 * Aquí se resuelve una vez, se comprueban **todas** las direcciones devueltas, y
 * se conecta con un `lookup` propio que devuelve **la IP ya validada**. Entre la
 * comprobación y la conexión no hay ventana.
 *
 * ── 2. CADA REDIRECCIÓN VUELVE A EMPEZAR ──────────────────────────────────
 *
 * `redirect: "manual"` y como mucho tres saltos, y **cada salto pasa otra vez
 * por los pasos 1 a 5**. Un 302 hacia `127.0.0.1` es el bypass clásico: la URL
 * que escribió el usuario es pública e inocente, y la que de verdad se pide, no.
 *
 * ── 3. EL TAMAÑO SE CUENTA LEYENDO, NO EN LA CABECERA ─────────────────────
 *
 * `Content-Length` lo escribe el servidor remoto, que es justo quien no es de
 * fiar. Se cuenta byte a byte y se aborta al pasarse.
 *
 * ── LO QUE VE EL USUARIO CUANDO ALGO FALLA ────────────────────────────────
 *
 * `IMAGEN_NO_DESCARGABLE`, siempre. Nunca `ECONNREFUSED 10.0.0.5:8080`: un
 * mensaje de error detallado convierte este endpoint en un **escáner de puertos
 * de la red interna**, porque el atacante distingue «no hay nada ahí» de «hay
 * algo que rechaza». El detalle real va al log del servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Los motivos propios de una DESCARGA, más los que puede dar el destino.
 *
 * Se componen en vez de repetirse: `FalloDeDestino` lo produce la validación
 * compartida —la misma que usa «comprobar espejos»— y volver a escribir sus
 * cuatro etiquetas aquí garantizaría que un día digan cosas distintas.
 */
export type FalloDescarga =
  | FalloDeDestino
  | "DEMASIADAS_REDIRECCIONES"
  | "RESPUESTA_NO_OK"
  | "TIPO_NO_SOPORTADO"
  | "DEMASIADO_GRANDE"
  | "SIN_RESPUESTA";

export type ResultadoDescarga =
  | { ok: true; bytes: Buffer; contentType: string; urlFinal: string }
  | { ok: false; motivo: FalloDescarga };

export type OpcionesDescarga = {
  /**
   * ── ESCOTILLA DE PRUEBAS, ESTRECHA Y DECLARADA ──────────────────────────
   *
   * Permite conectar a **loopback y solo a loopback**. Existe porque el test
   * del camino real necesita un servidor de verdad al que pedirle cosas, y
   * cualquier servidor que este proceso pueda levantar está en `127.0.0.1`.
   *
   * Lo que NO abre: la red privada de al lado, el CGNAT, el enlace local y,
   * sobre todo, **`169.254.169.254`** — el metadata de la nube, que es el
   * objetivo real de un SSRF. Esos siguen bloqueados con la bandera puesta, y
   * eso es lo que permite probar que **cada redirección se revalida**: el
   * primer salto va a loopback y el segundo, al metadata, se rechaza.
   *
   * No se lee del entorno a propósito. Una variable se puede poner en Vercel
   * sin querer; un parámetro hay que escribirlo en el código, y aparece en el
   * diff. En producción nadie lo pasa: el valor por defecto es seguro.
   */
  permitirLoopbackParaPruebas?: boolean;
};

/** 8 MB. Una portada de 480×720 pesa ~40 kB; esto es holgadísimo. */
export const MAXIMO_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAXIMO_SALTOS = 3;

/** Lo único que aceptamos. El `Content-Type` se comprueba además por magic bytes. */
const TIPOS_ACEPTADOS = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Descarga una imagen de una URL que escribió el usuario.
 *
 * **No devuelve nunca el detalle del fallo de red.** El motivo que sale de aquí
 * es una de nuestras etiquetas, y ninguna revela si hubo conexión rechazada,
 * timeout o resolución fallida.
 */
export async function descargarImagen(
  urlInicial: string,
  opciones: OpcionesDescarga = {},
): Promise<ResultadoDescarga> {
  const permitirLoopback = opciones.permitirLoopbackParaPruebas === true;
  let objetivo = urlInicial;

  for (let salto = 0; salto <= MAXIMO_SALTOS; salto += 1) {
    const destino = await validarDestino(objetivo, permitirLoopback);
    if (!destino.ok) return destino;

    // 5. EL PIN, Y POR QUÉ NO SE USA `fetch` ────────────────────────────
    //
    // La primera versión pasaba un `https.Agent` con `lookup` propio al `fetch`
    // de la plataforma. **No funcionaba**: el `fetch` de Node es undici, y un
    // agente de `node:https` no es un dispatcher suyo. Todas las peticiones
    // morían con `SIN_RESPUESTA`, y el test del camino real lo enseñó en la
    // primera ejecución. Si me hubiera fiado del código «que parecía correcto»,
    // el pin de IP habría sido decorativo — que es exactamente el fallo que
    // este proyecto lleva persiguiendo todo el día.
    //
    // `http.request` acepta `lookup` de forma nativa. Devuelve la IP YA
    // VALIDADA, así que entre la comprobación y el socket no hay ventana por la
    // que colar un DNS rebinding.
    let respuesta: RespuestaCruda;
    try {
      respuesta = await peticionFijada(destino, {
        metodo: "GET",
        cabeceras: {
          accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          "user-agent": "AnimeVault/1.0 (portadas)",
        },
        maximoBytes: MAXIMO_BYTES,
        timeoutMs: TIMEOUT_MS,
      });
    } catch {
      // Timeout, conexión rechazada, DNS caído… todo lo mismo de cara afuera.
      return { ok: false, motivo: "SIN_RESPUESTA" };
    }

    // 6. Redirección: se vuelve a empezar con la URL nueva.
    if (respuesta.estado >= 300 && respuesta.estado < 400) {
      const siguiente = respuesta.cabeceras.location;
      if (typeof siguiente !== "string") return { ok: false, motivo: "RESPUESTA_NO_OK" };
      // Relativa o absoluta: se resuelve contra la actual y se revalida entera.
      try {
        objetivo = new URL(siguiente, destino.url).toString();
      } catch {
        return { ok: false, motivo: "URL_INVALIDA" };
      }
      continue;
    }

    if (respuesta.estado < 200 || respuesta.estado >= 300) {
      return { ok: false, motivo: "RESPUESTA_NO_OK" };
    }

    // 9. El tipo declarado. Los magic bytes los comprueba sharp al procesar,
    //    que es quien de verdad sabe leer una imagen.
    const tipo = (respuesta.cabeceras["content-type"] ?? "").split(";")[0]?.trim() ?? "";
    if (!TIPOS_ACEPTADOS.has(tipo)) return { ok: false, motivo: "TIPO_NO_SOPORTADO" };

    if (respuesta.excedido) return { ok: false, motivo: "DEMASIADO_GRANDE" };

    return {
      ok: true,
      bytes: respuesta.cuerpo,
      contentType: tipo,
      urlFinal: destino.url.toString(),
    };
  }

  return { ok: false, motivo: "DEMASIADAS_REDIRECCIONES" };
}
