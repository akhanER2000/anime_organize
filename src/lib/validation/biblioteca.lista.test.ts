import { describe, expect, it } from "vitest";

import {
  contarFavoritos,
  contarPorEstado,
  filtrarFilas,
  hayFiltro,
  parsearFiltros,
} from "@/lib/validation/biblioteca";

import type { FilaFiltrable } from "@/lib/validation/biblioteca";
import type { ParametrosCrudos } from "@/lib/validation/biblioteca";

/**
 * LOS FILTROS DE LA LISTA — los mismos que escribe `BarraFiltros` en la URL.
 *
 * Si esta lectura y la escritura de `BarraFiltros` dejan de coincidir, pasar de
 * la rejilla a la lista pierde el filtro en silencio: la URL lo lleva y la
 * pantalla lo ignora.
 */

const fila = (titulo: string, estado: FilaFiltrable["estado"], favorito = false) => ({
  titulo,
  estado,
  esFavorito: favorito,
});

const VAULT = [
  fila("Mushishi", "VISTO"),
  fila("Made in Abyss", "VISTO", true),
  fila("Sousou no Frieren", "VIENDO"),
  fila("Monster", "EN_ESPERA", true),
];

const titulos = (filas: readonly { titulo: string }[]) => filas.map((f) => f.titulo);

describe("leerFiltros", () => {
  it("sin parámetros no filtra nada", () => {
    expect(parsearFiltros({})).toEqual({ estados: [], soloFavoritos: false });
  });

  it("las facetas SE SUMAN: ?estado=VISTO&estado=VIENDO es «visto O viendo»", () => {
    expect(parsearFiltros({ estado: ["VISTO", "VIENDO"] }).estados).toEqual(["VISTO", "VIENDO"]);
  });

  it("un solo estado también vale", () => {
    expect(parsearFiltros({ estado: "ABANDONADO" }).estados).toEqual(["ABANDONADO"]);
  });

  it("un estado INVENTADO se descarta y los válidos siguen valiendo", () => {
    expect(parsearFiltros({ estado: ["VISTO", "BORRAME"] }).estados).toEqual(["VISTO"]);
  });

  it("el mismo estado repetido no cuenta dos veces", () => {
    expect(parsearFiltros({ estado: ["VISTO", "VISTO"] }).estados).toEqual(["VISTO"]);
  });

  it.each<[string, ParametrosCrudos, boolean]>([
    ["favorito=1", { favorito: "1" }, true],
    ["favorito=0", { favorito: "0" }, false],
    ["favorito=si", { favorito: "si" }, false],
    ["sin favorito", {}, false],
  ])("%s → soloFavoritos = %s", (_caso, parametros, esperado) => {
    expect(parsearFiltros(parametros).soloFavoritos).toBe(esperado);
  });
});

describe("filtrar", () => {
  it("sin filtros devuelve todo", () => {
    expect(titulos(filtrarFilas(VAULT, { estados: [], soloFavoritos: false }))).toEqual(
      titulos(VAULT),
    );
  });

  it("por un estado deja solo ese estado", () => {
    expect(titulos(filtrarFilas(VAULT, { estados: ["VIENDO"], soloFavoritos: false }))).toEqual([
      "Sousou no Frieren",
    ]);
  });

  it("por varios estados deja la UNIÓN", () => {
    expect(
      titulos(filtrarFilas(VAULT, { estados: ["VIENDO", "EN_ESPERA"], soloFavoritos: false })),
    ).toEqual(["Sousou no Frieren", "Monster"]);
  });

  it("favoritos y estado se aplican a la vez (Y, no O)", () => {
    expect(titulos(filtrarFilas(VAULT, { estados: ["VISTO"], soloFavoritos: true }))).toEqual([
      "Made in Abyss",
    ]);
  });

  it("un filtro sin coincidencias devuelve vacío, que es el estado «sin resultados»", () => {
    // §6, fila «Fila de tabla», columna vacío: «sin resultados» centrado.
    expect(filtrarFilas(VAULT, { estados: ["ABANDONADO"], soloFavoritos: false })).toEqual([]);
  });

  it("conserva el orden de entrada", () => {
    // Filtrar no es reordenar: el orden lo decide `ordenar()`, y si `filtrar`
    // lo tocara, el orden de la URL dejaría de mandar.
    expect(
      titulos(filtrarFilas(VAULT, { estados: ["VISTO", "EN_ESPERA"], soloFavoritos: false })),
    ).toEqual(["Mushishi", "Made in Abyss", "Monster"]);
  });
});

describe("recuentos", () => {
  it("cuenta por estado sobre TODO el vault", () => {
    // ── LOS CINCO ESTADOS SIEMPRE, AUNQUE VALGAN CERO ───────────────────
    //
    // Este test decía `{ VISTO: 2, VIENDO: 1, EN_ESPERA: 1 }` porque la
    // versión de la lista devolvía un `Partial<Record<Estado, number>>` y se
    // saltaba los estados sin filas. Al unificar los dos parseadores ganó el
    // `Record` completo, y no por gusto: **es el que deja de compilar si
    // mañana se añade un sexto estado a `ESTADOS`**, y eso impide que nazca
    // un chip con un recuento fantasma.
    //
    // Para la interfaz no cambia nada: el chip pinta `recuentos[estado] ?? 0`.
    expect(contarPorEstado(VAULT)).toEqual({
      VISTO: 2,
      VIENDO: 1,
      EN_ESPERA: 1,
      ABANDONADO: 0,
      PENDIENTE: 0,
    });
  });

  it("un estado sin filas vale 0, y así el chip no puede quedarse sin recuento", () => {
    expect(contarPorEstado(VAULT).ABANDONADO).toBe(0);
  });

  it("cuenta los favoritos", () => {
    expect(contarFavoritos(VAULT)).toBe(2);
  });

  it("un vault vacío cuenta cero, no rompe", () => {
    expect(contarPorEstado([])).toEqual({
      VISTO: 0,
      VIENDO: 0,
      EN_ESPERA: 0,
      ABANDONADO: 0,
      PENDIENTE: 0,
    });
    expect(contarFavoritos([])).toBe(0);
  });
});

describe("hayFiltro", () => {
  it.each<[string, Parameters<typeof hayFiltro>[0], boolean]>([
    ["sin nada", { estados: [], soloFavoritos: false }, false],
    ["con un estado", { estados: ["VISTO"], soloFavoritos: false }, true],
    ["solo favoritos", { estados: [], soloFavoritos: true }, true],
  ])("%s → %s", (_caso, filtros, esperado) => {
    // Distingue «tu vault está vacío» de «este filtro no devuelve nada», que son
    // dos mensajes distintos y dos situaciones distintas.
    expect(hayFiltro(filtros)).toBe(esperado);
  });
});
