import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { crearCuenta, emitirEnlaceDeReset } from "./cuentas";
import { dbInterna } from "./interno";
import { users } from "./schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENUMERACIÓN POR TIEMPO EN LA RECUPERACIÓN · CONTRA POSTGRES REAL.
 *
 * CAMINO REAL (2026-08-24) — `.claude/rules/testing.md`.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────────────
 * `/recuperar` responde exactamente el mismo mensaje exista o no la cuenta.
 * Eso cierra el canal del TEXTO. Pero queda el del RELOJ: si el camino con
 * cuenta hace dos idas y vuelta a la base y el camino sin cuenta hace una, la
 * respuesta tarda la mitad y un cronómetro dice lo que el mensaje calla.
 *
 * ── LA HISTORIA, PORQUE EXPLICA POR QUÉ EL TEST ES ASÍ ─────────────────────
 * Un auditor lo midió en **7,2x** (1.179 ms contra 164 ms). La causa: el camino
 * real abría una transacción por WebSocket —un `Pool` nuevo cada vez— mientras
 * el señuelo pagaba un `verify` de Argon2id calibrado para otra cosa.
 *
 * Se arregló en dos pasos, y los dos hicieron falta:
 *   1. la escritura pasó a `batch` sobre HTTP → 1,92x (141 ms de diferencia);
 *   2. el camino sin cuenta pasó a ejecutar **la misma operación** contra un id
 *      inexistente → **0,95x (15 ms)**, dentro del ruido.
 *
 * ── POR QUÉ SE COMPARA UNA RAZÓN Y NO UN NÚMERO ────────────────────────────
 * Un umbral en milisegundos se rompería con la latencia de otra máquina o de
 * otra región de Neon. La razón entre los dos caminos es estable porque los dos
 * pagan lo mismo. El margen es amplio a propósito: la implementación correcta
 * ronda 1,0 y la rota se va a ~0,5, así que 0,7 separa sin volverse
 * intermitente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const HASH_FALSO = "$argon2id$v=19$m=19456,t=2,p=1$" + "x".repeat(22) + "$" + "y".repeat(43);
const CADUCIDAD_MS = 60 * 60 * 1000;
const MUESTRAS = 5;

/** Mediana, no media: una latencia puntual de red no debe mover el resultado. */
function mediana(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
}

describe("el reloj no dice si la cuenta existe", () => {
  const correos: string[] = [];

  afterAll(async () => {
    if (correos.length > 0) {
      await dbInterna().delete(users).where(inArray(users.email, correos));
    }
  });

  it("pedir un enlace cuesta LO MISMO exista o no la dirección", async () => {
    const conCuenta: number[] = [];
    for (let i = 0; i < MUESTRAS; i++) {
      const email = `tiempo-${randomUUID()}@ejemplo.test`;
      correos.push(email);
      await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null });

      const t0 = Date.now();
      await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
      conCuenta.push(Date.now() - t0);
    }

    const sinCuenta: number[] = [];
    for (let i = 0; i < MUESTRAS; i++) {
      const t0 = Date.now();
      await emitirEnlaceDeReset({
        email: `nadie-${randomUUID()}@ejemplo.test`,
        caducidadMs: CADUCIDAD_MS,
      });
      sinCuenta.push(Date.now() - t0);
    }

    const conMs = mediana(conCuenta);
    const sinMs = mediana(sinCuenta);
    const razon = sinMs / conMs;

    // Se informa siempre: si un día esto empieza a acercarse al límite, quiero
    // verlo en la salida antes de que se ponga rojo.
    console.info(
      `[tiempo] con cuenta ${String(conMs)} ms · sin cuenta ${String(sinMs)} ms · ` +
        `razón ${razon.toFixed(2)}x`,
    );

    expect(
      razon,
      `el camino SIN cuenta responde en ${razon.toFixed(2)}x lo que tarda el camino CON ` +
        "cuenta: esa diferencia es un oráculo de qué direcciones están registradas",
    ).toBeGreaterThan(0.7);
  }, 180_000);
});
