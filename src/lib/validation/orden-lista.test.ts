import { describe, expect, it } from "vitest";

import {
  ORDEN_POR_DEFECTO,
  ariaSort,
  enlaceDeOrden,
  leerOrden,
  ordenar,
  siguienteOrden,
} from "./orden-lista";

import type { FilaOrdenable, ParametrosCrudos } from "./orden-lista";
import type { Estado } from "@/lib/domain/enums";

/**
 * EL ORDEN DE LA VISTA LISTA.
 *
 * Títulos reales del vault (`animes-seed.json`): son los que tienen las trampas
 * de verdad —acentos, un número final que NO es una temporada, dos series que
 * empiezan igual—. Inventar «Anime A / Anime B» habría dado un test verde e
 * inútil.
 */

const fila = (titulo: string, estado: Estado, iso: string): FilaOrdenable => ({
  titulo,
  estado,
  actualizadoEn: new Date(iso),
});

const VAULT: readonly FilaOrdenable[] = [
  fila("Mushishi", "VISTO", "2026-02-28T10:00:00.000Z"),
  fila("Sousou no Frieren", "VIENDO", "2026-03-12T10:00:00.000Z"),
  fila("White Album", "VISTO", "2025-12-22T10:00:00.000Z"),
  fila("White Album 2", "EN_ESPERA", "2026-01-04T10:00:00.000Z"),
  fila("Ángel Beats!", "ABANDONADO", "2026-02-07T10:00:00.000Z"),
];

const titulos = (filas: readonly FilaOrdenable[]): string[] => filas.map((f) => f.titulo);

describe("leerOrden", () => {
  it("sin parámetros, ordena por lo último actualizado", () => {
    expect(leerOrden({})).toEqual(ORDEN_POR_DEFECTO);
  });

  it("lee el campo y la dirección de la URL", () => {
    expect(leerOrden({ orden: "titulo", dir: "asc" })).toEqual({
      campo: "titulo",
      direccion: "asc",
    });
  });

  it.each<[string, ParametrosCrudos]>([
    ["un campo inventado", { orden: "password", dir: "asc" }],
    ["una dirección inventada", { orden: "titulo", dir: "arriba" }],
    ["una inyección", { orden: "'; drop table anime; --", dir: "desc" }],
    ["un array vacío", { orden: [], dir: [] }],
    ["nada de nada", { orden: undefined, dir: undefined }],
  ])("con %s NO rompe la página: cae al valor por defecto", (_caso, parametros) => {
    // `api-conventions.md`: «descarta basura sin romper la página».
    const resultado = leerOrden(parametros);

    expect(["titulo", "estado", "actualizado"]).toContain(resultado.campo);
    expect(["asc", "desc"]).toContain(resultado.direccion);
  });

  it("con el parámetro repetido se queda con el primero", () => {
    expect(leerOrden({ orden: ["titulo", "estado"], dir: "asc" }).campo).toBe("titulo");
  });
});

