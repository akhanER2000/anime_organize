import { describe, expect, it, vi } from "vitest";

import { mensajeRecuperarEnviado } from "@/lib/auth/mensajes";

import { CADUCIDAD_ENLACE_MINUTOS, SEGUNDOS_ANTES_DE_REENVIAR } from "./constantes";
import { ejecutarRecuperacion } from "./flujo";

import type { DependenciasRecuperar, ResultadoEmision } from "./flujo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTS DEL FLUJO DE «RECUPERAR ACCESO».
 *
 * Lo que se protege aquí son tres límites de seguridad, no la estética:
 *
 *   1. el ORDEN: parsear → rate limit → trabajar;
 *   2. que la respuesta NO distinga si la cuenta existe;
 *   3. que el camino vacío pague el mismo tiempo que el real.
 *
 * ── QUÉ TIPO DE VERIFICACIÓN ES ESTA, DICHO SIN ADORNOS ──────────────────
 * **RECONSTRUIDO**, en el vocabulario de `testing.md` § «Verificación por el
 * CAMINO REAL». Las dependencias entran con `vi.fn()`: esto demuestra que la
 * FUNCIÓN es correcta, no que esté ENCHUFADA. Nadie ha comprobado todavía que
 * la Server Action de verdad llame al limitador de verdad contra Postgres.
 *
 * Sube a REAL cuando exista la costura de servidor (ver `emision.ts`) y el test
 * pueda arrancar la app, pedir un enlace cuatro veces y ver el corte. Anotado
 * en `SUPUESTOS.md`.
 *
 * ── VERIFICADO POR MUTACIÓN (2026-08-23) ─────────────────────────────────
 * Cada mutación se aplicó a `flujo.ts`, se EJECUTÓ y se restauró. Línea base:
 * 32 passed (32).
 *
 *   A) Borrar `await deps.consumirTiempoEquivalente()` del camino vacío
 *      → 1 failed | 31 passed. Rojo en «se paga el tiempo equivalente»:
 *        expected "vi.fn()" to be called 1 times, but got 0 times.
 *
 *   B) Comprobar el límite DESPUÉS de `emitirEnlace` en vez de antes
 *      → 1 failed | 31 passed. Rojo en «si el límite bloquea, el trabajo NO
 *        se hace»: expected "vi.fn()" to not be called at all, but actually
 *        been called 1 times.
 *
 *   C) Devolver «Ese correo no está registrado» en el camino vacío
 *      → 2 failed | 30 passed. Rojo en «responde EXACTAMENTE lo mismo exista
 *        o no la cuenta» y, de rebote, en la del tiempo equivalente.
 *
 * Las tres fallan por el motivo correcto, no por un fallo colateral.
 * Si tocas alguna de estas tres protecciones, se repite y se actualiza la fecha.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Dependencias que permiten todo y no hacen nada. Cada test cambia lo suyo. */
function dependencias(
  ajustes: {
    permitido?: boolean;
    reintentarEnSegundos?: number;
    emision?: ResultadoEmision;
  } = {},
) {
  const comprobarLimite = vi.fn(async () => ({
    permitido: ajustes.permitido ?? true,
    reintentarEnSegundos: ajustes.reintentarEnSegundos ?? 0,
  }));

  const emitirEnlace = vi.fn(async (): Promise<ResultadoEmision> => ajustes.emision ?? "ENVIADO");

  const consumirTiempoEquivalente = vi.fn(async () => {
    /* no hace nada: lo que se mide es SI se llama */
  });

  const deps: DependenciasRecuperar = {
    comprobarLimite,
    emitirEnlace,
    consumirTiempoEquivalente,
  };

  return { deps, comprobarLimite, emitirEnlace, consumirTiempoEquivalente };
}

describe("el orden: parsear → rate limit → trabajar", () => {
  it("con un correo mal formado no llega ni al limitador ni al trabajo", async () => {
    const { deps, comprobarLimite, emitirEnlace } = dependencias();

    const respuesta = await ejecutarRecuperacion({ email: "esto-no-es-un-correo" }, deps);

    expect(respuesta.ok).toBe(false);
    expect(comprobarLimite).not.toHaveBeenCalled();
    expect(emitirEnlace).not.toHaveBeenCalled();
  });

  /**
   * MUTACIÓN CON LA QUE SE VERIFICA: mover la llamada a `deps.comprobarLimite`
   * detrás de `deps.emitirEnlace` en `flujo.ts`, o borrarla. Este test se pone
   * en rojo por `emitirEnlace` recibiendo una llamada.
   *
   * Es LA aserción de este fichero: sin ella, «hay rate limit» solo se puede
   * comprobar leyendo el código, y el código cambia.
   */
  it("si el límite bloquea, el trabajo NO se hace: cero llamadas a emitirEnlace", async () => {
    const { deps, emitirEnlace, consumirTiempoEquivalente } = dependencias({
      permitido: false,
      reintentarEnSegundos: 900,
    });

    const respuesta = await ejecutarRecuperacion({ email: "rocio@correo.test" }, deps);

    expect(emitirEnlace).not.toHaveBeenCalled();
    expect(consumirTiempoEquivalente).not.toHaveBeenCalled();
    expect(respuesta).toEqual({
      ok: false,
      error: {
        codigo: "LIMITE_EXCEDIDO",
        mensaje: expect.any(String),
        reintentarEnSegundos: 900,
      },
    });
  });

  it("el limitador recibe el correo YA NORMALIZADO, que es sobre lo que se calcula su clave", async () => {
    const { deps, comprobarLimite, emitirEnlace } = dependencias();

    await ejecutarRecuperacion({ email: "  Rocio@Correo.TEST  " }, deps);

    // Sin normalizar, `A@B.com` y `a@b.com` serían dos cubos distintos y el
    // límite por cuenta se saltaría cambiando las mayúsculas (security.md §5).
    expect(comprobarLimite).toHaveBeenCalledWith({ email: "rocio@correo.test" });
    expect(emitirEnlace).toHaveBeenCalledWith({ email: "rocio@correo.test" });
  });
});

