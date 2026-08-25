import { describe, expect, it } from "vitest";

import { etiquetaDeProgreso, rellenoDeBarra, type ProgresoDeFicha } from "./progreso-barra";

/**
 * La tabla de `anime-vault-domain` §4, caso por caso.
 *
 * No es una comprobación decorativa: la barra es lo único que comunica «por
 * dónde voy» de un vistazo, y las cinco filas de esa tabla se comportan de
 * forma distinta a propósito. Un `EPISODIO` sin `total_episodes` conocido
 * **tiene** que quedar indeterminado; si alguien lo «arregla» devolviendo 0,
 * la ficha pasa a afirmar que el usuario no ha visto nada.
 */

const SIN_TOTALES = { totalEpisodes: null, totalSeasons: null } as const;

/** Un progreso con todo a null salvo lo que cada test rellene. */
function progreso(parcial: Partial<ProgresoDeFicha> & { kind: ProgresoDeFicha["kind"] }) {
  return { season: null, episode: null, percent: null, ...parcial };
}

describe("rellenoDeBarra", () => {
  it("sin fila de progreso deja la barra indeterminada", () => {
    const relleno = rellenoDeBarra(null, SIN_TOTALES);

    expect(relleno).toBeNull();
  });

  it("COMPLETO llena la barra al 100 %", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "COMPLETO" }), SIN_TOTALES);

    expect(relleno).toBe(100);
  });

  it("COMPLETO no necesita conocer los totales", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "COMPLETO" }), {
      totalEpisodes: null,
      totalSeasons: null,
    });

    expect(relleno).toBe(100);
  });

  it("PORCENTAJE usa el porcentaje tal cual", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "PORCENTAJE", percent: 45 }), SIN_TOTALES);

    expect(relleno).toBe(45);
  });

  it("PORCENTAJE sin porcentaje guardado queda indeterminado", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "PORCENTAJE" }), SIN_TOTALES);

    expect(relleno).toBeNull();
  });

  it("EPISODIO calcula episodio entre total cuando se conoce el total", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", season: 1, episode: 14 }), {
      totalEpisodes: 28,
      totalSeasons: null,
    });

    expect(relleno).toBe(50);
  });

  it("EPISODIO sin total conocido queda INDETERMINADO, no a cero", () => {
    // El caso importante: 0 % afirmaría que no ha visto nada, y lo que pasa es
    // que no sabemos cuántos episodios tiene la serie.
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: 14 }), SIN_TOTALES);

    expect(relleno).toBeNull();
  });

  it("EPISODIO sin episodio guardado queda indeterminado", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO" }), {
      totalEpisodes: 28,
      totalSeasons: null,
    });

    expect(relleno).toBeNull();
  });

  it("TEMPORADA calcula temporada entre total de temporadas", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "TEMPORADA", season: 1 }), {
      totalEpisodes: null,
      totalSeasons: 4,
    });

    expect(relleno).toBe(25);
  });

  it("TEMPORADA sin total de temporadas queda indeterminada", () => {
    // Es el caso REAL del seed: las 4 filas `T1` se mapean a TEMPORADA con
    // `season = 1`, y nadie conoce todavía cuántas temporadas tiene la serie.
    const relleno = rellenoDeBarra(progreso({ kind: "TEMPORADA", season: 1 }), SIN_TOTALES);

    expect(relleno).toBeNull();
  });

  it("CUSTOM queda siempre indeterminado aunque se conozcan los totales", () => {
    // Las 10 filas `EN_PROCESO` del seed son CUSTOM: el usuario escribió «En
    // Proceso» y no dijo por qué episodio va. Inventar un número sería
    // inventar datos suyos.
    const relleno = rellenoDeBarra(progreso({ kind: "CUSTOM" }), {
      totalEpisodes: 28,
      totalSeasons: 2,
    });

    expect(relleno).toBeNull();
  });
});

describe("rellenoDeBarra · límites que no pueden romper la barra", () => {
  it("un episodio por encima del total se acota a 100, no a 107", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: 30 }), {
      totalEpisodes: 28,
      totalSeasons: null,
    });

    expect(relleno).toBe(100);
  });

  it("un episodio negativo se acota a 0", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: -3 }), {
      totalEpisodes: 28,
      totalSeasons: null,
    });

    expect(relleno).toBe(0);
  });

  it("un total de 0 NO divide: queda indeterminado en vez de infinito", () => {
    // `width: Infinity%` deja la barra llena mintiendo. La base lo impide con
    // un CHECK, pero una importación de .xlsx no.
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: 5 }), {
      totalEpisodes: 0,
      totalSeasons: null,
    });

    expect(relleno).toBeNull();
  });

  it("un porcentaje por encima de 100 se acota", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "PORCENTAJE", percent: 250 }), SIN_TOTALES);

    expect(relleno).toBe(100);
  });

  it("un porcentaje negativo se acota a 0", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "PORCENTAJE", percent: -10 }), SIN_TOTALES);

    expect(relleno).toBe(0);
  });

  it("un NaN no se propaga al ancho de la barra", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "PORCENTAJE", percent: Number.NaN }), {
      totalEpisodes: null,
      totalSeasons: null,
    });

    expect(relleno).toBe(0);
  });

  it("un total no finito queda indeterminado", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: 5 }), {
      totalEpisodes: Number.POSITIVE_INFINITY,
      totalSeasons: null,
    });

    expect(relleno).toBeNull();
  });

  it("redondea a entero: 1 de 3 episodios es 33, no 33,333…", () => {
    const relleno = rellenoDeBarra(progreso({ kind: "EPISODIO", episode: 1 }), {
      totalEpisodes: 3,
      totalSeasons: null,
    });

    expect(relleno).toBe(33);
  });
});

describe("etiquetaDeProgreso", () => {
  it("prefiere SIEMPRE la etiqueta que escribió el usuario", () => {
    const texto = etiquetaDeProgreso("Completo (Todo Visto)", 100);

    expect(texto).toBe("Completo (Todo Visto)");
  });

  it("conserva la etiqueta original aunque el relleno sea indeterminado", () => {
    const texto = etiquetaDeProgreso("En Proceso", null);

    expect(texto).toBe("En Proceso");
  });

  it("sin etiqueta ni número dice que no hay progreso, NUNCA «0 %»", () => {
    const texto = etiquetaDeProgreso(null, null);

    expect(texto).toBe("Sin progreso registrado");
  });

  it("una etiqueta en blanco cuenta como ausente", () => {
    const texto = etiquetaDeProgreso("   ", null);

    expect(texto).toBe("Sin progreso registrado");
  });

  it("sin etiqueta pero con número, compone el porcentaje", () => {
    const texto = etiquetaDeProgreso(null, 45);

    expect(texto).toBe("45 %");
  });
});