describe("ordenar", () => {
  it("por título ascendente respeta los acentos del español", () => {
    // Con un `<` sobre code points, «Ángel Beats!» caería detrás de «White
    // Album»: 'Á' (U+00C1) es mayor que 'W'.
    expect(titulos(ordenar(VAULT, { campo: "titulo", direccion: "asc" }))).toEqual([
      "Ángel Beats!",
      "Mushishi",
      "Sousou no Frieren",
      "White Album",
      "White Album 2",
    ]);
  });

  it("«White Album 2» va DESPUÉS de «White Album», no colapsado con él", () => {
    // Son dos series distintas y las dos están en el vault real
    // (`anime-vault-domain` §1): el orden no puede sugerir que son la misma.
    const ordenadas = titulos(ordenar(VAULT, { campo: "titulo", direccion: "asc" }));

    expect(ordenadas.indexOf("White Album")).toBeLessThan(ordenadas.indexOf("White Album 2"));
  });

  it("descendente es EXACTAMENTE la inversa de ascendente", () => {
    const asc = titulos(ordenar(VAULT, { campo: "titulo", direccion: "asc" }));
    const desc = titulos(ordenar(VAULT, { campo: "titulo", direccion: "desc" }));

    expect(desc).toEqual([...asc].reverse());
  });

  it("por actualizado descendente pone arriba lo último tocado", () => {
    expect(titulos(ordenar(VAULT, { campo: "actualizado", direccion: "desc" }))[0]).toBe(
      "Sousou no Frieren",
    );
  });

  it("por estado usa el orden del DOMINIO, no el alfabético", () => {
    // VISTO, VIENDO, EN_ESPERA, ABANDONADO, PENDIENTE (`enums.ts`). Alfabético
    // sería ABANDONADO primero.
    expect(titulos(ordenar(VAULT, { campo: "estado", direccion: "asc" }))).toEqual([
      "Mushishi",
      "White Album",
      "Sousou no Frieren",
      "White Album 2",
      "Ángel Beats!",
    ]);
  });

  it("los empates se rompen por título, así que el orden es ESTABLE", () => {
    // Dos filas con el mismo estado y distinta fecha: sin desempate explícito
    // quedarían en el orden de llegada, que cambia cada vez que el usuario toca
    // cualquier anime. Un orden que baila entre recargas parece un fallo.
    const empatadas = [
      fila("Zeta", "VISTO", "2026-01-01T00:00:00.000Z"),
      fila("Alfa", "VISTO", "2026-05-05T00:00:00.000Z"),
    ];

    expect(titulos(ordenar(empatadas, { campo: "estado", direccion: "asc" }))).toEqual([
      "Alfa",
      "Zeta",
    ]);
  });

  it("no muta la lista que recibe", () => {
    const original = titulos(VAULT);

    ordenar(VAULT, { campo: "titulo", direccion: "desc" });

    expect(titulos(VAULT)).toEqual(original);
  });

  it("una lista vacía se ordena sin quejarse", () => {
    expect(ordenar([], { campo: "titulo", direccion: "asc" })).toEqual([]);
  });
});

describe("siguienteOrden", () => {
  it("pulsar una columna nueva empieza por su dirección natural", () => {
    // Un título se lee de la A a la Z; una fecha se mira por lo más reciente.
    expect(siguienteOrden(ORDEN_POR_DEFECTO, "titulo")).toEqual({
      campo: "titulo",
      direccion: "asc",
    });
    expect(siguienteOrden({ campo: "titulo", direccion: "asc" }, "actualizado")).toEqual({
      campo: "actualizado",
      direccion: "desc",
    });
  });

  it("pulsar la columna que ya ordena le da la vuelta", () => {
    expect(siguienteOrden({ campo: "titulo", direccion: "asc" }, "titulo")).toEqual({
      campo: "titulo",
      direccion: "desc",
    });
    expect(siguienteOrden({ campo: "titulo", direccion: "desc" }, "titulo")).toEqual({
      campo: "titulo",
      direccion: "asc",
    });
  });
});

describe("ariaSort", () => {
  it.each([
    ["titulo", "ascending"],
    ["estado", "none"],
    ["actualizado", "none"],
  ] as const)("la columna %s se anuncia como %s", (campo, esperado) => {
    expect(ariaSort({ campo: "titulo", direccion: "asc" }, campo)).toBe(esperado);
  });

  it("descendente se anuncia como descending", () => {
    expect(ariaSort({ campo: "estado", direccion: "desc" }, "estado")).toBe("descending");
  });
});

describe("enlaceDeOrden", () => {
  it("CONSERVA los filtros al reordenar", () => {
    // El fallo clásico de esta pantalla: filtras «Viendo», ordenas por título y
    // vuelves a tener las 83 filas.
    const enlace = enlaceDeOrden(
      "/app/lista",
      { estado: ["VISTO", "VIENDO"], favorito: "1" },
      { campo: "titulo", direccion: "asc" },
    );

    expect(enlace).toBe("/app/lista?estado=VISTO&estado=VIENDO&favorito=1&orden=titulo&dir=asc");
  });

  it("reemplaza el orden anterior en vez de acumularlo", () => {
    const enlace = enlaceDeOrden(
      "/app/lista",
      { orden: "estado", dir: "desc" },
      { campo: "titulo", direccion: "asc" },
    );

    expect(enlace).toBe("/app/lista?orden=titulo&dir=asc");
  });
});
