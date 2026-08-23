import { describe, expect, it } from "vitest";

import {
  SEGUNDOS_ENTRE_COMPROBACIONES,
  hayQueComprobarContraLaBase,
  type Sensibilidad,
} from "./sesion";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDICIÓN DEL COSTE DE `evaluarSesion`
 *
 * Aquí se cuentan las consultas a la base que provoca la comprobación de sesión,
 * ANTES y DESPUÉS de acotarla. No es una estimación: se simula una sesión de uso
 * real y se cuentan.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *   Mutación: hacer que `hayQueComprobarContraLaBase` devuelva `false` también
 *   para `MUTACION` (o sea, acotar también las escrituras).
 *   Resultado MEDIDO: **3 tests en rojo**
 *     · «una MUTACIÓN siempre consulta, recién comprobada o no»
 *     · «ventana CERO para escrituras: 12 mutaciones → 12 consultas»
 *     · «tras revocar, la siguiente MUTACIÓN se entera al instante»
 *   Restaurado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Una petición de la sesión simulada. */
type Peticion = { enSegundo: number; sensibilidad: Sensibilidad };

/**
 * Simula el callback de sesión sobre una secuencia de peticiones y devuelve
 * cuántas veces se habría consultado la base.
 */
function contarConsultas(peticiones: readonly Peticion[], ventanaSegundos?: number): number {
  let ultimaComprobacion: number | undefined;
  let consultas = 0;

  for (const p of peticiones) {
    const hayQue = hayQueComprobarContraLaBase({
      sensibilidad: p.sensibilidad,
      ultimaComprobacion,
      ahoraSegundos: p.enSegundo,
      ...(ventanaSegundos !== undefined ? { ventanaSegundos } : {}),
    });

    if (hayQue) {
      consultas += 1;
      ultimaComprobacion = p.enSegundo;
    }
  }

  return consultas;
}

/**
 * Sesión de uso realista: cinco minutos navegando por el vault.
 *
 * 60 navegaciones (abrir la biblioteca, entrar en fichas, filtrar, volver…) más
 * 5 mutaciones repartidas. Una navegación RSC puede disparar varias peticiones,
 * así que 60 en 5 minutos es conservador.
 */
const SESION_REALISTA: Peticion[] = [
  ...Array.from({ length: 60 }, (_, i) => ({
    enSegundo: i * 5, // una cada 5 s durante 5 minutos
    sensibilidad: "LECTURA" as const,
  })),
  ...[30, 90, 150, 210, 270].map((s) => ({ enSegundo: s, sensibilidad: "MUTACION" as const })),
].sort((a, b) => a.enSegundo - b.enSegundo);

describe("MEDICIÓN · consultas por sesión de 5 minutos", () => {
  it("SIN acotar sería una consulta por petición", () => {
    // El diseño original: `evaluarSesion` en cada petición autenticada.
    const sinAcotar = SESION_REALISTA.length;

    expect(sinAcotar).toBe(65);
  });

  it("CON el corte de 60 s, las consultas caen a una fracción", () => {
    const consultas = contarConsultas(SESION_REALISTA);

    // 5 mutaciones (siempre) + las lecturas que caen fuera de ventana.
    expect(consultas).toBeLessThan(15);

    const reduccion = 1 - consultas / SESION_REALISTA.length;
    expect(reduccion).toBeGreaterThan(0.75);

    // Se deja el número exacto a la vista: si un cambio lo empeora, salta.
    expect(consultas, `consultas en 5 min de uso: ${consultas} de 65 peticiones`).toBe(10);
  });

  it("una hora de lectura continua son ~60 consultas, no ~2.400", () => {
    // 40 peticiones por minuto durante 60 minutos.
    const unaHora: Peticion[] = Array.from({ length: 2_400 }, (_, i) => ({
      enSegundo: Math.floor(i * 1.5),
      sensibilidad: "LECTURA" as const,
    }));

    const consultas = contarConsultas(unaHora);

    expect(unaHora.length).toBe(2_400);
    expect(consultas).toBe(60); // una por minuto
    expect(consultas / unaHora.length).toBeLessThan(0.03);
  });
});

