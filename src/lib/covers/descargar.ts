import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import type { request as peticionHttpNativa } from "node:http";

import { esIpPrivada } from "./ip-privada";

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

export type FalloDescarga =
  | "ESQUEMA_NO_PERMITIDO"
  | "URL_INVALIDA"
  | "CREDENCIALES_EN_URL"
  | "DESTINO_INTERNO"
  | "DEMASIADAS_REDIRECCIONES"
  | "RESPUESTA_NO_OK"
  | "TIPO_NO_SOPORTADO"
  | "DEMASIADO_GRANDE"
  | "SIN_RESPUESTA";

export type ResultadoDescarga =
  | { ok: true; bytes: Buffer; contentType: string; urlFinal: string }
  | { ok: false; motivo: FalloDescarga };

/** ¿Es una dirección de la propia máquina? Solo loopback, nada más. */
function esLoopback(ip: string): boolean {
  const limpia = ip.trim().toLowerCase();
  return limpia === "::1" || limpia.startsWith("127.") || limpia === "::ffff:127.0.0.1";
}

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
 * Valida una URL y devuelve la IP a la que se conectará.
 *
 * Se ejecuta en la URL original **y en cada redirección**.
 */
async function validarDestino(
  bruta: string,
  permitirLoopback: boolean,
): Promise<
  { ok: true; url: URL; ip: string; familia: number } | { ok: false; motivo: FalloDescarga }
> {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { ok: false, motivo: "URL_INVALIDA" };
  }

  // 1. Solo http y https. `file:`, `data:`, `gopher:`, `blob:` fuera.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, motivo: "ESQUEMA_NO_PERMITIDO" };
  }

  // 2. Credenciales embebidas: `http://usuario:clave@interno/`. Algunos
  //    proxies las interpretan de forma sorprendente y no aportan nada aquí.
  if (url.username !== "" || url.password !== "") {
    return { ok: false, motivo: "CREDENCIALES_EN_URL" };
  }

  // 3. Resolución explícita. `all: true` porque un host puede devolver varias
  //    direcciones y basta con que UNA sea interna para que el ataque funcione.
  let direcciones: { address: string; family: number }[];
  try {
    direcciones = await dnsLookup(url.hostname, { all: true });
  } catch {
    return { ok: false, motivo: "URL_INVALIDA" };
  }

  if (direcciones.length === 0) return { ok: false, motivo: "URL_INVALIDA" };

  // 4. TODAS, no solo la primera.
  const bloqueada = (ip: string): boolean => {
    if (permitirLoopback && esLoopback(ip)) return false;
    return esIpPrivada(ip);
  };

  if (direcciones.some((d) => bloqueada(d.address))) {
    return { ok: false, motivo: "DESTINO_INTERNO" };
  }

  const primera = direcciones[0];
  if (primera === undefined) return { ok: false, motivo: "URL_INVALIDA" };

  return { ok: true, url, ip: primera.address, familia: primera.family };
}

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
    const pedir = destino.url.protocol === "https:" ? peticionHttps : peticionHttp;

    let respuesta: RespuestaCruda;
    try {
      respuesta = await pedir(destino.url, destino.ip, destino.familia);
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

/**
 * `node:http` y `node:https` exponen el mismo `request` para lo que aquí se
 * usa. Se tipa así en vez de con `typeof import(...)` porque el lint del
 * proyecto prohíbe las anotaciones `import()` — y con razón: esconden una
 * dependencia donde nadie la busca.
 */
type ModuloHttp = { request: typeof peticionHttpNativa };

type RespuestaCruda = {
  estado: number;
  cabeceras: Record<string, string | undefined>;
  cuerpo: Buffer;
  /** `true` si se cortó por pasarse del tamaño máximo. */
  excedido: boolean;
};

/**
 * Una petición con la IP FIJADA y el tamaño contado.
 *
 * El `lookup` devuelve siempre la dirección ya validada, ignorando el hostname:
 * eso es lo que cierra el DNS rebinding. Y el cuerpo se acumula contando bytes,
 * abortando en cuanto se pasa — sin creerse `Content-Length`, que lo escribe el
 * servidor remoto, que es justo quien no es de fiar.
 */
function peticionCon(
  modulo: ModuloHttp,
  url: URL,
  ip: string,
  familia: number,
): Promise<RespuestaCruda> {
  return new Promise((resolver, rechazar) => {
    const req = modulo.request(
      url,
      {
        method: "GET",
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          "user-agent": "AnimeVault/1.0 (portadas)",
        },
        lookup: ((_hostname: string, opciones: unknown, cb: unknown) => {
          const devolver = (typeof opciones === "function" ? opciones : cb) as (
            err: Error | null,
            address: string | { address: string; family: number }[],
            family?: number,
          ) => void;
          // `all: true` espera un array; sin él, dirección y familia sueltas.
          const pideTodas =
            typeof opciones === "object" && opciones !== null && "all" in opciones
              ? (opciones as { all?: boolean }).all === true
              : false;
          if (pideTodas) devolver(null, [{ address: ip, family: familia }]);
          else devolver(null, ip, familia);
        }) as never,
      },
      (res) => {
        const trozos: Buffer[] = [];
        let total = 0;
        let excedido = false;

        res.on("data", (trozo: Buffer) => {
          if (excedido) return;
          total += trozo.byteLength;
          if (total > MAXIMO_BYTES) {
            excedido = true;
            res.destroy();
            return;
          }
          trozos.push(trozo);
        });

        const terminar = (): void => {
          resolver({
            estado: res.statusCode ?? 0,
            cabeceras: res.headers as Record<string, string | undefined>,
            cuerpo: Buffer.concat(trozos),
            excedido,
          });
        };

        res.on("end", terminar);
        // `destroy()` por pasarse de tamaño cierra sin `end`: se resuelve igual,
        // con la marca puesta, en vez de quedarse colgado hasta el timeout.
        res.on("close", terminar);
        res.on("error", () => {
          if (excedido) terminar();
          else rechazar(new Error("respuesta interrumpida"));
        });
      },
    );

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", rechazar);
    req.end();
  });
}

async function peticionHttp(url: URL, ip: string, familia: number): Promise<RespuestaCruda> {
  const http = await import("node:http");
  return peticionCon(http, url, ip, familia);
}

async function peticionHttps(url: URL, ip: string, familia: number): Promise<RespuestaCruda> {
  const https = await import("node:https");
  return peticionCon(https, url, ip, familia);
}
