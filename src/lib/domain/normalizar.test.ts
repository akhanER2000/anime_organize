import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizarParaBusqueda, normalizarTitulo } from "./normalizar";

describe("normalizarTitulo · limpieza básica", () => {
  it.each([
    ["pasa todo a minúsculas", "Death Note", "death note"],
    ["colapsa espacios múltiples", "Angel   Beats", "angel beats"],
    ["recorta los extremos", "   Another   ", "another"],
    ["quita acentos", "Kimi nó Ná wa", "kimi no na wa"],
    ["quita la ñ acentuada sin romper la palabra", "Añoranza", "anoranza"],
    ["colapsa ancho completo japonés", "ＫＩＭＩ　ＮＯ　ＮＡ　ＷＡ", "kimi no na wa"],
    [
      "convierte la puntuación en espacio",
      "Chuunibyou demo Koi ga Shitai!",
      "chuunibyou demo koi ga shitai",
    ],
    [
      "trata los dos puntos como separador",
      "Chi.: Chikyuu no Undou ni Tsuite",
      "chi chikyuu no undou ni tsuite",
    ],
    ["trata el apóstrofo como separador", "Dante's Inferno", "dante s inferno"],
    ["trata la barra como separador", "Fate/Zero", "fate zero"],
    [
      "conserva el punto final sin dejar residuo",
      "Itsudatte Bokura no Koi wa 10 cm Datta.",
      "itsudatte bokura no koi wa 10 cm datta",
    ],
    ["conserva la tilde de la ñ del español", "Mañana", "manana"],
  ])("%s", (_caso, entrada, esperado) => {
    expect(normalizarTitulo(entrada)).toBe(esperado);
  });
});

describe("normalizarTitulo · sufijos de temporada que SÍ se quitan", () => {
  it.each([
    ["season en inglés", "Attack on Titan Season 2"],
    ["temporada en español", "Attack on Titan temporada 2"],
    ["temp abreviado", "Attack on Titan temp 2"],
    ["ordinal inglés", "Attack on Titan 2nd Season"],
    ["ordinal inglés 3rd", "Attack on Titan 3rd Season"],
    ["s + número", "Attack on Titan S2"],
    ["final season", "Attack on Titan: The Final Season"],
    ["final season sin artículo", "Attack on Titan Final Season"],
    ["part", "Attack on Titan Part 2"],
    ["parte en español", "Attack on Titan parte 2"],
    ["cour", "Attack on Titan cour 2"],
    ["número romano", "Attack on Titan Season II"],
    ["sufijos acumulados", "Attack on Titan Season 2 Part 2"],
  ])("colapsa %s a la serie base", (_caso, entrada) => {
    expect(normalizarTitulo(entrada)).toBe("attack on titan");
  });
});

