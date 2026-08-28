import { describe, expect, it } from "vitest";

import { componerExport, nombreDeFichero, VERSION_EXPORT, type FilaParaExportar } from "./exportar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL EXPORT ES LO ÚLTIMO QUE LE QUEDA A ALGUIEN QUE BORRA SU CUENTA.
 *
 * Por eso lo que se comprueba aquí no es que «genere un JSON», sino que **lleve
 * lo irrecuperable**: las notas, el progreso con la etiqueta que escribió el
 * usuario, y los enlaces exactos. Eso no se vuelve a conseguir de ninguna
 * manera; una portada sí, pegando su dirección.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Quitando `notas` del objeto → rojo.
 *   Sustituyendo `progresoEtiqueta` por una etiqueta derivada del tipo → rojo
 *   «conserva la etiqueta ORIGINAL».
 *   Metiendo los bytes de la portada → rojo «no lleva los bytes».
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const AHORA = new Date("2026-08-27T22:45:00.000Z");

const fila = (extra: Partial<FilaParaExportar> = {}): FilaParaExportar => ({
  id: "id-1",
  titulo: "Higurashi no Naku Koro ni",
  estado: "VISTO",
  esFavorito: true,
  anio: 2006,
  actualizadoEn: new Date("2026-08-24T18:50:19.000Z"),
  checksumPortada: "abc123",
  progresoEtiqueta: "Solo 1ra Temporada",
  progresoTipo: "TEMPORADA",
  progresoTemporada: 1,
  progresoEpisodio: null,
  progresoPorcentaje: null,
  totalEpisodios: 26,
  totalTemporadas: 2,
  notas: "El arco de Keiichi es el mejor",
  urlOrigenPortada: "https://ejemplo.test/portada.jpg",
  enlaces: [
    {
      url: "https://animeflv.net/ver/higurashi-7",
      etiqueta: "AnimeFLV V2 · Ep 7",
      ultimoUso: new Date("2026-08-25T10:00:00.000Z"),
    },
  ],
  ...extra,
});

describe("componerExport", () => {
  it("LLEVA LAS NOTAS, que no se recuperan de ninguna otra parte", () => {
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [fila()], ahora: AHORA });

    expect(resultado.animes[0]?.notas).toBe("El arco de Keiichi es el mejor");
  });

  it("CONSERVA LA ETIQUETA DE PROGRESO ORIGINAL", () => {
    // Skill de dominio §4: se conserva la que escribió el usuario, no una
    // reescrita por nosotros. Un export que dijera «Temporada 1» donde él
    // escribió «Solo 1ra Temporada» habría perdido justo lo que guardaba.
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [fila()], ahora: AHORA });

    expect(resultado.animes[0]?.progreso?.etiqueta).toBe("Solo 1ra Temporada");
    expect(resultado.animes[0]?.progreso?.tipo).toBe("TEMPORADA");
    expect(resultado.animes[0]?.progreso?.temporada).toBe(1);
  });

  it("lleva los enlaces con su etiqueta y su último uso", () => {
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [fila()], ahora: AHORA });

    expect(resultado.animes[0]?.enlaces).toEqual([
      {
        url: "https://animeflv.net/ver/higurashi-7",
        etiqueta: "AnimeFLV V2 · Ep 7",
        ultimoUso: "2026-08-25T10:00:00.000Z",
      },
    ]);
  });

  it("DE LA PORTADA LLEVA SOLO EL CHECKSUM Y EL ORIGEN, nunca los bytes", () => {
    // Medido: las 83 portadas ocupan 3,05 MB, y en base64 4,06 MB — el 349 %
    // del presupuesto de una respuesta. Fallaría con un error de plataforma.
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [fila()], ahora: AHORA });

    expect(resultado.animes[0]?.portada).toEqual({
      checksum: "abc123",
      urlOrigen: "https://ejemplo.test/portada.jpg",
    });
    // Se mira SOLO la lista de animes, no el fichero entero: el `_leeme`
    // contiene la palabra «bytes» precisamente para decir que no van, y una
    // aserción sobre todo el JSON se ataba a la redacción de la nota en vez de
    // a los datos. La primera versión pasaba y fallaba por ese motivo.
    expect(JSON.stringify(resultado.animes)).not.toContain("bytes");
  });

  it("un anime sin portada la deja en null, no en un objeto vacío", () => {
    const resultado = componerExport({
      email: "yo@ejemplo.test",
      animes: [fila({ checksumPortada: null })],
      ahora: AHORA,
    });

    expect(resultado.animes[0]?.portada).toBeNull();
  });

  it("un anime sin progreso lo deja en null", () => {
    const resultado = componerExport({
      email: "yo@ejemplo.test",
      animes: [fila({ progresoEtiqueta: null, progresoTipo: null })],
      ahora: AHORA,
    });

    expect(resultado.animes[0]?.progreso).toBeNull();
  });

  it("DICE DE SÍ MISMO QUÉ NO LLEVA", () => {
    // Un export que calla lo que le falta es peor que uno incompleto: quien lo
    // guarda cree tenerlo todo, y se entera el día que lo necesita.
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [], ahora: AHORA });

    expect(resultado._leeme).toMatch(/NO LLEVA los bytes de las portadas/);
  });

  it("lleva versión: un fichero sobrevive a la aplicación que lo generó", () => {
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [], ahora: AHORA });

    expect(resultado.version).toBe(VERSION_EXPORT);
    expect(resultado.generadoEn).toBe("2026-08-27T22:45:00.000Z");
    expect(resultado.cuenta.email).toBe("yo@ejemplo.test");
  });

  it("un vault vacío produce un fichero válido, no un error", () => {
    // Quien borra su cuenta el primer día también tiene derecho a su copia.
    const resultado = componerExport({ email: "yo@ejemplo.test", animes: [], ahora: AHORA });

    expect(resultado.animes).toEqual([]);
    expect(() => JSON.stringify(resultado)).not.toThrow();
  });
});

describe("nombreDeFichero", () => {
  it("lleva la fecha en ISO para que ordene solo", () => {
    // `anime-vault.json` a secas se sobrescribe en la carpeta de descargas sin
    // avisar, y quien exporta dos veces quiere poder distinguirlos.
    expect(nombreDeFichero(AHORA)).toBe("anime-vault-2026-08-27.json");
  });
});
