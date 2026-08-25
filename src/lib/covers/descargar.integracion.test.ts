import { createServer, type Server } from "node:http";
import { createServer as createServerTcp } from "node:net";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { descargarImagen, MAXIMO_BYTES } from "./descargar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL SSRF, CONTRA UN SERVIDOR DE VERDAD.
 *
 * CAMINO REAL (2026-08-24) — `.claude/rules/testing.md` exige explícitamente
 * que este test nazca así: «un servidor local que redirige a `127.0.0.1`, **no
 * un mock de `fetch`**».
 *
 * Aquí no se simula nada: hay un servidor HTTP escuchando, hay resolución DNS
 * de verdad, hay sockets de verdad y hay redirecciones de verdad. Lo único que
 * se toca es una escotilla estrecha —`permitirLoopbackParaPruebas`— que abre
 * **solo loopback**, porque cualquier servidor que este proceso pueda levantar
 * está en `127.0.0.1` y sin ella no habría nada que pedir.
 *
 * Lo que esa escotilla **no** abre es justo lo que hace útil al test: el
 * metadata de la nube (`169.254.169.254`) y la red privada siguen bloqueados
 * con la bandera puesta. Por eso se puede comprobar que **cada redirección se
 * revalida**: el primer salto va a loopback y el segundo, al metadata, muere.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Un PNG de 1×1 válido. Suficiente para que el tipo y los bytes sean reales. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * El separador de cabeceras HTTP.
 *
 * Se compone en vez de escribirse como literal porque un retorno de carro
 * escrito como escape dentro de un fichero que se edita con herramientas de
 * texto se convierte, más veces de las que parece, en un salto de línea de
 * verdad — y entonces la cadena queda abierta y el fichero no compila. Me
 * pasó tres veces seguidas escribiendo este test.
 */
const FIN_DE_LINEA = String.fromCharCode(13, 10);

let servidor: Server;
let base = "";

