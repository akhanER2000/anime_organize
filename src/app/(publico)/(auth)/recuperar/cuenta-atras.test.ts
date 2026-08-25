import { describe, expect, it } from "vitest";

import {
  etiquetaReenvio,
  formatearCuentaAtras,
  puedeReenviar,
  segundosRestantes,
} from "./cuenta-atras";

/**
 * Tests de la cuenta atrás del reenvío.
 *
 * NO son tests de seguridad —la cuenta atrás es cosmética y el límite real vive
 * en el servidor—, así que no llevan nota de mutación ni de camino real
 * (`testing.md`). Lo que protegen es la lectura: un «0:5» o un «-1» en un botón
 * que además está deshabilitado hace pensar que la pantalla se ha colgado.
 */

describe("segundosRestantes", () => {
  it("redondea hacia arriba: mientras quede un milisegundo, sigue contando", () => {
    const restantes = segundosRestantes(1_000_001, 1_000_000);

    expect(restantes).toBe(1);
  });

  it("devuelve los segundos exactos cuando la diferencia es redonda", () => {
    const restantes = segundosRestantes(60_000, 0);

    expect(restantes).toBe(60);
  });

  it("corta en cero cuando el instante de fin ya pasó", () => {
    const restantes = segundosRestantes(1_000, 9_999);

    expect(restantes).toBe(0);
  });

  it("devuelve cero, y no NaN, si el instante no es un número finito", () => {
    expect(segundosRestantes(Number.NaN, 0)).toBe(0);
    expect(segundosRestantes(Number.POSITIVE_INFINITY, 0)).toBe(0);
  });
});

describe("formatearCuentaAtras", () => {
  it.each([
    [42, "0:42"],
    [5, "0:05"],
    [60, "1:00"],
    [65, "1:05"],
    [125, "2:05"],
    [0, "0:00"],
  ])("formatea %i segundos como %s", (segundos, esperado) => {
    expect(formatearCuentaAtras(segundos)).toBe(esperado);
  });

  it("rellena los segundos con cero pero NO los minutos: es «0:42», no «00:42»", () => {
    expect(formatearCuentaAtras(42)).toBe("0:42");
  });

  it("nunca pinta un tiempo negativo", () => {
    expect(formatearCuentaAtras(-30)).toBe("0:00");
  });

  it("reproduce el fotograma del artboard 07", () => {
    expect(formatearCuentaAtras(42)).toBe("0:42");
  });
});

describe("puedeReenviar", () => {
  it("deja reenviar cuando la cuenta atrás llega a cero", () => {
    expect(puedeReenviar(0)).toBe(true);
  });

  it("bloquea mientras quede aunque sea un segundo", () => {
    expect(puedeReenviar(1)).toBe(false);
  });

  /**
   * La dirección en la que se falla importa: un botón que no se activa se ve al
   * instante; uno que se activa cuando no debe, no. `NaN <= 0` es `false`, así
   * que un valor corrupto deja el botón bloqueado.
   */
  it("ante un valor corrupto se queda bloqueado, no desbloqueado", () => {
    expect(puedeReenviar(Number.NaN)).toBe(false);
  });
});

describe("etiquetaReenvio", () => {
  it("cuenta atrás en marcha: dice cuánto falta, que es el nombre accesible del botón", () => {
    expect(etiquetaReenvio(42)).toBe("Reenviar en 0:42");
  });

  it("cuenta atrás terminada: ofrece la acción", () => {
    expect(etiquetaReenvio(0)).toBe("Reenviar el enlace");
  });
});