describe("no enumerar usuarios", () => {
  /**
   * MUTACIÓN CON LA QUE SE VERIFICA: hacer que `ejecutarRecuperacion` devuelva
   * algo distinto en la rama `NADA_QUE_HACER` —por ejemplo un `ok: false` con
   * «ese correo no está registrado»—. Este test se pone en rojo.
   *
   * Es la protección que impide que el formulario se convierta en un buscador
   * de direcciones registradas (`security.md` §2).
   */
  it("responde EXACTAMENTE lo mismo exista o no la cuenta", async () => {
    const conCuenta = dependencias({ emision: "ENVIADO" });
    const sinCuenta = dependencias({ emision: "NADA_QUE_HACER" });

    const respuestaConCuenta = await ejecutarRecuperacion(
      { email: "existe@correo.test" },
      conCuenta.deps,
    );
    const respuestaSinCuenta = await ejecutarRecuperacion(
      { email: "no-existe@correo.test" },
      sinCuenta.deps,
    );

    expect(respuestaSinCuenta).toEqual(respuestaConCuenta);
  });

  it("el mensaje es el canónico de MENSAJES, que no confirma que haya cuenta", async () => {
    const { deps } = dependencias();

    const respuesta = await ejecutarRecuperacion({ email: "rocio@correo.test" }, deps);

    expect(respuesta).toEqual({
      ok: true,
      data: {
        mensaje: mensajeRecuperarEnviado(CADUCIDAD_ENLACE_MINUTOS),
        minutosCaducidad: CADUCIDAD_ENLACE_MINUTOS,
        segundosHastaReenvio: SEGUNDOS_ANTES_DE_REENVIAR,
      },
    });
  });

  /**
   * El caso POSITIVO, que `testing.md` exige junto al negativo: una función que
   * devolviera siempre el mismo objeto pasaría el test de arriba sin hacer
   * nada. Aquí se comprueba que el trabajo SÍ se intenta.
   */
  it("cuando el límite permite, el trabajo se intenta de verdad", async () => {
    const { deps, emitirEnlace } = dependencias();

    await ejecutarRecuperacion({ email: "rocio@correo.test" }, deps);

    expect(emitirEnlace).toHaveBeenCalledTimes(1);
  });
});

describe("no enumerar usuarios POR TIEMPO", () => {
  /**
   * MUTACIÓN CON LA QUE SE VERIFICA: borrar el `if (emision === "NADA_QUE_HACER")`
   * y su llamada en `flujo.ts`. Este test se pone en rojo.
   *
   * Sin esa llamada, el camino «no hay cuenta» responde en microsegundos y el
   * real tarda decenas de milisegundos: la existencia de la cuenta se lee en el
   * cronómetro, sin leer un solo mensaje (`security.md` § «Enumeración por
   * tiempo»).
   */
  it("cuando no hay nada que hacer, se paga el tiempo equivalente", async () => {
    const { deps, consumirTiempoEquivalente } = dependencias({ emision: "NADA_QUE_HACER" });

    await ejecutarRecuperacion({ email: "no-existe@correo.test" }, deps);

    expect(consumirTiempoEquivalente).toHaveBeenCalledTimes(1);
  });

  it("cuando el trabajo SÍ se hizo, no se paga dos veces", async () => {
    const { deps, consumirTiempoEquivalente } = dependencias({ emision: "ENVIADO" });

    await ejecutarRecuperacion({ email: "existe@correo.test" }, deps);

    expect(consumirTiempoEquivalente).not.toHaveBeenCalled();
  });
});

describe("validación", () => {
  it.each([
    ["un objeto sin email", {}],
    ["un correo vacío", { email: "" }],
    ["un correo sin arroba", { email: "rocio.correo.test" }],
    ["basura que no es un objeto", "rocio@correo.test"],
    ["null", null],
  ])("rechaza %s", async (_caso, entrada) => {
    const { deps } = dependencias();

    const respuesta = await ejecutarRecuperacion(entrada, deps);

    expect(respuesta.ok).toBe(false);
  });

  it("devuelve el motivo atado al campo, para que el formulario lo pinte donde toca", async () => {
    const { deps } = dependencias();

    const respuesta = await ejecutarRecuperacion({ email: "sin-arroba" }, deps);

    expect(respuesta.ok).toBe(false);
    if (respuesta.ok) return;

    expect(respuesta.error.codigo).toBe("VALIDACION");
    expect(respuesta.error.detalles).toEqual([{ campo: "email", motivo: expect.any(String) }]);
  });
});
