import { describe, expect, it } from "vitest";

import {
  contarFavoritos,
  contarPorEstado,
  filtrarFilas,
  hayFiltro,
  parsearFiltros,
} from "@/lib/validation/biblioteca";

import { textoContador } from "@/lib/ui/texto";

import { describirFiltros } from "./filtros";

import type { FilaFiltrable as AnimeFiltrable } from "@/lib/validation/biblioteca";

/**
 * Lo que se prueba aquí es lo que `testing.md` §Nivel 2 pide explícitamente:
 * «Esquemas Zod de filtros: `searchParams` con basura no rompe la página».
 *
 * La rejilla, las clases de Tailwind y el render no se testean (§Nivel 3): para
 * eso está `e2e/biblioteca.spec.ts`, que la usa con un navegador de verdad.
 */

const vault: AnimeFiltrable[] = [
  { estado: "VISTO", esFavorito: true },
  { estado: "VISTO", esFavorito: false },
  { estado: "VIENDO", esFavorito: true },
  { estado: "EN_ESPERA", esFavorito: false },
  { estado: "ABANDONADO", esFavorito: false },
];

describe("parsearFiltros", () => {
  it("sin parámetros no filtra nada", () => {
    const filtros = parsearFiltros({});

    expect(filtros).toEqual({ estados: [], soloFavoritos: false });
    expect(hayFiltro(filtros)).toBe(false);
  });

  it("lee un estado suelto", () => {
    const filtros = parsearFiltros({ estado: "VISTO" });

    expect(filtros.estados).toEqual(["VISTO"]);
  });

  it("acumula las facetas repetidas (?estado=VISTO&estado=VIENDO)", () => {
    const filtros = parsearFiltros({ estado: ["VISTO", "VIENDO"] });

    expect(filtros.estados).toEqual(["VISTO", "VIENDO"]);
  });

  it("devuelve los estados en el orden canónico, venga como venga la URL", () => {
    const alReves = parsearFiltros({ estado: ["ABANDONADO", "VISTO"] });

    // El orden es el de `ESTADOS`, no el de la URL: si no, el mismo filtro se
    // describiría de dos formas distintas en el vacío sin resultados.
    expect(alReves.estados).toEqual(["VISTO", "ABANDONADO"]);
  });

  it("descarta un estado repetido sin duplicarlo", () => {
    const filtros = parsearFiltros({ estado: ["VISTO", "VISTO"] });

    expect(filtros.estados).toEqual(["VISTO"]);
  });

  it("IGNORA un estado que no existe en el dominio, y no rompe", () => {
    const filtros = parsearFiltros({ estado: ["VISTO", "BASURA", "visto", "DROP TABLE anime"] });

    // Solo el literal exacto entra. Ni minúsculas, ni invenciones.
    expect(filtros.estados).toEqual(["VISTO"]);
  });

  it("con TODO basura devuelve el filtro vacío en vez de lanzar", () => {
    const filtros = parsearFiltros({ estado: "<script>alert(1)</script>", favorito: "sí" });

    expect(filtros).toEqual({ estados: [], soloFavoritos: false });
  });

  it("descarta parámetros que la pantalla no conoce", () => {
    const filtros = parsearFiltros({ utm_source: "boletin", orden: "titulo", cursor: "abc" });

    expect(filtros).toEqual({ estados: [], soloFavoritos: false });
  });

  it("favorito=1 activa; cualquier otro valor NO", () => {
    expect(parsearFiltros({ favorito: "1" }).soloFavoritos).toBe(true);

    for (const valor of ["0", "true", "sí", "", "2"]) {
      expect(parsearFiltros({ favorito: valor }).soloFavoritos, valor).toBe(false);
    }
  });

  it("no lanza con entradas que no son un objeto", () => {
    for (const entrada of [null, undefined, "cadena", 42, []]) {
      expect(parsearFiltros(entrada)).toEqual({ estados: [], soloFavoritos: false });
    }
  });

  it("un estado válido sobrevive aunque `favorito` sea basura", () => {
    const filtros = parsearFiltros({ estado: "VIENDO", favorito: "quizá" });

    expect(filtros.estados).toEqual(["VIENDO"]);
    expect(filtros.soloFavoritos).toBe(false);
  });
});