describe("normalizarTitulo · lo que NO se debe quitar", () => {
  // Estos tres bloques son los que revientan en producción. Cada uno viene de un
  // par real del vault del usuario que DEBE quedar separado.

  it("no confunde un número final del título con una temporada", () => {
    // 'White Album' y 'White Album 2' son series distintas y el usuario tiene las dos.
    expect(normalizarTitulo("White Album")).toBe("white album");
    expect(normalizarTitulo("White Album 2")).toBe("white album 2");
    expect(normalizarTitulo("White Album")).not.toBe(normalizarTitulo("White Album 2"));
  });

  it("conserva un número que forma parte del título", () => {
    expect(normalizarTitulo("Uchuu Senkan Yamato 2199")).toBe("uchuu senkan yamato 2199");
    expect(normalizarTitulo("Byousoku 5 Centimeter")).toBe("byousoku 5 centimeter");
  });

  it("conserva el contenido de los paréntesis", () => {
    // Si se descarta el año, el seed pierde uno de los tres Higurashi.
    expect(normalizarTitulo("Higurashi no Naku Koro Ni")).toBe("higurashi no naku koro ni");
    expect(normalizarTitulo("Higurashi no Naku Koro ni (2020)")).toBe(
      "higurashi no naku koro ni 2020",
    );
    expect(normalizarTitulo("Higurashi no Naku Koro ni Sotsu")).toBe(
      "higurashi no naku koro ni sotsu",
    );

    const tres = new Set([
      normalizarTitulo("Higurashi no Naku Koro Ni"),
      normalizarTitulo("Higurashi no Naku Koro ni (2020)"),
      normalizarTitulo("Higurashi no Naku Koro ni Sotsu"),
    ]);
    expect(tres.size).toBe(3);
  });

  it("conserva el título alternativo entre paréntesis", () => {
    expect(normalizarTitulo("Kokurikozaka kara (La Colina de las Amapolas)")).toBe(
      "kokurikozaka kara la colina de las amapolas",
    );
    expect(normalizarTitulo("Versailles no Bara (Movie)")).toBe("versailles no bara movie");
  });

  it("no colapsa dos obras de la misma franquicia", () => {
    expect(normalizarTitulo("Fate/Zero")).not.toBe(normalizarTitulo("Fate/stay night"));
  });

  it("no recorta un subtítulo tras los dos puntos", () => {
    expect(normalizarTitulo("Zutto Mae kara Suki deshita.: Kokuhaku Jikkou Iinkai")).toBe(
      "zutto mae kara suki deshita kokuhaku jikkou iinkai",
    );
  });

  it("no toma 'temporada N' de mitad de título como sufijo", () => {
    // Solo se recorta al FINAL de la cadena.
    expect(normalizarTitulo("Death Note (Temporada 1 & 2 )")).toBe("death note temporada 1 2");
  });

  it("no deja el título vacío aunque sea todo sufijo", () => {
    // Degenerado, pero no puede producir '' porque title_normalized es NOT NULL
    // y forma parte de un UNIQUE: dos títulos raros colisionarían en cadena vacía.
    expect(normalizarTitulo("Season 2")).not.toBe("");
  });
});

describe("normalizarTitulo · entradas degeneradas", () => {
  it.each([
    ["cadena vacía", "", ""],
    ["solo espacios", "     ", ""],
    ["solo puntuación", "!!!???", ""],
  ])("%s no revienta", (_caso, entrada, esperado) => {
    expect(normalizarTitulo(entrada)).toBe(esperado);
  });

  it("es idempotente: normalizar lo ya normalizado no cambia nada", () => {
    for (const t of [
      "Attack on Titan Season 2",
      "Higurashi no Naku Koro ni (2020)",
      "White Album 2",
    ]) {
      const una = normalizarTitulo(t);
      expect(normalizarTitulo(una)).toBe(una);
    }
  });
});

describe("normalizarParaBusqueda", () => {
  it("limpia igual que normalizarTitulo en lo básico", () => {
    expect(normalizarParaBusqueda("Kimi nó Ná wa")).toBe("kimi no na wa");
    expect(normalizarParaBusqueda("Chuunibyou demo Koi ga Shitai!")).toBe(
      "chuunibyou demo koi ga shitai",
    );
  });

  it("NO recorta los sufijos de temporada", () => {
    // Buscar "season 2" tiene que poder encontrar algo; si el buscador aplicara
    // el recorte de deduplicación, la consulta se quedaría en "attack on titan"
    // y el usuario no entendería por qué su búsqueda ignora lo que escribió.
    expect(normalizarParaBusqueda("Attack on Titan Season 2")).toBe("attack on titan season 2");
    expect(normalizarParaBusqueda("Shingeki S2")).toBe("shingeki s2");
  });

  it("difiere de normalizarTitulo justo en eso", () => {
    const t = "Attack on Titan Season 2";
    expect(normalizarTitulo(t)).toBe("attack on titan");
    expect(normalizarParaBusqueda(t)).not.toBe(normalizarTitulo(t));
  });

  it.each([
    ["cadena vacía", "", ""],
    ["solo espacios", "   ", ""],
    ["solo puntuación", "!!!", ""],
  ])("%s no revienta", (_caso, entrada, esperado) => {
    expect(normalizarParaBusqueda(entrada)).toBe(esperado);
  });
});

