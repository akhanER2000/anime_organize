import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";

import { esIpPrivada } from "@/lib/covers/ip-privada";

import type { request as peticionHttpNativa } from "node:http";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PEDIR ALGO A UNA URL QUE ESCRIBIÓ EL USUARIO, SIN QUE ESO SEA UN SSRF.
 *
 * ── POR QUÉ ESTO SALIÓ DE `covers/descargar.ts` ──────────────────────────
 *
 * Porque dejó de tener un solo usuario. El pipeline de portadas descarga
 * imágenes; **«comprobar espejos» hace `HEAD` a los dominios que el dueño ha
 * guardado**, y esos dominios los escribe él igual que la URL de una portada.
 *
 * Escribir la validación dos veces habría sido la peor duplicación posible de
 * este proyecto: no una etiqueta que diverge, sino un **límite de seguridad**
 * del que existirían dos versiones, y la segunda —la nueva, la menos mirada—
 * sería la que un atacante usaría.
 *
 * Y el ataque no es teórico. Sin esto, «comprobar espejos» es un escáner de la
 * red interna con interfaz: se añade un espejo apuntando a
 * `http://169.254.169.254/` —el metadata de la nube— y el resultado de la
 * comprobación dice si respondió. Ni siquiera hace falta leer el cuerpo.
 *
 * ── LAS SEIS DEFENSAS, Y NINGUNA SOBRA ───────────────────────────────────
 *
 * 1. **Solo `http:` y `https:`.** `file:`, `data:`, `gopher:` fuera.
 * 2. **Sin credenciales en la URL.** `http://usuario:clave@interno/` lo
 *    interpretan de forma sorprendente algunos proxies.
 * 3. **Resolución DNS explícita con `all: true`.** Un host puede devolver
 *    varias direcciones, y basta con que UNA sea interna.
 * 4. **Se comprueban TODAS**, no solo la primera.
 * 5. **Se conecta a la IP YA VALIDADA**, con un `lookup` propio. Entre la
 *    comprobación y el socket no hay ventana: eso cierra el DNS rebinding.
 * 6. **Cada redirección vuelve a empezar** por los cinco pasos anteriores. Un
 *    302 a `127.0.0.1` es el bypass clásico.
 *
 * ── POR QUÉ NO SE USA `fetch` ────────────────────────────────────────────
 *
 * La primera versión pasaba un `https.Agent` con `lookup` propio al `fetch` de
 * la plataforma. **No funcionaba**: el `fetch` de Node es undici, y un agente de
 * `node:https` no es un dispatcher suyo. Todas las peticiones morían, y lo
 * enseñó el test del camino real en su primera ejecución — si me hubiera fiado
 * del código «que parecía correcto», el pin de IP habría sido decorativo.
 *
 * `http.request` acepta `lookup` de forma nativa.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los motivos por los que un destino se rechaza ANTES de conectar. */
export type FalloDeDestino =
  "ESQUEMA_NO_PERMITIDO" | "URL_INVALIDA" | "CREDENCIALES_EN_URL" | "DESTINO_INTERNO";

export type DestinoValidado = {
  readonly ok: true;
  readonly url: URL;
  readonly ip: string;
  readonly familia: number;
};

export type ResultadoValidacion =
  DestinoValidado | { readonly ok: false; readonly motivo: FalloDeDestino };

/** ¿Es una dirección de la propia máquina? Solo loopback, nada más. */
export function esLoopback(ip: string): boolean {
  const limpia = ip.trim().toLowerCase();
  return limpia === "::1" || limpia.startsWith("127.") || limpia === "::ffff:127.0.0.1";
}

/**
 * Valida una URL y devuelve la IP a la que se conectará.
 *
 * Se ejecuta en la URL original **y en cada redirección**.
 *
 * `permitirLoopback` es la escotilla de pruebas, estrecha y declarada: abre
 * loopback **y solo loopback**, así que `169.254.169.254` sigue bloqueado con
 * la bandera puesta. Eso es justamente lo que permite probar que cada salto se
 * revalida. No se lee del entorno a propósito: una variable se pone en Vercel
 * sin querer, un parámetro hay que escribirlo y sale en el diff.
 */
export async function validarDestino(
  bruta: string,
  permitirLoopback: boolean,
): Promise<ResultadoValidacion> {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { ok: false, motivo: "URL_INVALIDA" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, motivo: "ESQUEMA_NO_PERMITIDO" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, motivo: "CREDENCIALES_EN_URL" };
  }

  let direcciones: { address: string; family: number }[];
  try {
    direcciones = await dnsLookup(url.hostname, { all: true });
  } catch {
    return { ok: false, motivo: "URL_INVALIDA" };
  }

  if (direcciones.length === 0) return { ok: false, motivo: "URL_INVALIDA" };

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

export type RespuestaCruda = {
  readonly estado: number;
  readonly cabeceras: Record<string, string | undefined>;
  readonly cuerpo: Buffer;
  /** El cuerpo se pasó del tope y se cortó. */
  readonly excedido: boolean;
};

type ModuloHttp = { request: typeof peticionHttpNativa };

export type OpcionesPeticion = {
  readonly metodo: "GET" | "HEAD";
  readonly cabeceras: Record<string, string>;
  /** Tope del cuerpo. `0` = no se lee cuerpo (lo normal en `HEAD`). */
  readonly maximoBytes: number;
  readonly timeoutMs: number;
};

/**
 * Pide algo a una IP **ya validada**, con el tope y el timeout que se le digan.
 *
 * ── EL TOPE SE APLICA POR STREAMING ──────────────────────────────────────
 *
 * Contando los bytes que llegan y abortando en cuanto se pasa. **Sin creerse
 * `Content-Length`**, que lo escribe el servidor remoto — que es justo quien no
 * es de fiar. Un servidor hostil que anuncie 10 kB y mande 2 GB llena la memoria
 * del proceso si el tope se calcula con la cabecera.
 */
function peticionCon(
  modulo: ModuloHttp,
  destino: DestinoValidado,
  opciones: OpcionesPeticion,
): Promise<RespuestaCruda> {
  return new Promise((resolver, rechazar) => {
    const req = modulo.request(
      destino.url,
      {
        method: opciones.metodo,
        headers: opciones.cabeceras,
        lookup: ((_hostname: string, opcionesLookup: unknown, cb: unknown) => {
          const devolver = (typeof opcionesLookup === "function" ? opcionesLookup : cb) as (
            err: Error | null,
            address: string | { address: string; family: number }[],
            family?: number,
          ) => void;
          // `all: true` espera un array; sin él, dirección y familia sueltas.
          const pideTodas =
            typeof opcionesLookup === "object" && opcionesLookup !== null && "all" in opcionesLookup
              ? (opcionesLookup as { all?: boolean }).all === true
              : false;
          if (pideTodas) devolver(null, [{ address: destino.ip, family: destino.familia }]);
          else devolver(null, destino.ip, destino.familia);
        }) as never,
      },
      (res) => {
        const trozos: Buffer[] = [];
        let total = 0;
        let excedido = false;

        res.on("data", (trozo: Buffer) => {
          if (excedido) return;
          total += trozo.byteLength;
          if (total > opciones.maximoBytes) {
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

    req.setTimeout(opciones.timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", rechazar);
    req.end();
  });
}

/** Pide a un destino ya validado, eligiendo el módulo por el esquema. */
export async function peticionFijada(
  destino: DestinoValidado,
  opciones: OpcionesPeticion,
): Promise<RespuestaCruda> {
  const modulo =
    destino.url.protocol === "https:" ? await import("node:https") : await import("node:http");

  return peticionCon(modulo, destino, opciones);
}