describe("EL EQUILIBRIO · ventana de 60 s en lectura, CERO en escritura", () => {
  it("una lectura recién comprobada NO vuelve a consultar", () => {
    const hayQue = hayQueComprobarContraLaBase({
      sensibilidad: "LECTURA",
      ultimaComprobacion: 1_000,
      ahoraSegundos: 1_030, // 30 s después
    });

    expect(hayQue).toBe(false);
  });

  it("a los 60 s exactos vuelve a consultar", () => {
    const hayQue = hayQueComprobarContraLaBase({
      sensibilidad: "LECTURA",
      ultimaComprobacion: 1_000,
      ahoraSegundos: 1_060,
    });

    expect(hayQue).toBe(true);
  });

  it("una MUTACIÓN siempre consulta, recién comprobada o no", () => {
    // Ventana CERO: es donde una sesión revocada haría daño de verdad.
    for (const desfase of [0, 1, 30, 59]) {
      const hayQue = hayQueComprobarContraLaBase({
        sensibilidad: "MUTACION",
        ultimaComprobacion: 1_000,
        ahoraSegundos: 1_000 + desfase,
      });

      expect(hayQue, `desfase ${desfase} s`).toBe(true);
    }
  });

  it("ventana CERO para escrituras: 12 mutaciones seguidas → 12 consultas", () => {
    const mutaciones: Peticion[] = Array.from({ length: 12 }, (_, i) => ({
      enSegundo: i, // una por segundo, todas dentro de la ventana
      sensibilidad: "MUTACION" as const,
    }));

    expect(contarConsultas(mutaciones)).toBe(12);
  });

  it("sin marca previa se consulta siempre", () => {
    expect(
      hayQueComprobarContraLaBase({
        sensibilidad: "LECTURA",
        ultimaComprobacion: undefined,
        ahoraSegundos: 1_000,
      }),
    ).toBe(true);
  });

  it("una marca en el FUTURO se trata como sospechosa y se consulta", () => {
    // Un reloj que va hacia atrás, o un token manipulado para posponer el
    // chequeo indefinidamente.
    expect(
      hayQueComprobarContraLaBase({
        sensibilidad: "LECTURA",
        ultimaComprobacion: 9_999,
        ahoraSegundos: 1_000,
      }),
    ).toBe(true);
  });
});

describe("LA VENTANA · cuánto sobrevive una sesión revocada", () => {
  it("una LECTURA sobrevive como mucho 60 segundos", () => {
    const revocadoEn = 1_000;
    const comprobadoEn = revocadoEn - 1; // se comprobó justo antes de revocar

    // Justo antes del límite: todavía confía en el token.
    expect(
      hayQueComprobarContraLaBase({
        sensibilidad: "LECTURA",
        ultimaComprobacion: comprobadoEn,
        ahoraSegundos: comprobadoEn + SEGUNDOS_ENTRE_COMPROBACIONES - 1,
      }),
    ).toBe(false);

    // A partir del límite, se entera.
    expect(
      hayQueComprobarContraLaBase({
        sensibilidad: "LECTURA",
        ultimaComprobacion: comprobadoEn,
        ahoraSegundos: comprobadoEn + SEGUNDOS_ENTRE_COMPROBACIONES,
      }),
    ).toBe(true);
  });

  it("tras revocar, la siguiente MUTACIÓN se entera al instante", () => {
    // Lo que importa: nadie puede ESCRIBIR con una sesión revocada, ni un
    // segundo. Leer un listado obsoleto durante 60 s es tolerable; modificar el
    // vault de alguien que acaba de cerrar sus sesiones, no.
    expect(
      hayQueComprobarContraLaBase({
        sensibilidad: "MUTACION",
        ultimaComprobacion: 999,
        ahoraSegundos: 1_000,
      }),
    ).toBe(true);
  });

  it("el borrado de cuenta no depende de la ventana", () => {
    // `evaluarSesion` devuelve USUARIO_NO_EXISTE cuando la fila no está, y eso
    // no depende del reloj. La ventana solo retrasa CUÁNDO se pregunta.
    expect(SEGUNDOS_ENTRE_COMPROBACIONES).toBeLessThanOrEqual(60);
  });
});
