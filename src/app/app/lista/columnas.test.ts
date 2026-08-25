import { describe, expect, it } from "vitest";

import { BREAKPOINTS, COLUMNAS, claseDeVisibilidad, columnasVisibles } from "./columnas";

import type { IdColumna } from "./columnas";

/**
 * EL COLAPSO DE COLUMNAS POR ANCHO — DESIGN-SPEC §3.
 *
 * Lo que se comprueba aquí es la regla, no el CSS: que a 1024 px la tabla pierde
 * Géneros, que a 768 pierde también Actualizado, y que a 390 no hay tabla.
 *
 * El último bloque es el importante: comprueba que el MODELO
 * (`columnasVisibles`) y su TRADUCCIÓN a Tailwind (`claseDeVisibilidad`) dicen
 * lo mismo. Son dos representaciones de la misma regla y podrían separarse en
 * silencio: la clase se escribe en el JSX y nadie la ejecuta nunca en un test.
 */

const ids = (ancho: number): IdColumna[] => columnasVisibles(ancho).map((c) => c.id);

describe("columnasVisibles", () => {
  it("a 1440 px (desktop) enseña las ocho columnas de §04", () => {
    expect(ids(BREAKPOINTS.desktop)).toEqual([
      "seleccion",
      "portada",
      "titulo",
      "estado",
      "progreso",
      "generos",
      "actualizado",
      "acciones",
    ]);
  });

  it("a 1024 px (laptop) oculta Géneros", () => {
    expect(ids(BREAKPOINTS.laptop)).not.toContain("generos");
    expect(ids(BREAKPOINTS.laptop)).toContain("actualizado");
    expect(ids(BREAKPOINTS.laptop)).toHaveLength(7);
  });

  it("a 768 px (tablet) oculta Géneros y Actualizado", () => {
    expect(ids(BREAKPOINTS.tablet)).toEqual([
      "seleccion",
      "portada",
      "titulo",
      "estado",
      "progreso",
      "acciones",
    ]);
  });

  it("a 390 px (móvil) NO hay tabla: ninguna columna sobrevive", () => {
    // §3: «Vista lista · móvil → se sustituye por cards». La tabla entera
    // desaparece, no se estrecha.
    expect(ids(BREAKPOINTS.movil)).toEqual([]);
  });

  it("a 767 px, un píxel por debajo de tablet, sigue sin haber tabla", () => {
    expect(ids(BREAKPOINTS.tablet - 1)).toEqual([]);
  });

  it("a 1439 px, un píxel por debajo de desktop, Géneros sigue oculta", () => {
    expect(ids(BREAKPOINTS.desktop - 1)).not.toContain("generos");
  });

  it("cada columna aparece EXACTAMENTE en su breakpoint, ni antes ni después", () => {
    const bordes = COLUMNAS.map((columna) => ({
      id: columna.id,
      justo: columnasVisibles(BREAKPOINTS[columna.desde]).includes(columna),
      unPixelAntes: columnasVisibles(BREAKPOINTS[columna.desde] - 1).includes(columna),
    }));

    expect(bordes.filter((b) => !b.justo)).toEqual([]);
    expect(bordes.filter((b) => b.unPixelAntes)).toEqual([]);
  });
});

describe("claseDeVisibilidad", () => {
  it.each([
    ["generos", "hidden desktop:table-cell"],
    ["actualizado", "hidden laptop:table-cell"],
    ["titulo", ""],
  ] as const)("la columna %s se traduce a «%s»", (id, esperada) => {
    const columna = COLUMNAS.find((c) => c.id === id);

    expect(columna?.id).toBe(id);
    expect(columna === undefined ? null : claseDeVisibilidad(columna)).toBe(esperada);
  });

  it("la clase de Tailwind y el modelo dicen LO MISMO para todas las columnas", () => {
    // Si alguien cambia `desde` y se olvida de la clase (o al revés), esto se
    // pone rojo. Es la única forma de cazar que las dos se separen: el CSS no
    // se ejecuta en un test de unidad.
    const traduccion: Record<string, string> = {
      tablet: "",
      laptop: "hidden laptop:table-cell",
      desktop: "hidden desktop:table-cell",
    };

    const desalineadas = COLUMNAS.filter(
      (columna) => claseDeVisibilidad(columna) !== traduccion[columna.desde],
    );

    expect(desalineadas).toEqual([]);
  });

  it("ninguna clase usa los breakpoints DESACTIVADOS de Tailwind", () => {
    // `sm:` `md:` `lg:` `xl:` compilan a CERO en este proyecto
    // (`--breakpoint-*: initial`). Una clase con ellos no oculta nada y no avisa.
    const prohibidos = COLUMNAS.map(claseDeVisibilidad).filter((clase) =>
      /\b(sm|md|lg|xl|2xl):/.test(clase),
    );

    expect(prohibidos).toEqual([]);
  });
});

describe("las cabeceras", () => {
  it("todas tienen etiqueta, incluso las que no se pintan", () => {
    // DESIGN-SPEC §7: navegar por celdas anuncia la cabecera. Una columna sin
    // etiqueta se anuncia como «columna 2», que no dice nada.
    expect(COLUMNAS.filter((c) => c.etiqueta.trim() === "")).toEqual([]);
  });

  it("solo la casilla y la miniatura llevan la etiqueta oculta", () => {
    expect(COLUMNAS.filter((c) => c.etiquetaOculta).map((c) => c.id)).toEqual([
      "seleccion",
      "portada",
    ]);
  });
});