describe("descargarImagen · contra un servidor real", () => {
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const ruta = req.url ?? "/";

      if (ruta === "/imagen.png") {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_1X1);
        return;
      }

      if (ruta === "/enorme") {
        // Más de 8 MB, servidos SIN `content-length` a propósito: el límite
        // tiene que salir de contar los bytes, no de creerse una cabecera.
        res.writeHead(200, { "content-type": "image/png" });
        res.write(Buffer.alloc(MAXIMO_BYTES + 1024, 0x41));
        res.end();
        return;
      }

      if (ruta === "/no-es-imagen") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<h1>esto es una página, no una portada</h1>");
        return;
      }

      if (ruta === "/al-metadata") {
        // EL ATAQUE. Un primer salto inocente que redirige al metadata de la
        // nube, que en AWS y GCP devuelve credenciales.
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
        return;
      }

      if (ruta === "/a-la-red-privada") {
        res.writeHead(302, { location: "http://10.0.0.1/panel-interno" });
        res.end();
        return;
      }

      if (ruta === "/a-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
        return;
      }

      if (ruta === "/bucle") {
        res.writeHead(302, { location: `${base}/bucle` });
        res.end();
        return;
      }

      if (ruta === "/un-salto") {
        res.writeHead(302, { location: `${base}/imagen.png` });
        res.end();
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolver) => {
      servidor.listen(0, "127.0.0.1", resolver);
    });

    const dir = servidor.address() as AddressInfo;
    base = `http://127.0.0.1:${String(dir.port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolver) => {
      servidor.close(() => {
        resolver();
      });
    });
  });

  // ── LO PRIMERO: QUE LA ESCOTILLA ESTÉ CERRADA POR DEFECTO ───────────────

  it("SIN la bandera, ni siquiera loopback se alcanza", async () => {
    // Es el control que hace honesto a todo lo demás: si el valor por defecto
    // fuera permisivo, el resto de este fichero estaría midiendo otra cosa.
    const r = await descargarImagen(`${base}/imagen.png`);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DESTINO_INTERNO");
  });

  // ── EL CAMINO QUE SÍ DEBE FUNCIONAR ─────────────────────────────────────

  it("descarga una imagen real y devuelve sus bytes", async () => {
    const r = await descargarImagen(`${base}/imagen.png`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contentType).toBe("image/png");
    expect(r.bytes.equals(PNG_1X1)).toBe(true);
  });

  it("sigue UNA redirección hacia un destino legítimo", async () => {
    const r = await descargarImagen(`${base}/un-salto`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.urlFinal).toContain("/imagen.png");
  });

  // ── LOS ATAQUES ─────────────────────────────────────────────────────────

  it("EL BYPASS CLÁSICO: una redirección al metadata de la nube se corta", async () => {
    // Primer salto: loopback, permitido por la escotilla. Segundo:
    // `169.254.169.254`, que devuelve credenciales en AWS y GCP.
    //
    // Este caso es la prueba de que **cada salto se revalida**. Un descargador
    // que validara solo la URL inicial se traería las credenciales, y la URL
    // que escribió el usuario parecería completamente inocente.
    const r = await descargarImagen(`${base}/al-metadata`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DESTINO_INTERNO");
  });

  it("una redirección a la red privada también se corta", async () => {
    const r = await descargarImagen(`${base}/a-la-red-privada`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DESTINO_INTERNO");
  });

  it("una redirección a `file://` se corta por el esquema", async () => {
    const r = await descargarImagen(`${base}/a-file`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ESQUEMA_NO_PERMITIDO");
  });

  it("un bucle de redirecciones se corta al cuarto salto, no gira para siempre", async () => {
    const r = await descargarImagen(`${base}/bucle`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DEMASIADAS_REDIRECCIONES");
  });

  it("EL TAMAÑO SE CUENTA: 8 MB es el tope aunque no haya `content-length`", async () => {
    const r = await descargarImagen(`${base}/enorme`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("DEMASIADO_GRANDE");
  }, 30_000);

  it("un `content-length` HONESTO y enorme también se corta contando", async () => {
    // Complementa a `/enorme`, que va sin cabecera: aquí el servidor SÍ declara
    // los nueve megas. Un descargador que decidiera por la cabecera podría
    // cortar antes; el nuestro corta contando, y da igual lo que declare nadie.
    const crudo = createServerTcp((socket) => {
      // ── EL RESET LO PROVOCAMOS NOSOTROS, Y HAY QUE RECOGERLO ─────────────
      //
      // El descargador **aborta la conexión en cuanto la cuenta de bytes pasa
      // del límite**, que es exactamente lo que este test comprueba. Del lado
      // del servidor eso llega como `ECONNRESET` mientras aún está escribiendo.
      //
      // Un socket sin manejador de `error` lanza una **excepción no capturada**
      // que sube al proceso: Vitest la reportaba como «1 error» junto a los 58
      // tests en verde, y avisaba —con razón— de que eso puede producir falsos
      // positivos. No era un fallo del código: era el banco de pruebas sin
      // recoger la consecuencia de lo que él mismo provoca.
      socket.on("error", () => {
        // Se ignora a propósito: el corte es el comportamiento deseado.
      });

      socket.on("data", () => {
        const cuerpo = Buffer.alloc(MAXIMO_BYTES + 1024, 0x41);
        socket.write(
          [
            "HTTP/1.1 200 OK",
            "Content-Type: image/png",
            `Content-Length: ${String(cuerpo.byteLength)}`,
            "Connection: close",
            "",
            "",
          ].join(FIN_DE_LINEA),
        );
        socket.write(cuerpo);
        socket.end();
      });
    });

    await new Promise<void>((resolver) => {
      crudo.listen(0, "127.0.0.1", resolver);
    });
    const puerto = (crudo.address() as AddressInfo).port;

    try {
      const r = await descargarImagen(`http://127.0.0.1:${String(puerto)}/`, {
        permitirLoopbackParaPruebas: true,
      });

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("DEMASIADO_GRANDE");
    } finally {
      await new Promise<void>((resolver) => {
        crudo.close(() => {
          resolver();
        });
      });
    }
  }, 30_000);

  it("un `content-length` MENTIROSO acaba en fallo controlado, nunca en éxito", async () => {
    // ── LO QUE APRENDÍ ESCRIBIENDO ESTE TEST ──────────────────────────────
    //
    // Quería demostrar que un servidor que declara 10 bytes y manda nueve megas
    // no nos cuela los nueve megas. Resulta que **ese ataque no llega hasta
    // nosotros**: el parser HTTP de Node corta en el `Content-Length` declarado
    // y trata el resto como error de protocolo. La protección la da el cliente,
    // no mi contador.
    //
    // Lo escribo tal cual en vez de retocar la aserción hasta que pasara,
    // porque saber QUIÉN protege importa: si un día se cambia de transporte
    // —a undici, a otro cliente— esta garantía viaja con él y hay que
    // recomprobarla. Mi contador cubre el otro caso, el de respuestas sin
    // `Content-Length`, que es el que `/enorme` ejercita.
    //
    // Lo que sí se fija aquí es la invariante que no puede romperse nunca:
    // **de una respuesta así no sale un `ok: true`**.
    const crudo = createServerTcp((socket) => {
      // ── EL RESET LO PROVOCAMOS NOSOTROS, Y HAY QUE RECOGERLO ─────────────
      //
      // El descargador **aborta la conexión en cuanto la cuenta de bytes pasa
      // del límite**, que es exactamente lo que este test comprueba. Del lado
      // del servidor eso llega como `ECONNRESET` mientras aún está escribiendo.
      //
      // Un socket sin manejador de `error` lanza una **excepción no capturada**
      // que sube al proceso: Vitest la reportaba como «1 error» junto a los 58
      // tests en verde, y avisaba —con razón— de que eso puede producir falsos
      // positivos. No era un fallo del código: era el banco de pruebas sin
      // recoger la consecuencia de lo que él mismo provoca.
      socket.on("error", () => {
        // Se ignora a propósito: el corte es el comportamiento deseado.
      });

      socket.on("data", () => {
        socket.write(
          [
            "HTTP/1.1 200 OK",
            "Content-Type: image/png",
            "Content-Length: 10",
            "Connection: close",
            "",
            "",
          ].join(FIN_DE_LINEA),
        );
        socket.write(Buffer.alloc(MAXIMO_BYTES + 1024, 0x41));
        socket.end();
      });
    });

    await new Promise<void>((resolver) => {
      crudo.listen(0, "127.0.0.1", resolver);
    });
    const puerto = (crudo.address() as AddressInfo).port;

    try {
      const r = await descargarImagen(`http://127.0.0.1:${String(puerto)}/`, {
        permitirLoopbackParaPruebas: true,
      });

      expect(r.ok, "una respuesta que miente en el tamaño NO puede dar éxito").toBe(false);
    } finally {
      await new Promise<void>((resolver) => {
        crudo.close(() => {
          resolver();
        });
      });
    }
  }, 30_000);

  it("una página HTML no es una portada", async () => {
    const r = await descargarImagen(`${base}/no-es-imagen`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("TIPO_NO_SOPORTADO");
  });

  // ── ESQUEMAS Y FORMAS DE URL ────────────────────────────────────────────

  it.each([
    ["file:///etc/passwd", "ESQUEMA_NO_PERMITIDO"],
    ["data:image/png;base64,iVBORw0KGgo=", "ESQUEMA_NO_PERMITIDO"],
    ["gopher://interno:70/", "ESQUEMA_NO_PERMITIDO"],
    ["ftp://interno/imagen.png", "ESQUEMA_NO_PERMITIDO"],
    ["javascript:alert(1)", "ESQUEMA_NO_PERMITIDO"],
    ["no-es-una-url", "URL_INVALIDA"],
    ["", "URL_INVALIDA"],
  ] as const)("rechaza %s", async (url, motivo) => {
    const r = await descargarImagen(url, { permitirLoopbackParaPruebas: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(motivo);
  });

  it("rechaza credenciales embebidas en la URL", async () => {
    const conCredenciales = base.replace("http://", "http://usuario:clave@");
    const r = await descargarImagen(`${conCredenciales}/imagen.png`, {
      permitirLoopbackParaPruebas: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("CREDENCIALES_EN_URL");
  });

  it("y las direcciones internas ESCRITAS A MANO se rechazan con la bandera puesta", async () => {
    // La escotilla abre loopback y NADA más. Estas son las que un SSRF busca.
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://[::1]/",
    ]) {
      const r = await descargarImagen(url, { permitirLoopbackParaPruebas: true });
      expect(r.ok, `${url} NO fue rechazada`).toBe(false);
    }
  }, 30_000);
});