describe("filtrarAnimes", () => {
  it("sin filtro devuelve el vault entero", () => {
    expect(filtrarFilas(vault, parsearFiltros({}))).toHaveLength(5);
  });

  it("un estado deja solo ese estado", () => {
    const visibles = filtrarFilas(vault, parsearFiltros({ estado: "VISTO" }));

    expect(visibles).toHaveLength(2);
  });

  it("dos estados se suman con O", () => {
    const visibles = filtrarFilas(vault, parsearFiltros({ estado: ["VISTO", "VIENDO"] }));

    expect(visibles).toHaveLength(3);
  });

  it("estado y favorito se cruzan con Y", () => {
    const visibles = filtrarFilas(vault, parsearFiltros({ estado: "VISTO", favorito: "1" }));

    expect(visibles).toEqual([{ estado: "VISTO", esFavorito: true }]);
  });

  it("un filtro sin coincidencias devuelve la lista vacía, no el vault entero", () => {
    // Es el caso que distingue el vacío «sin resultados» del vacío «vault sin
    // animes». Si aquí se devolviera todo, la pantalla mentiría.
    const visibles = filtrarFilas(vault, parsearFiltros({ estado: "PENDIENTE" }));

    expect(visibles).toEqual([]);
  });

  it("no modifica la lista original", () => {
    filtrarFilas(vault, parsearFiltros({ estado: "VISTO" }));

    expect(vault).toHaveLength(5);
  });
});

describe("recuentos", () => {
  it("cuenta cada estado del vault entero", () => {
    expect(contarPorEstado(vault)).toEqual({
      VISTO: 2,
      VIENDO: 1,
      EN_ESPERA: 1,
      ABANDONADO: 1,
      PENDIENTE: 0,
    });
  });

  it("un estado sin animes cuenta 0, no desaparece", () => {
    // El chip tiene que existir con su «0» apagado: si desapareciera, el filtro
    // dejaría de ser alcanzable justo cuando está vacío.
    expect(contarPorEstado([]).PENDIENTE).toBe(0);
  });

  it("cuenta los favoritos", () => {
    expect(contarFavoritos(vault)).toBe(2);
    expect(contarFavoritos([])).toBe(0);
  });
});

describe("textoContador", () => {
  it("dice cuántos se ven de cuántos hay", () => {
    expect(textoContador(12, 83)).toBe("12 de 83 series");
  });

  it("con un solo anime concuerda en singular", () => {
    expect(textoContador(1, 1)).toBe("1 de 1 serie");
  });

  it("con cero visibles sigue diciendo el total", () => {
    expect(textoContador(0, 83)).toBe("0 de 83 series");
  });
});

describe("describirFiltros", () => {
  it("sin filtro no hay nada que describir", () => {
    expect(describirFiltros(parsearFiltros({}))).toBeNull();
  });

  it("un estado se describe con su etiqueta visible", () => {
    expect(describirFiltros(parsearFiltros({ estado: "EN_ESPERA" }))).toBe("En espera");
  });

  it("varios estados se unen con «o»", () => {
    expect(describirFiltros(parsearFiltros({ estado: ["VISTO", "VIENDO"] }))).toBe(
      "Visto o Viendo",
    );
  });

  it("los favoritos se añaden como otra faceta", () => {
    expect(describirFiltros(parsearFiltros({ estado: "VISTO", favorito: "1" }))).toBe(
      "Visto · Favoritos",
    );
  });

  it("solo favoritos se describe solo", () => {
    expect(describirFiltros(parsearFiltros({ favorito: "1" }))).toBe("Favoritos");
  });
});
