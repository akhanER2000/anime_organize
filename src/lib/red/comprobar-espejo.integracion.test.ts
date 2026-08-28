import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comprobarEspejo, comprobarEspejos } from "./comprobar-espejo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «COMPROBAR ESPEJOS», CONTRA UN SERVIDOR DE VERDAD.
 *
 * CAMINO REAL: hay un servidor HTTP escuchando, resolución DNS de verdad y
 * sockets de verdad. Lo único que se abre es `permitirLoopbackParaPruebas`,
 * que deja pasar **sólo loopback** —cualquier servidor que este proceso pueda
 * levantar está en `127.0.0.1`— y **no** el metadata de la nube ni la red
 * privada. Por eso el test del metadata sigue valiendo con la bandera puesta:
 * es la prueba de que la validación no se apaga entera.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-28):
 *   Se quitó la llamada a `validarDestino` de `comprobarEspejo` y se pasó la
 *   URL directamente a `peticionFijada` → «un espejo que apunta al metadata de
 *   la nube se rechaza SIN pedirlo» en rojo: el detalle pasaba de «destino
 *   rechazado: DESTINO_INTERNO» a «sin respuesta», que es lo que devuelve un
 *   timeout de 5 s **después de haber intentado la conexión**. Restaurado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let servidor: Server;
let base = "";

describe("comprobarEspejo · contra un servidor real", () => {
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const ruta = req.url ?? "/";

      if (ruta === "/vivo") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end();
        return;
      }

      if (ruta === "/caido") {
        res.writeHead(404);
        res.end();
        return;
      }

      if (ruta === "/aparcado") {
        // El caso que hace falta distinguir: un dominio caducado y revendido
        // responde 302 a una página de aparcamiento que devuelve 200 tan
        // contenta. Seguir el salto diría «vivo» sobre un dominio que ya no es
        // de quien era.
        res.writeHead(302, { location: "https://ejemplo-aparcado.tld/" });
        res.end();
        return;
      }

      if (ruta === "/head-con-cuerpo") {
        // Un servidor mal hecho que manda cuerpo en un HEAD. No puede colgar
        // la comprobación ni tragarse el cuerpo entero.
        res.writeHead(200, { "content-type": "text/html" });
        res.write(Buffer.alloc(64 * 1024, 0x41));
        res.end();
        return;
      }

      res.writeHead(500);
      res.end();
    });

    await new Promise<void>((listo) => {
      servidor.listen(0, "127.0.0.1", listo);
    });
    const dir = servidor.address() as AddressInfo;
    base = `http://127.0.0.1:${String(dir.port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((listo) => {
      servidor.close(() => {
        listo();
      });
    });
  });

  it("un 200 es un espejo vivo", async () => {
    const r = await comprobarEspejo(
      { id: "e1", url: `${base}/vivo` },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r).toEqual({ id: "e1", vivo: true, detalle: "HTTP 200" });
  });

  it("un 404 no lo es", async () => {
    const r = await comprobarEspejo(
      { id: "e2", url: `${base}/caido` },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r.vivo).toBe(false);
    expect(r.detalle).toContain("404");
  });

  it("UN 302 NO ES UN ESPEJO VIVO: no se sigue el salto", async () => {
    const r = await comprobarEspejo(
      { id: "e3", url: `${base}/aparcado` },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r.vivo).toBe(false);
    expect(r.detalle).toContain("302");
  });

  it("un servidor que manda cuerpo en un HEAD no cuelga la comprobación", async () => {
    const r = await comprobarEspejo(
      { id: "e4", url: `${base}/head-con-cuerpo` },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r.vivo).toBe(true);
  });

  it("EL ESCÁNER DE RED: un espejo que apunta al metadata de la nube se rechaza SIN pedirlo", async () => {
    const r = await comprobarEspejo(
      { id: "e5", url: "http://169.254.169.254/latest/meta-data/" },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r.vivo).toBe(false);
    // El detalle distingue «no lo pedí» de «no contestó», y esa diferencia es
    // justo la que separa la protección de un timeout.
    expect(r.detalle).toContain("destino rechazado");
    expect(r.detalle).toContain("DESTINO_INTERNO");
  });

  it("y la red privada también, con la bandera de pruebas puesta", async () => {
    const r = await comprobarEspejo(
      { id: "e6", url: "http://10.0.0.1/panel-interno" },
      { permitirLoopbackParaPruebas: true },
    );

    expect(r.detalle).toContain("destino rechazado");
  });

  it("un esquema que no es http(s) no llega a abrir un socket", async () => {
    const r = await comprobarEspejo({ id: "e7", url: "file:///etc/passwd" });

    expect(r).toEqual({
      id: "e7",
      vivo: false,
      detalle: "destino rechazado: ESQUEMA_NO_PERMITIDO",
    });
  });

  it("sin la bandera, loopback está bloqueado como en producción", async () => {
    const r = await comprobarEspejo({ id: "e8", url: `${base}/vivo` });

    expect(r.vivo).toBe(false);
    expect(r.detalle).toContain("DESTINO_INTERNO");
  });

  it("la lista devuelve un resultado por espejo, EN EL MISMO ORDEN", async () => {
    const espejos = [
      { id: "a", url: `${base}/vivo` },
      { id: "b", url: `${base}/caido` },
      { id: "c", url: `${base}/vivo` },
      { id: "d", url: `${base}/aparcado` },
      { id: "e", url: `${base}/vivo` },
    ];

    const r = await comprobarEspejos(espejos, { permitirLoopbackParaPruebas: true, aLaVez: 2 });

    // El orden importa: quien llama casa cada resultado con su fila por
    // posición además de por id, y una tanda que devolviera por orden de
    // llegada mezclaría los estados entre espejos.
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.map((x) => x.vivo)).toEqual([true, false, true, false, true]);
  });

  it("una lista vacía no pide nada y no revienta", async () => {
    await expect(comprobarEspejos([])).resolves.toEqual([]);
  });
});
