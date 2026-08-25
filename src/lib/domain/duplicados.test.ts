import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  decidirAlta,
  esBloqueante,
  MAXIMO_SIMILARES,
  UMBRAL_SIMILITUD,
  type Candidato,
  type ClaseVeredicto,
  type Veredicto,
} from "./duplicados";
import { normalizarTitulo } from "./normalizar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-24) · las cinco aplicadas de una en una
 * sobre `duplicados.ts`, ejecutadas, y restauradas:
 *
 *   1. quitar la comprobación (a) exacta …………………… 7 en rojo de 48
 *   2. quitar el corte `modo === "lote"` de la fase (c) … 7 en rojo de 48
 *   3. cambiar `similitud > UMBRAL` por `>=` …………………… 1 en rojo de 48
 *   4. quitar el `.slice(0, MAXIMO_SIMILARES)` ………………… 1 en rojo de 48
 *   5. mover el umbral de 0.55 a 0.56 ………………………………… 4 en rojo de 49
 *
 *   Restaurado: pasan las 49.
 *
 * La número 2 es la que importa: es la que se comería tres animes del vault
 * real. Si alguien la introduce, este fichero se pone rojo señalando por
 * nombre a los Higurashi y a los White Album.
 *
 * La número 3 la tumba un solo test —el del umbral exacto— y es a propósito:
 * es el único punto donde `>` y `>=` se distinguen.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Utilidades de montaje. Aquí no hay lógica de decisión: solo arrange.
// ---------------------------------------------------------------------------

const UUID_CUALQUIERA = "11111111-1111-4111-8111-111111111111";

/** Construye un candidato escribiendo solo los campos que mira cada caso. */
function candidato(parcial: Partial<Candidato> & Pick<Candidato, "tituloNormalizado">): Candidato {
  return {
    id: parcial.id ?? UUID_CUALQUIERA,
    titulo: parcial.titulo ?? parcial.tituloNormalizado,
    tituloNormalizado: parcial.tituloNormalizado,
    anilistId: parcial.anilistId ?? null,
    similitud: parcial.similitud ?? 0,
  };
}

/** Convierte títulos reales en el vault que devolvería la consulta trigram. */
function vaultCon(titulos: readonly string[], similitud: number): Candidato[] {
  return titulos.map((titulo, indice) =>
    candidato({
      id: `2222${indice}222-2222-4222-8222-222222222222`,
      titulo,
      tituloNormalizado: normalizarTitulo(titulo),
      similitud,
    }),
  );
}

/** Los títulos que el veredicto propone al usuario, en el orden en que llegan. */
function titulosSimilares(veredicto: Veredicto): string[] {
  return veredicto.clase === "SIMILARES" ? veredicto.candidatos.map((c) => c.titulo) : [];
}

// ---------------------------------------------------------------------------
// (a) Coincidencia exacta sobre `title_normalized`
// ---------------------------------------------------------------------------

