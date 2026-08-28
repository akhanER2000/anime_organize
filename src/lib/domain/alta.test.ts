import { describe, expect, it } from "vitest";

import {
  completarTemporada,
  decidirAlta,
  decidirAltaEnLote,
  marcarCompleto,
  progresoLibre,
  sumarEpisodio,
  type Hallazgos,
} from "./alta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA REGLA QUE ESTOS TESTS PROTEGEN: LA SIMILITUD **PREGUNTA**, NO BLOQUEA.
 *
 * No es una preferencia de producto. Con los datos reales del dueño:
 *
 *   · `Higurashi no Naku Koro ni` y `Higurashi no Naku Koro ni (2020)` miden
 *     0.438 de similitud, y son **dos series distintas que tiene a propósito**;
 *   · `White Album` y `White Album 2`, lo mismo.
 *
 * Un alta que bloqueara por similitud le impediría añadir la segunda, y el
 * mensaje diría «ya lo tienes» sobre algo que no tiene. Es pérdida de datos con
 * cara de validación correcta.
 *
 * Y su reverso, que es la otra mitad: **un proceso por lotes no puede
 * preguntar**. No hay nadie delante de una importación de 400 filas, así que la
 * única alternativa sería descartar en silencio. Por eso `decidirAltaEnLote`
 * existe como función aparte y no como una bandera que se pueda olvidar.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Cambiando el desenlace de `similares` a `BLOQUEADO` → 1 rojo, y es EL que
 *   describe la regla: «la similitud pregunta, y nunca bloquea».
 *   Quitando el `!forzar` de la condición → 1 rojo («añadir igualmente»).
 *   Haciendo que `decidirAltaEnLote` delegue con `forzar = false` → 1 rojo.
 *   Restaurado → 18 verdes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const NADA: Hallazgos = { exacto: null, porAnilist: null, similares: [] };
const HIGURASHI = { id: "hig-1", titulo: "Higurashi no Naku Koro ni" };

describe("decidirAlta", () => {
  it("sin nada parecido, adelante", () => {
    expect(decidirAlta(NADA)).toEqual({ clase: "ADELANTE" });
  });

  it("el título normalizado exacto BLOQUEA", () => {
    // Es lo que el `UNIQUE (user_id, title_normalized)` rechazaría igualmente.
    // Decidirlo aquí es lo que convierte un 500 en un mensaje útil.
    expect(decidirAlta({ ...NADA, exacto: HIGURASHI })).toEqual({
      clase: "BLOQUEADO",
      motivo: "TITULO",
      existente: HIGURASHI,
    });
  });

  it("el mismo anilist_id con OTRO título también bloquea", () => {
    // Romaji, inglés y sinónimo son la misma obra. Skill §2b.
    expect(decidirAlta({ ...NADA, porAnilist: HIGURASHI })).toEqual({
      clase: "BLOQUEADO",
      motivo: "ANILIST",
      existente: HIGURASHI,
    });
  });

  it("si hay exacto Y anilist, manda el exacto", () => {
    // El exacto produce el mensaje útil —«ya tienes este anime», con enlace a
    // la ficha— y es el que la base rechazaría.
    const veredicto = decidirAlta({
      exacto: HIGURASHI,
      porAnilist: { id: "otro", titulo: "Otro" },
      similares: [],
    });

    expect(veredicto).toMatchObject({ clase: "BLOQUEADO", motivo: "TITULO" });
  });

  it("LA SIMILITUD PREGUNTA, Y NUNCA BLOQUEA", () => {
    // El caso real: el dueño ya tiene el Higurashi de 2006 y está añadiendo el
    // de 2020. Bloquear aquí le quitaría una serie de su vault.
    const veredicto = decidirAlta({ ...NADA, similares: [HIGURASHI] });

    expect(veredicto).toEqual({ clase: "PREGUNTA", candidatos: [HIGURASHI] });
    expect(veredicto.clase).not.toBe("BLOQUEADO");
  });

  it("«añadir igualmente» salta la pregunta", () => {
    expect(decidirAlta({ ...NADA, similares: [HIGURASHI] }, true)).toEqual({ clase: "ADELANTE" });
  });

  it("«añadir igualmente» NO salta el bloqueo", () => {
    // Ofrecer un botón que la base va a rechazar de todas formas es peor que no
    // ofrecerlo: el usuario pulsa, falla, y no entiende por qué.
    expect(decidirAlta({ ...NADA, exacto: HIGURASHI }, true)).toMatchObject({
      clase: "BLOQUEADO",
    });
  });
});

