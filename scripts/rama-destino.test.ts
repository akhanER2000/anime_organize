import { describe, expect, it } from "vitest";

import { describirDestino, exigirMismaRama } from "./rama-destino";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA GUARDA QUE IMPIDE OPERAR SOBRE DOS RAMAS A LA VEZ.
 *
 * Es la sexta repetición de «la operación tuvo éxito, ¿SOBRE QUÉ?». Pasar solo
 * `DATABASE_URL` en línea deja `DATABASE_URL_UNPOOLED` valiendo lo de
 * `.env.local`, y los scripts no leen todos la misma.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Desactivando la guarda (`if (true) return`) → 2 en rojo: el caso que para
 *   y el que comprueba que el mensaje no lleva la credencial.
 *   Quitando el `.replace("-pooler", "")` → 1 en rojo, el del caso NORMAL: la
 *   guarda saltaría siempre y se acabaría desactivando.
 *   Restaurado → 7 verdes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PROD_POOL = "postgresql://u:p@ep-broad-water-aym5x71z-pooler.c-5.us-east-2.aws.neon.tech/neondb";
const PROD_DIR = "postgresql://u:p@ep-broad-water-aym5x71z.c-5.us-east-2.aws.neon.tech/neondb";
const DEV_DIR = "postgresql://u:p@ep-green-recipe-ay3kbq97.c-5.us-east-2.aws.neon.tech/neondb";

describe("exigirMismaRama", () => {
  it("la cadena agrupada y la directa de la MISMA rama no son dos ramas", () => {
    // El caso normal, y el que decide si esta guarda es usable: `-pooler` es lo
    // único que las diferencia. Una guarda que salte aquí salta siempre.
    expect(() =>
      exigirMismaRama({ DATABASE_URL: PROD_POOL, DATABASE_URL_UNPOOLED: PROD_DIR }),
    ).not.toThrow();
  });

  it("dos ramas distintas PARAN, y el mensaje dice cuáles", () => {
    // El fallo real: se pasó producción en línea y la directa siguió siendo la
    // de `.env.local`, que es desarrollo.
    expect(() =>
      exigirMismaRama({ DATABASE_URL: PROD_POOL, DATABASE_URL_UNPOOLED: DEV_DIR }),
    ).toThrow(/DOS RAMAS A LA VEZ/);
  });

  it("el mensaje NO lleva la credencial dentro", () => {
    let mensaje = "";
    try {
      exigirMismaRama({ DATABASE_URL: PROD_POOL, DATABASE_URL_UNPOOLED: DEV_DIR });
    } catch (error) {
      mensaje = error instanceof Error ? error.message : "";
    }

    expect(mensaje).not.toContain("u:p");
    expect(mensaje).toContain("ep-broad-water");
    expect(mensaje).toContain("ep-green-recipe");
  });

  it("sin la segunda variable no hay dos ramas posibles", () => {
    // Quien lee `DATABASE_URL_UNPOOLED` cae en `DATABASE_URL` cuando falta. No
    // hay ambigüedad que denunciar, y parar aquí rompería el uso normal.
    expect(() => exigirMismaRama({ DATABASE_URL: PROD_POOL })).not.toThrow();
    expect(() => exigirMismaRama({})).not.toThrow();
  });

  it("una cadena ilegible no se convierte en un falso positivo", () => {
    // Un `throw` aquí diría «dos ramas» cuando el problema es otro, y mandaría
    // a buscar donde no está.
    expect(() =>
      exigirMismaRama({ DATABASE_URL: "no-es-una-url", DATABASE_URL_UNPOOLED: DEV_DIR }),
    ).not.toThrow();
  });
});

describe("describirDestino", () => {
  it("dice el host y la base, nunca la contraseña", () => {
    const texto = describirDestino(PROD_POOL);

    expect(texto).toContain("ep-broad-water-aym5x71z-pooler");
    expect(texto).toContain('base "neondb"');
    expect(texto).not.toContain("u:p");
  });

  it("una cadena ilegible se dice, no se imprime", () => {
    expect(describirDestino("????")).toBe("(cadena de conexión ilegible)");
  });
});
