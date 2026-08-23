import { describe, expect, it } from "vitest";

import {
  PARAMETROS_ARGON2,
  consumirTiempoEquivalente,
  hashearPassword,
  verificarPassword,
} from "./password";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * Mutación: en `verificarPassword`, sustituir la rama del señuelo
 *
 *     if (hashAlmacenado === null) {
 *       await verify(await hashSenuelo(), password).catch(() => false);
 *       return false;
 *     }
 *
 * por un `return false` inmediato (que es la implementación ingenua).
 *
 * Resultado MEDIDO: el test «tarda lo mismo con usuario inexistente» se pone en
 * ROJO con `expected 0.0006 to be greater than 1`. La implementación ingenua
 * responde ~0,0006 ms frente a los ~30 ms del camino real: **60.000 veces más
 * rápido**, que es exactamente la señal que un atacante cronometra.
 * Restaurado y verde (10/10).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PASSWORD = "una contraseña razonablemente larga 123";

describe("hash y verificación", () => {
  it("un hash válido verifica la contraseña correcta", async () => {
    const h = await hashearPassword(PASSWORD);
    expect(await verificarPassword(PASSWORD, h)).toBe(true);
  }, 20_000);

  it("rechaza una contraseña incorrecta", async () => {
    const h = await hashearPassword(PASSWORD);
    expect(await verificarPassword("otra cosa", h)).toBe(false);
  }, 20_000);

  it("dos hashes de la misma contraseña son distintos (sal aleatoria)", async () => {
    const [a, b] = await Promise.all([hashearPassword(PASSWORD), hashearPassword(PASSWORD)]);
    expect(a).not.toBe(b);
  }, 20_000);

  it("el hash es Argon2id, no Argon2i ni Argon2d", async () => {
    const h = await hashearPassword(PASSWORD);
    expect(h.startsWith("$argon2id$")).toBe(true);
  }, 20_000);

  it("usa los parámetros del perfil OWASP", () => {
    expect(PARAMETROS_ARGON2).toEqual({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  });

  it("un hash corrupto devuelve false, no una excepción", async () => {
    // Propagar daría un 500 que además distingue esa cuenta de las demás.
    expect(await verificarPassword(PASSWORD, "esto no es un hash")).toBe(false);
    expect(await verificarPassword(PASSWORD, "$argon2id$roto")).toBe(false);
  }, 20_000);

  it("un usuario sin contraseña (solo OAuth) no autentica", async () => {
    expect(await verificarPassword(PASSWORD, null)).toBe(false);
  }, 20_000);
});

describe("ENUMERACIÓN POR TIEMPO · el reloj no puede delatar qué cuentas existen", () => {
  /** Mediana: resiste mucho mejor que la media al ruido del recolector y del SO. */
  function mediana(valores: number[]): number {
    const orden = [...valores].sort((a, b) => a - b);
    const medio = Math.floor(orden.length / 2);
    return orden.length % 2 === 0
      ? ((orden[medio - 1] ?? 0) + (orden[medio] ?? 0)) / 2
      : (orden[medio] ?? 0);
  }

  async function medir(fn: () => Promise<unknown>, repeticiones: number): Promise<number[]> {
    const tiempos: number[] = [];
    for (let i = 0; i < repeticiones; i += 1) {
      const t0 = performance.now();
      await fn();
      tiempos.push(performance.now() - t0);
    }
    return tiempos;
  }

  it("verificar contra un usuario INEXISTENTE tarda lo mismo que contra uno real", async () => {
    const hashReal = await hashearPassword(PASSWORD);

    // Calentamiento: la primera llamada paga el cálculo del señuelo y el JIT.
    await verificarPassword("x", hashReal);
    await verificarPassword("x", null);

    const REPETICIONES = 7;
    const conUsuario = await medir(() => verificarPassword("incorrecta", hashReal), REPETICIONES);
    const sinUsuario = await medir(() => verificarPassword("incorrecta", null), REPETICIONES);

    const mReal = mediana(conUsuario);
    const mSenuelo = mediana(sinUsuario);

    // Ambos caminos ejecutan Argon2: los dos tienen que costar de verdad.
    expect(mReal).toBeGreaterThan(1);
    expect(mSenuelo).toBeGreaterThan(1);

    // El margen es holgado a propósito: esto corre en CI compartido y medir
    // tiempos es ruidoso. Lo que se detecta es la diferencia de ORDEN DE
    // MAGNITUD que delata una cuenta (milisegundos frente a decenas de ms),
    // no una desviación del 20 %.
    const proporcion = Math.max(mReal, mSenuelo) / Math.min(mReal, mSenuelo);
    expect(
      proporcion,
      `usuario real ${mReal.toFixed(1)} ms · inexistente ${mSenuelo.toFixed(1)} ms`,
    ).toBeLessThan(3);
  }, 60_000);

  it("consumirTiempoEquivalente cuesta lo mismo que una verificación", async () => {
    const hashReal = await hashearPassword(PASSWORD);

    await consumirTiempoEquivalente();
    await verificarPassword("x", hashReal);

    const conHash = mediana(await medir(() => verificarPassword("x", hashReal), 5));
    const soloTiempo = mediana(await medir(() => consumirTiempoEquivalente(), 5));

    expect(soloTiempo).toBeGreaterThan(1);
    const proporcion = Math.max(conHash, soloTiempo) / Math.min(conHash, soloTiempo);
    expect(
      proporcion,
      `con hash ${conHash.toFixed(1)} ms · solo tiempo ${soloTiempo.toFixed(1)} ms`,
    ).toBeLessThan(3);
  }, 60_000);

  it("el señuelo NUNCA autentica, pase lo que pase", async () => {
    // Sería catastrófico que la contraseña del señuelo abriera cuentas sin hash.
    for (const intento of [
      "contrasena señuelo que nunca autentica a nadie",
      "",
      "admin",
    ]) {
      expect(await verificarPassword(intento, null)).toBe(false);
    }
  }, 30_000);
});