describe("normalizarTitulo · regresión contra el vault real", () => {
  // Este es EL test que protege los datos del usuario. Si un cambio en la
  // normalización hace colisionar dos de sus 83 animes, el seed perdería uno.
  const semilla = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../animes-seed.json", import.meta.url)), "utf-8"),
  ) as { total: number; animes: { titulo: string }[] };

  it("el fichero de semilla trae los 83 animes esperados", () => {
    expect(semilla.animes).toHaveLength(83);
    expect(semilla.total).toBe(83);
  });

  it("produce 83 títulos normalizados ÚNICOS: cero colisiones", () => {
    const porNormalizado = new Map<string, string[]>();
    for (const { titulo } of semilla.animes) {
      const clave = normalizarTitulo(titulo);
      porNormalizado.set(clave, [...(porNormalizado.get(clave) ?? []), titulo]);
    }

    const colisiones = [...porNormalizado.entries()].filter(([, ts]) => ts.length > 1);

    // El mensaje importa: si esto falla, hay que ver QUÉ colisionó.
    expect(colisiones, `colisiones detectadas: ${JSON.stringify(colisiones, null, 2)}`).toEqual([]);
    expect(porNormalizado.size).toBe(83);
  });

  it("ningún título real normaliza a cadena vacía", () => {
    const vacios = semilla.animes.filter(({ titulo }) => normalizarTitulo(titulo).length === 0);
    expect(vacios).toEqual([]);
  });
});

describe("normalizarParaBusqueda", () => {
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LA REGLA: **NO recorta sufijos de temporada.**
   *
   * `normalizarTitulo` sí los recorta, y es lo que hace funcionar la
   * deduplicación. Aplicar esa misma función al buscador haría que escribir
   * «Attack on Titan Season 2» devolviera también la temporada 1, **y que no
   * hubiera forma de encontrar solo la segunda**: el término perdería el «2»
   * antes de llegar a la consulta.
   *
   * VERIFICADO POR MUTACIÓN (2026-08-27):
   *   Haciendo que `normalizarParaBusqueda` delegue en `normalizarTitulo`
   *   → 3 rojos, los tres de sufijos. Restaurado → verde.
   * ═════════════════════════════════════════════════════════════════════════
   */
  it("CONSERVA el sufijo de temporada, al revés que normalizarTitulo", () => {
    expect(normalizarParaBusqueda("Attack on Titan Season 2")).toBe("attack on titan season 2");
    // El contraste, en el mismo test: la otra función SÍ lo recorta.
    expect(normalizarTitulo("Attack on Titan Season 2")).toBe("attack on titan");
  });

  it("conserva «temporada 2» y «S2»", () => {
    expect(normalizarParaBusqueda("Attack on Titan temporada 2")).toBe(
      "attack on titan temporada 2",
    );
    expect(normalizarParaBusqueda("Attack on Titan S2")).toBe("attack on titan s2");
  });

  it("quita acentos y baja a minúsculas", () => {
    expect(normalizarParaBusqueda("Kimi nó Ná wa")).toBe("kimi no na wa");
  });

  it("colapsa el ancho completo japonés", () => {
    expect(normalizarParaBusqueda("ＫＩＭＩ　ＮＯ　ＮＡ　ＷＡ")).toBe("kimi no na wa");
  });

  it("convierte la puntuación en espacios, igual que la otra", () => {
    // Es lo que la hace comparable con la columna `title_normalized`, que es
    // contra la que busca —y que tiene el índice trigram—.
    expect(normalizarParaBusqueda("Fate/Zero")).toBe("fate zero");
    expect(normalizarParaBusqueda("Chi.: Chikyuu")).toBe("chi chikyuu");
  });

  it("UN TÉRMINO EN JAPONÉS SE QUEDA EN VACÍO, y eso es un límite conocido", () => {
    // Descarta todo lo que no sea `[0-9a-z]`. Buscar por `title_native`
    // necesita la otra vía —`unaccent(…) ILIKE`— que `vault.buscar` usa en
    // paralelo. Se fija aquí para que nadie lo descubra creyendo que es un bug.
    expect(normalizarParaBusqueda("白い")).toBe("");
    expect(normalizarParaBusqueda("  白い   album  ")).toBe("album");
  });
});