describe("decidirAltaEnLote", () => {
  it("NO pregunta por similitud: no hay nadie a quien preguntar", () => {
    // Si el seed descartara por trigram, tiraría los tres Higurashi legítimos.
    expect(decidirAltaEnLote({ ...NADA, similares: [HIGURASHI] })).toEqual({ clase: "ADELANTE" });
  });

  it("pero sigue bloqueando el duplicado exacto: es lo que lo hace idempotente", () => {
    expect(decidirAltaEnLote({ ...NADA, exacto: HIGURASHI })).toMatchObject({
      clase: "BLOQUEADO",
    });
  });
});

describe("los botones rápidos de progreso", () => {
  const SIN_NADA = { tipo: null, temporada: null, episodio: null, porcentaje: null };

  it("«+1 episodio» sobre un anime SIN temporada asume la 1", () => {
    // El caso que se escribe mal siempre: sin `season`, la barra no puede
    // calcular nada y pasa a indeterminada justo cuando el usuario acaba de
    // decir exactamente por dónde va. Skill §4.
    expect(sumarEpisodio(SIN_NADA)).toEqual({
      kind: "EPISODIO",
      label: "Temporada 1 · episodio 1",
      temporada: 1,
      episodio: 1,
      porcentaje: null,
    });
  });

  it("«+1 episodio» conserva la temporada que ya había", () => {
    expect(sumarEpisodio({ ...SIN_NADA, temporada: 2, episodio: 6 })).toMatchObject({
      temporada: 2,
      episodio: 7,
      label: "Temporada 2 · episodio 7",
    });
  });

  it("«temporada completa» escribe la etiqueta del seed para la primera", () => {
    // «Solo 1ra Temporada» es literalmente lo que dice el seed en sus cuatro
    // filas T1. Escribirlo distinto crearía dos textos para lo mismo.
    expect(completarTemporada(SIN_NADA)).toMatchObject({
      kind: "TEMPORADA",
      temporada: 1,
      label: "Solo 1ra temporada",
    });
    expect(completarTemporada({ ...SIN_NADA, temporada: 3 })).toMatchObject({
      label: "Hasta la temporada 3",
    });
  });

  it("«todo visto» usa la etiqueta original del seed", () => {
    expect(marcarCompleto()).toMatchObject({
      kind: "COMPLETO",
      label: "Completo (Todo Visto)",
    });
  });
});

describe("progresoLibre", () => {
  it("sin porcentaje es CUSTOM: la barra queda indeterminada", () => {
    expect(progresoLibre("Voy por la mitad del manga", null)).toEqual({
      kind: "CUSTOM",
      label: "Voy por la mitad del manga",
      temporada: null,
      episodio: null,
      porcentaje: null,
    });
  });

  it("con porcentaje es PORCENTAJE: la barra sí se rellena", () => {
    expect(progresoLibre("", 45)).toMatchObject({
      kind: "PORCENTAJE",
      porcentaje: 45,
      label: "45 %",
    });
  });

  it("una etiqueta vacía no deja un hueco en la ficha", () => {
    expect(progresoLibre("   ", null).label).toBe("En proceso");
  });

  it("un porcentaje fuera de rango se acota, no se guarda tal cual", () => {
    // Llega de un `<input type=range>` y de la Server Action: los dos se pueden
    // manipular, y un 300 % pintaría una barra saliéndose de la card.
    expect(progresoLibre("", 300).porcentaje).toBe(100);
    expect(progresoLibre("", -20).porcentaje).toBe(0);
    expect(progresoLibre("", 45.7).porcentaje).toBe(46);
  });

  it("la etiqueta escrita gana al porcentaje generado", () => {
    expect(progresoLibre("Casi acabado", 90).label).toBe("Casi acabado");
  });
});
