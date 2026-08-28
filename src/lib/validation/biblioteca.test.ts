import { describe, expect, it } from "vitest";

import {
  contarCoincidentes,
  contarFavoritos,
  contarPorEstado,
  filtrarFilas,
  hayFiltro,
  parsearFiltros,
  urlSinFacetas,
} from "@/lib/validation/biblioteca";

import { describirFiltros, textoContador } from "@/lib/ui/texto";

import type { FilaFiltrable as AnimeFiltrable } from "@/lib/validation/biblioteca";

/**
 * Lo que se prueba aquí es lo que `testing.md` §Nivel 2 pide explícitamente:
 * «Esquemas Zod de filtros: `searchParams` con basura no rompe la página».
 *
 * La rejilla, las clases de Tailwind y el render no se testean (§Nivel 3): para
 * eso está `e2e/biblioteca.spec.ts`, que la usa con un navegador de verdad.
 *
 * Este fichero vivía en `app/app/(biblioteca)/filtros.test.ts`, junto a una
 * pantalla. Lo que prueba lo usan DOS, así que se mudó con su código: un test
 * guardado en la carpeta de una pantalla es una invitación a que la otra
 * escriba el suyo.
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `urlSinFacetas` — LAS DOS FORMAS DE QUITAR EL FILTRO, AHORA UNA.
 *
 * El chip «Todos» borraba las dos facetas y conservaba el resto; la salida del
 * vacío era un `/app` a pelo que tiraba la query entera. Los dos casos que lo
 * distinguen son «conserva el orden» y «acepta las dos formas del parámetro»:
 * si alguien volviera a escribir el `href` a mano, el primero se pone rojo.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Devolviendo `ruta` a secas (el comportamiento viejo del vacío) → 4 rojos.
 *   Borrando también `orden` → 3 rojos. Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("urlSinFacetas", () => {
  it("sin ningún parámetro devuelve la ruta limpia, sin «?» colgando", () => {
    expect(urlSinFacetas("/app", new URLSearchParams())).toBe("/app");
    expect(urlSinFacetas("/app/lista", {})).toBe("/app/lista");
  });

  it("quita las dos facetas y NADA más", () => {
    const params = new URLSearchParams("estado=VISTO&favorito=1&orden=titulo&dir=asc");

    // El orden sobrevive: es otra preferencia y no se cae con el filtro.
    expect(urlSinFacetas("/app/lista", params)).toBe("/app/lista?orden=titulo&dir=asc");
  });

  it("quitar el ÚNICO parámetro deja la ruta limpia", () => {
    expect(urlSinFacetas("/app", new URLSearchParams("estado=VISTO"))).toBe("/app");
  });

  it("acepta el objeto del servidor igual que el URLSearchParams del cliente", () => {
    // Los dos controles viven a lados distintos de la frontera y tienen que
    // producir EXACTAMENTE la misma URL, o vuelve la divergencia.
    const delCliente = urlSinFacetas(
      "/app/lista",
      new URLSearchParams("estado=VISTO&orden=titulo"),
    );
    const delServidor = urlSinFacetas("/app/lista", { estado: "VISTO", orden: "titulo" });

    expect(delServidor).toBe(delCliente);
    expect(delServidor).toBe("/app/lista?orden=titulo");
  });

  it("una faceta repetida en el objeto se conserva repetida", () => {
    // `?utm=a&utm=b` no es lo mismo que `?utm=a,b`. Colapsarlo cambiaría lo que
    // la URL significa para quien la lea después.
    expect(urlSinFacetas("/app", { utm: ["a", "b"], estado: ["VISTO", "VIENDO"] })).toBe(
      "/app?utm=a&utm=b",
    );
  });

  it("no arrastra un parámetro con valor ausente", () => {
    expect(urlSinFacetas("/app", { orden: "titulo", dir: undefined })).toBe("/app?orden=titulo");
  });
});

/**
 * `contarCoincidentes` — el contador «N de M», sumado sobre agregados.
 *
 * Lo que prueba el test de integración es que la MATRIZ sale bien de Postgres
 * (`recuentos.integracion.test.ts`). Lo que se prueba aquí es la suma: qué
 * celdas entran con cada combinación de facetas.
 */
describe("contarCoincidentes", () => {
  const matriz = [
    { estado: "VISTO", favorito: true, n: 2 },
    { estado: "VISTO", favorito: false, n: 1 },
    { estado: "VIENDO", favorito: true, n: 1 },
    { estado: "EN_ESPERA", favorito: false, n: 2 },
  ] as const;

  it("sin filtro suma todas las celdas", () => {
    expect(contarCoincidentes(matriz, parsearFiltros({}))).toBe(6);
  });

  it("un estado suma sus dos celdas, favorita y no favorita", () => {
    expect(contarCoincidentes(matriz, parsearFiltros({ estado: "VISTO" }))).toBe(3);
  });

  it("los favoritos cruzan con el estado, no lo sustituyen", () => {
    // Éste es el caso que un `porEstado` plano no sabe responder, y por el que
    // la matriz existe: VISTO **y** favorito son 2, no 3 ni 4.
    expect(contarCoincidentes(matriz, parsearFiltros({ estado: "VISTO", favorito: "1" }))).toBe(2);
  });

  it("varios estados acumulan", () => {
    expect(contarCoincidentes(matriz, parsearFiltros({ estado: ["VISTO", "VIENDO"] }))).toBe(4);
  });

  it("un estado sin ninguna celda cuenta 0, no falla", () => {
    expect(contarCoincidentes(matriz, parsearFiltros({ estado: "PENDIENTE" }))).toBe(0);
  });

  it("una matriz vacía cuenta 0 para cualquier filtro", () => {
    expect(contarCoincidentes([], parsearFiltros({ estado: "VISTO" }))).toBe(0);
  });
});