describe("decidirAlta · (a) coincidencia exacta sobre title_normalized", () => {
  it("bloquea cuando el título normalizado ya está en el vault", () => {
    const vault = [candidato({ tituloNormalizado: "death note", titulo: "Death Note" })];

    const veredicto = decidirAlta({ titulo: "Death Note", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("DUPLICADO_EXACTO");
  });

  it("normaliza la entrada antes de comparar: mayúsculas, acentos y puntuación no salvan", () => {
    const vault = [candidato({ tituloNormalizado: "kimi no na wa", titulo: "Kimi no Na wa" })];

    const veredicto = decidirAlta(
      { titulo: "  ¡KIMI NÓ NÁ WA!  ", anilistId: null },
      vault,
      "interactivo",
    );

    expect(veredicto.clase).toBe("DUPLICADO_EXACTO");
  });

  it("bloquea aunque el sufijo de temporada esté escrito de otra forma", () => {
    // `normalizarTitulo` ya colapsa los cinco sufijos a la serie base; la
    // deduplicación hereda ese trabajo en vez de repetirlo por su cuenta.
    const vault = [
      candidato({ tituloNormalizado: "attack on titan", titulo: "Attack on Titan Season 2" }),
    ];

    const veredicto = decidirAlta(
      { titulo: "Attack on Titan S2", anilistId: null },
      vault,
      "interactivo",
    );

    expect(veredicto.clase).toBe("DUPLICADO_EXACTO");
  });

  it("devuelve el existente para poder enlazar a su ficha", () => {
    // La respuesta ANIME_DUPLICADO lleva «Ya tienes este anime» + enlace a la
    // ficha: sin el id del existente, la interfaz no puede pintar ese enlace.
    const yaLoTengo = candidato({
      id: "33333333-3333-4333-8333-333333333333",
      titulo: "Death Note",
      tituloNormalizado: "death note",
    });

    const veredicto = decidirAlta(
      { titulo: "death note", anilistId: null },
      [yaLoTengo],
      "interactivo",
    );

    expect(veredicto).toEqual({ clase: "DUPLICADO_EXACTO", existente: yaLoTengo });
  });

  it("un título distinto no es un duplicado exacto", () => {
    const vault = [candidato({ tituloNormalizado: "death note", titulo: "Death Note" })];

    const veredicto = decidirAlta({ titulo: "Monster", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("NUEVO");
  });
});

// ---------------------------------------------------------------------------
// (b) Mismo `anilist_id`
// ---------------------------------------------------------------------------

describe("decidirAlta · (b) mismo anilist_id", () => {
  it("bloquea con títulos completamente distintos", () => {
    // Romaji contra inglés: la misma obra con dos títulos que no se parecen.
    const vault = [
      candidato({
        titulo: "Attack on Titan",
        tituloNormalizado: "attack on titan",
        anilistId: 16498,
        similitud: 0.05,
      }),
    ];

    const veredicto = decidirAlta(
      { titulo: "Shingeki no Kyojin", anilistId: 16498 },
      vault,
      "interactivo",
    );

    expect(veredicto).toEqual({ clase: "MISMO_ANILIST", existente: vault[0] });
  });

  it("dos anilistId nulos NO son el mismo anime", () => {
    // El fallo clásico: `null === null`. Dos animes sin enriquecer colapsarían
    // en uno y el segundo no se podría dar de alta nunca.
    const vault = [
      candidato({ titulo: "Death Note", tituloNormalizado: "death note", anilistId: null }),
    ];

    const veredicto = decidirAlta({ titulo: "Monster", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("NUEVO");
  });

  it("un anilistId distinto no bloquea", () => {
    const vault = [
      candidato({ titulo: "Death Note", tituloNormalizado: "death note", anilistId: 1535 }),
    ];

    const veredicto = decidirAlta({ titulo: "Monster", anilistId: 19 }, vault, "interactivo");

    expect(veredicto.clase).toBe("NUEVO");
  });

  it("una entrada sin anilistId no engancha con un candidato que sí lo tiene", () => {
    const vault = [
      candidato({ titulo: "Death Note", tituloNormalizado: "death note", anilistId: 1535 }),
    ];

    const veredicto = decidirAlta({ titulo: "Monster", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("NUEVO");
  });
});

// ---------------------------------------------------------------------------
// El orden de las tres comprobaciones
// ---------------------------------------------------------------------------

describe("decidirAlta · el ORDEN manda: la primera que dispara gana", () => {
  it("(a) gana a (b): el exacto se reporta como DUPLICADO_EXACTO", () => {
    const exacto = candidato({
      id: "44444444-4444-4444-8444-444444444444",
      titulo: "Death Note",
      tituloNormalizado: "death note",
      anilistId: 1535,
    });
    const mismoAnilist = candidato({
      id: "55555555-5555-4555-8555-555555555555",
      titulo: "Desu Nooto",
      tituloNormalizado: "desu nooto",
      anilistId: 99,
    });

    const veredicto = decidirAlta(
      { titulo: "Death Note", anilistId: 99 },
      [mismoAnilist, exacto],
      "interactivo",
    );

    expect(veredicto).toEqual({ clase: "DUPLICADO_EXACTO", existente: exacto });
  });

  it("(b) gana a (c): un similar más parecido no tapa al mismo anilist_id", () => {
    const mismoAnilist = candidato({
      id: "66666666-6666-4666-8666-666666666666",
      titulo: "Attack on Titan",
      tituloNormalizado: "attack on titan",
      anilistId: 16498,
      similitud: 0.1,
    });
    const muyParecido = candidato({
      id: "77777777-7777-4777-8777-777777777777",
      titulo: "Shingeki no Kyojin: Kuinaki Sentaku",
      tituloNormalizado: "shingeki no kyojin kuinaki sentaku",
      anilistId: null,
      similitud: 0.99,
    });

    const veredicto = decidirAlta(
      { titulo: "Shingeki no Kyojin", anilistId: 16498 },
      [muyParecido, mismoAnilist],
      "interactivo",
    );

    expect(veredicto).toEqual({ clase: "MISMO_ANILIST", existente: mismoAnilist });
  });
});

// ---------------------------------------------------------------------------
// (c) Similitud trigram: pregunta, no bloquea
// ---------------------------------------------------------------------------

const CASOS_UMBRAL: readonly { caso: string; similitud: number; clase: ClaseVeredicto }[] = [
  { caso: "justo POR ENCIMA del umbral", similitud: 0.551, clase: "SIMILARES" },
  { caso: "muy por encima del umbral", similitud: 0.98, clase: "SIMILARES" },
  { caso: "justo POR DEBAJO del umbral", similitud: 0.549, clase: "NUEVO" },
  { caso: "muy por debajo del umbral", similitud: 0.12, clase: "NUEVO" },
];

describe("decidirAlta · (c) similitud trigram", () => {
  it("el umbral exportado es 0.55", () => {
    // No se toca sin actualizar estos tests: es el contrato con `pg_trgm`, que
    // consulta con `set_limit(0.55)` / `similarity() > 0.55`.
    expect(UMBRAL_SIMILITUD).toBe(0.55);
  });

  it("como mucho se proponen 3 candidatos", () => {
    expect(MAXIMO_SIMILARES).toBe(3);
  });

  it("la consulta de `vault.ts` usa EXACTAMENTE el mismo umbral y el mismo límite", () => {
    // `src/lib/db/vault.ts` declara sus propias constantes porque `domain/` no
    // puede importar de `db/` y la dependencia iría al revés. Su comentario
    // remite a este test para que las dos copias no se separen en silencio.
    //
    // Se lee el fichero como TEXTO a propósito: importarlo metería `db/` y
    // `server-only` dentro de un test de dominio, que es justo lo que la regla
    // de dependencias prohíbe. `duplicados.ts` sigue sin conocer a nadie.
    const fuenteDelVault = readFileSync(
      fileURLToPath(new URL("../db/vault.ts", import.meta.url)),
      "utf-8",
    );

    expect(fuenteDelVault, "vault.ts ya no declara UMBRAL_SIMILITUD con este valor").toContain(
      `const UMBRAL_SIMILITUD = ${UMBRAL_SIMILITUD};`,
    );
    expect(fuenteDelVault, "vault.ts ya no declara LIMITE_SIMILARES con este valor").toContain(
      `const LIMITE_SIMILARES = ${MAXIMO_SIMILARES};`,
    );
  });

  it.each(CASOS_UMBRAL)("con similitud $caso el veredicto es $clase", ({ similitud, clase }) => {
    const vault = [candidato({ titulo: "Monster", tituloNormalizado: "monster", similitud })];

    const veredicto = decidirAlta({ titulo: "Monsuta", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe(clase);
  });

  it("en el umbral EXACTO no pregunta: la comparación es estricta", () => {
    // Postgres filtra con `similarity() > 0.55`, no con `>=`. Si aquí fuera
    // `>=`, la aplicación propondría candidatos que la consulta ni devuelve.
    const vault = [
      candidato({ titulo: "Monster", tituloNormalizado: "monster", similitud: UMBRAL_SIMILITUD }),
    ];

    const veredicto = decidirAlta({ titulo: "Monsuta", anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("NUEVO");
  });

  it("la similitud NO bloquea: es una pregunta, no un error", () => {
    const vault = [candidato({ titulo: "Monster", tituloNormalizado: "monster", similitud: 0.99 })];

    const veredicto = decidirAlta({ titulo: "Monsuta", anilistId: null }, vault, "interactivo");

    expect(esBloqueante(veredicto)).toBe(false);
  });

  it("devuelve como mucho 3 candidatos, los 3 más parecidos", () => {
    const vault = [
      candidato({ titulo: "cuarto", tituloNormalizado: "cuarto", similitud: 0.7 }),
      candidato({ titulo: "primero", tituloNormalizado: "primero", similitud: 0.95 }),
      candidato({ titulo: "quinto", tituloNormalizado: "quinto", similitud: 0.6 }),
      candidato({ titulo: "segundo", tituloNormalizado: "segundo", similitud: 0.9 }),
      candidato({ titulo: "tercero", tituloNormalizado: "tercero", similitud: 0.8 }),
    ];

    const veredicto = decidirAlta({ titulo: "otra cosa", anilistId: null }, vault, "interactivo");

    expect(titulosSimilares(veredicto)).toEqual(["primero", "segundo", "tercero"]);
  });

  it("ordena por similitud descendente aunque lleguen desordenados", () => {
    const vault = [
      candidato({ titulo: "flojo", tituloNormalizado: "flojo", similitud: 0.56 }),
      candidato({ titulo: "fuerte", tituloNormalizado: "fuerte", similitud: 0.93 }),
      candidato({ titulo: "medio", tituloNormalizado: "medio", similitud: 0.71 }),
    ];

    const veredicto = decidirAlta({ titulo: "otra cosa", anilistId: null }, vault, "interactivo");

    expect(titulosSimilares(veredicto)).toEqual(["fuerte", "medio", "flojo"]);
  });

  it("descarta los que no llegan al umbral ANTES de quedarse con 3", () => {
    // Si se cortara a 3 antes de filtrar, un candidato flojo ocuparía el sitio
    // de uno bueno y el usuario vería una sugerencia absurda.
    const vault = [
      candidato({ titulo: "ruido a", tituloNormalizado: "ruido a", similitud: 0.2 }),
      candidato({ titulo: "ruido b", tituloNormalizado: "ruido b", similitud: 0.3 }),
      candidato({ titulo: "ruido c", tituloNormalizado: "ruido c", similitud: 0.4 }),
      candidato({ titulo: "bueno", tituloNormalizado: "bueno", similitud: 0.88 }),
    ];

    const veredicto = decidirAlta({ titulo: "otra cosa", anilistId: null }, vault, "interactivo");

    expect(titulosSimilares(veredicto)).toEqual(["bueno"]);
  });

  it("no reordena la lista que recibe", () => {
    // La consulta la reutiliza quien llama: mutarla es un efecto a distancia.
    const vault = [
      candidato({ titulo: "flojo", tituloNormalizado: "flojo", similitud: 0.56 }),
      candidato({ titulo: "fuerte", tituloNormalizado: "fuerte", similitud: 0.93 }),
    ];

    decidirAlta({ titulo: "otra cosa", anilistId: null }, vault, "interactivo");

    expect(vault.map((c) => c.titulo)).toEqual(["flojo", "fuerte"]);
  });

  it("sin candidatos, el alta es NUEVA", () => {
    const veredicto = decidirAlta({ titulo: "Monster", anilistId: 19 }, [], "interactivo");

    expect(veredicto).toEqual({ clase: "NUEVO" });
  });
});

// ---------------------------------------------------------------------------
// Modo lote: seed e importación
// ---------------------------------------------------------------------------

describe("decidirAlta · modo lote: la similitud NUNCA bloquea ni pregunta", () => {
  it("un candidato casi idéntico no impide el alta", () => {
    const vault = [candidato({ titulo: "Monster", tituloNormalizado: "monster", similitud: 0.99 })];

    const veredicto = decidirAlta({ titulo: "Monsuta", anilistId: null }, vault, "lote");

    expect(veredicto).toEqual({ clase: "NUEVO" });
  });

  it("el duplicado exacto SÍ sigue bloqueando", () => {
    const vault = [candidato({ titulo: "Monster", tituloNormalizado: "monster" })];

    const veredicto = decidirAlta({ titulo: "Monster", anilistId: null }, vault, "lote");

    expect(veredicto.clase).toBe("DUPLICADO_EXACTO");
  });

  it("el mismo anilist_id SÍ sigue bloqueando", () => {
    const vault = [
      candidato({
        titulo: "Attack on Titan",
        tituloNormalizado: "attack on titan",
        anilistId: 16498,
      }),
    ];

    const veredicto = decidirAlta(
      { titulo: "Shingeki no Kyojin", anilistId: 16498 },
      vault,
      "lote",
    );

    expect(veredicto.clase).toBe("MISMO_ANILIST");
  });

  it("el MISMO caso da SIMILARES en interactivo y NUEVO en lote", () => {
    const vault = [
      candidato({ titulo: "White Album", tituloNormalizado: "white album", similitud: 0.86 }),
    ];
    const entrada = { titulo: "White Album 2", anilistId: null };

    const interactivo = decidirAlta(entrada, vault, "interactivo");
    const lote = decidirAlta(entrada, vault, "lote");

    expect(interactivo.clase).toBe("SIMILARES");
    expect(lote.clase).toBe("NUEVO");
  });
});

// ---------------------------------------------------------------------------
// esBloqueante
// ---------------------------------------------------------------------------

describe("esBloqueante", () => {
  const vault = [
    candidato({
      titulo: "Attack on Titan",
      tituloNormalizado: "attack on titan",
      anilistId: 16498,
      similitud: 0.99,
    }),
  ];

  it("DUPLICADO_EXACTO bloquea", () => {
    const veredicto = decidirAlta(
      { titulo: "Attack on Titan", anilistId: null },
      vault,
      "interactivo",
    );

    expect(esBloqueante(veredicto)).toBe(true);
  });

  it("MISMO_ANILIST bloquea", () => {
    const veredicto = decidirAlta(
      { titulo: "Shingeki no Kyojin", anilistId: 16498 },
      vault,
      "interactivo",
    );

    expect(esBloqueante(veredicto)).toBe(true);
  });

  it("SIMILARES no bloquea", () => {
    const veredicto = decidirAlta(
      { titulo: "Attack on Titan 2", anilistId: null },
      vault,
      "interactivo",
    );

    expect(esBloqueante(veredicto)).toBe(false);
  });

  it("NUEVO no bloquea", () => {
    const veredicto = decidirAlta({ titulo: "Monster", anilistId: null }, [], "interactivo");

    expect(esBloqueante(veredicto)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El caso negativo importante, contra los datos reales del propietario
// ---------------------------------------------------------------------------

const HIGURASHI_2006 = "Higurashi no Naku Koro Ni";
const HIGURASHI_2020 = "Higurashi no Naku Koro ni (2020)";
const HIGURASHI_SOTSU = "Higurashi no Naku Koro ni Sotsu";
const WHITE_ALBUM = "White Album";
const WHITE_ALBUM_2 = "White Album 2";

/**
 * Similitud trigram entre esos títulos ya normalizados. Obtenida replicando el
 * algoritmo de `pg_trgm` (trigramas de cada palabra con relleno, |A∩B| / |A∪B|)
 * y **redondeada a la baja**; NO está medida contra Postgres, porque este
 * módulo es puro y aquí no hay base de datos.
 *
 * El valor exacto da igual: lo que fija estos tests es que las parejas superan
 * 0,55 —o sea, que la sugerencia salta de verdad— y que aun así ninguna serie
 * se pierde.
 */
const SIMILITUD_ENTRE_HIGURASHI = 0.68;
const SIMILITUD_ENTRE_WHITE_ALBUM = 0.85;

const HIGURASHI_CONTRA_LOS_OTROS: readonly (readonly [string, readonly string[]])[] = [
  [HIGURASHI_2006, [HIGURASHI_2020, HIGURASHI_SOTSU]],
  [HIGURASHI_2020, [HIGURASHI_2006, HIGURASHI_SOTSU]],
  [HIGURASHI_SOTSU, [HIGURASHI_2006, HIGURASHI_2020]],
];

const WHITE_ALBUM_CONTRA_EL_OTRO: readonly (readonly [string, string])[] = [
  [WHITE_ALBUM, WHITE_ALBUM_2],
  [WHITE_ALBUM_2, WHITE_ALBUM],
];

describe("decidirAlta · los animes reales de animes-seed.json", () => {
  const semilla = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../animes-seed.json", import.meta.url)), "utf-8"),
  ) as { animes: { titulo: string }[] };
  const titulosDelSeed = semilla.animes.map((a) => a.titulo);

  it.each([HIGURASHI_2006, HIGURASHI_2020, HIGURASHI_SOTSU, WHITE_ALBUM, WHITE_ALBUM_2])(
    "«%s» sigue estando en animes-seed.json",
    (titulo) => {
      expect(titulosDelSeed).toContain(titulo);
    },
  );

  it.each(HIGURASHI_CONTRA_LOS_OTROS)(
    "en el SEED, «%s» entra pese a parecerse a los otros dos",
    (titulo, yaEnElVault) => {
      const vault = vaultCon(yaEnElVault, SIMILITUD_ENTRE_HIGURASHI);

      const veredicto = decidirAlta({ titulo, anilistId: null }, vault, "lote");

      expect(veredicto).toEqual({ clase: "NUEVO" });
    },
  );

  it.each(HIGURASHI_CONTRA_LOS_OTROS)(
    "en INTERACTIVO, «%s» se pregunta pero NO se bloquea",
    (titulo, yaEnElVault) => {
      const vault = vaultCon(yaEnElVault, SIMILITUD_ENTRE_HIGURASHI);

      const veredicto = decidirAlta({ titulo, anilistId: null }, vault, "interactivo");

      expect(veredicto.clase).toBe("SIMILARES");
      expect(esBloqueante(veredicto)).toBe(false);
    },
  );

  it.each(WHITE_ALBUM_CONTRA_EL_OTRO)(
    "en el SEED, «%s» entra pese a «%s»",
    (titulo, yaEnElVault) => {
      const vault = vaultCon([yaEnElVault], SIMILITUD_ENTRE_WHITE_ALBUM);

      const veredicto = decidirAlta({ titulo, anilistId: null }, vault, "lote");

      expect(veredicto).toEqual({ clase: "NUEVO" });
    },
  );

  it("«White Album 2» y «White Album» son dos series distintas para la fase (a)", () => {
    // Dos temporadas legítimamente distintas: un número final suelto NO es una
    // temporada. Si `normalizarTitulo` las colapsara, esto sería
    // DUPLICADO_EXACTO y el seed perdería una serie del usuario.
    const vault = vaultCon([WHITE_ALBUM], SIMILITUD_ENTRE_WHITE_ALBUM);

    const veredicto = decidirAlta({ titulo: WHITE_ALBUM_2, anilistId: null }, vault, "interactivo");

    expect(veredicto.clase).toBe("SIMILARES");
  });

  it("los tres Higurashi normalizan a tres claves distintas", () => {
    // La fase (a) depende por completo de esto. Es la misma invariante que
    // protege `normalizar.test.ts`, comprobada aquí desde el consumidor.
    const claves = new Set([
      normalizarTitulo(HIGURASHI_2006),
      normalizarTitulo(HIGURASHI_2020),
      normalizarTitulo(HIGURASHI_SOTSU),
    ]);

    expect(claves.size).toBe(3);
  });

  it("no propone «Fate/Zero» al añadir «Fate/stay night»", () => {
    // Misma franquicia, obras distintas: su similitud trigram real (~0,24) ni
    // se acerca al umbral, así que no hay ni pregunta.
    const vault = vaultCon(["Fate/Zero"], 0.24);

    const veredicto = decidirAlta(
      { titulo: "Fate/stay night", anilistId: null },
      vault,
      "interactivo",
    );

    expect(veredicto).toEqual({ clase: "NUEVO" });
  });
});
