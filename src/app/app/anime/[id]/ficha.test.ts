import { describe, expect, it } from "vitest";

import {
  esIdentificadorDeAnime,
  metadatosDeFicha,
  titulosAlternativos,
  urlDePortada,
} from "./ficha";

const SIN_METADATOS = {
  format: null,
  year: null,
  totalEpisodes: null,
  totalSeasons: null,
  score: null,
  anilistId: null,
} as const;

describe("esIdentificadorDeAnime", () => {
  it("acepta un uuid", () => {
    expect(esIdentificadorDeAnime("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rechaza lo que no es un uuid, para que la base no vea nunca esa cadena", () => {
    // Sin este filtro, Postgres responde «invalid input syntax for type uuid» y
    // eso sube como 500 en vez del 404 usable que pide `security.md` §1.
    for (const basura of [
      "hola",
      "",
      "   ",
      "550e8400-e29b-41d4-a716",
      "550e8400e29b41d4a716446655440000",
      "550e8400-e29b-41d4-a716-44665544000g",
      "'; DROP TABLE anime; --",
      "../../etc/passwd",
    ]) {
      expect(esIdentificadorDeAnime(basura), `debería rechazar «${basura}»`).toBe(false);
    }
  });
});

describe("urlDePortada", () => {
  it("apunta SIEMPRE a /api/covers, nunca al dominio original", () => {
    const url = urlDePortada("550e8400-e29b-41d4-a716-446655440000", null);

    expect(url).toBe("/api/covers/550e8400-e29b-41d4-a716-446655440000");
  });

  it("añade el checksum como ?v= para que un cambio de portada se vea", () => {
    // La respuesta es `immutable` durante un año: sin el `?v=`, cambiar la
    // imagen no cambiaría nada en el navegador del usuario.
    const url = urlDePortada("550e8400-e29b-41d4-a716-446655440000", "abc123");

    expect(url).toBe("/api/covers/550e8400-e29b-41d4-a716-446655440000?v=abc123");
  });

  it("escapa el checksum en vez de pegarlo a la URL", () => {
    const url = urlDePortada("550e8400-e29b-41d4-a716-446655440000", "a b&c=d");

    expect(url).toBe("/api/covers/550e8400-e29b-41d4-a716-446655440000?v=a%20b%26c%3Dd");
  });
});

describe("titulosAlternativos", () => {
  it("devuelve nativo, inglés y sinónimos en ese orden", () => {
    const titulos = titulosAlternativos({
      title: "Sousou no Frieren",
      titleNative: "葬送のフリーレン",
      titleEnglish: "Frieren: Beyond Journey's End",
      synonyms: ["Frieren y el viaje hacia el más allá"],
    });

    expect(titulos).toEqual([
      "葬送のフリーレン",
      "Frieren: Beyond Journey's End",
      "Frieren y el viaje hacia el más allá",
    ]);
  });

  it("no repite el título principal aunque venga también como inglés", () => {
    const titulos = titulosAlternativos({
      title: "Death Note",
      titleNative: null,
      titleEnglish: "death note",
      synonyms: null,
    });

    expect(titulos).toEqual([]);
  });

  it("no repite un alternativo que aparece dos veces", () => {
    const titulos = titulosAlternativos({
      title: "Fate/Zero",
      titleNative: "Fate/Zero",
      titleEnglish: "Fate Zero",
      synonyms: ["fate  zero"],
    });

    expect(titulos).toEqual(["Fate Zero"]);
  });

  it("corta en tres líneas, que es lo que dibuja el artboard", () => {
    const titulos = titulosAlternativos({
      title: "Uno",
      titleNative: "Dos",
      titleEnglish: "Tres",
      synonyms: ["Cuatro", "Cinco", "Seis"],
    });

    expect(titulos).toEqual(["Dos", "Tres", "Cuatro"]);
  });

  it("descarta cadenas vacías y de solo espacios", () => {
    const titulos = titulosAlternativos({
      title: "Uno",
      titleNative: "",
      titleEnglish: "   ",
      synonyms: ["  Dos  "],
    });

    expect(titulos).toEqual(["Dos"]);
  });

  it("un anime sin alternativos devuelve la lista vacía, no un hueco falso", () => {
    // Es el caso REAL de los 83 animes de hoy: el enriquecimiento es otra fase.
    const titulos = titulosAlternativos({
      title: "Higurashi no Naku Koro Ni",
      titleNative: null,
      titleEnglish: null,
      synonyms: null,
    });

    expect(titulos).toEqual([]);
  });
});

describe("metadatosDeFicha", () => {
  it("no inventa ni una fila cuando no se sabe nada", () => {
    // El estado de hoy: el seed crea `{ titulo, estado }` y nada más. Una fila
    // «Estudio —» ocuparía sitio para decir que no sabemos nada, y `estudio` ni
    // siquiera es una columna del esquema.
    const filas = metadatosDeFicha(SIN_METADATOS);

    expect(filas).toEqual([]);
  });

  it("compone el formato con el número de episodios", () => {
    const filas = metadatosDeFicha({ ...SIN_METADATOS, format: "TV", totalEpisodes: 28 });

    expect(filas).toEqual([{ etiqueta: "Formato", valor: "Serie · 28 ep" }]);
  });

  it("enseña el formato solo, si no se conocen los episodios", () => {
    const filas = metadatosDeFicha({ ...SIN_METADATOS, format: "MOVIE" });

    expect(filas).toEqual([{ etiqueta: "Formato", valor: "Película" }]);
  });

  it("ignora un formato que no está en el dominio cerrado", () => {
    // La columna es `text` + CHECK: la base lo impediría, pero el tipo de
    // Drizzle es `string` y aquí no se confía en él.
    const filas = metadatosDeFicha({ ...SIN_METADATOS, format: "PELICULA_DE_LAS_BUENAS" });

    expect(filas).toEqual([]);
  });

  it("omite un total de episodios de 0 en vez de escribir «0 ep»", () => {
    const filas = metadatosDeFicha({ ...SIN_METADATOS, format: "TV", totalEpisodes: 0 });

    expect(filas).toEqual([{ etiqueta: "Formato", valor: "Serie" }]);
  });

  it("lista año, temporadas, puntuación y AniList cuando existen", () => {
    const filas = metadatosDeFicha({
      format: null,
      year: 2023,
      totalEpisodes: null,
      totalSeasons: 2,
      score: "8.5",
      anilistId: 154_587,
    });

    expect(filas).toEqual([
      { etiqueta: "Emisión", valor: "2023" },
      { etiqueta: "Temporadas", valor: "2" },
      { etiqueta: "Puntuación", valor: "8.5 / 10" },
      // lint-tokens-ok: es el id de AniList del artboard, no un color hex
      { etiqueta: "AniList", valor: "#154587" },
    ]);
  });
});
