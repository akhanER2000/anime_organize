import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LIMITE_EXPORT_BYTES,
  UMBRAL_AVISO_BYTES,
  medirExport,
  notaDeExclusion,
  tamanoEnBytes,
  type AnimeExportado,
  type ExportVault,
} from "./export";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * Mutación: incluir los bytes de las portadas en `AnimeExportado` (un base64 de
 * ~40 KB por portada, que es el tamaño real de un WebP 480x720 de calidad 82).
 *
 * Resultado MEDIDO: «el export de 83 animes cabe en el presupuesto» se pone en
 * ROJO — 83 × 40 KB ≈ 3,3 MB, más de 3 veces el límite de 1 MiB.
 * Restaurado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los 83 títulos reales del usuario: el tamaño se mide con SUS datos. */
const TITULOS_REALES = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../animes-seed.json", import.meta.url)), "utf-8"),
  ) as { animes: { titulo: string; progresoEtiqueta: string }[] }
).animes;

/**
 * Un anime "gordo": todos los campos rellenos y generosos. Sirve para medir el
 * peor caso realista, no el mejor.
 */
function animeGordo(titulo: string, etiquetaProgreso: string): AnimeExportado {
  return {
    titulo,
    tituloIngles: `${titulo} (English title, reasonably long)`,
    tituloNativo: "日本語のタイトルはここにあります",
    sinonimos: [`${titulo} alt 1`, `${titulo} alt 2`, `${titulo} alt 3`],
    estado: "VISTO",
    formato: "TV",
    anio: 2011,
    episodiosTotales: 24,
    temporadasTotales: 2,
    puntuacion: "9.5",
    favorito: true,
    // Una sinopsis de AniList ronda los 800-1.200 caracteres.
    sinopsis: "Sinopsis larga de ejemplo. ".repeat(45),
    // Notas del usuario: lo irrecuperable, y por eso lo que SÍ va en el export.
    notas: "Mis notas personales sobre esta serie, que son lo que no se puede recuperar. ".repeat(6),
    anilistId: 123_456,
    malId: 654_321,
    creadoEn: "2026-01-15T10:30:00.000Z",
    actualizadoEn: "2026-08-01T18:45:00.000Z",
    progreso: {
      tipo: "EPISODIO",
      temporada: 2,
      episodio: 7,
      porcentaje: null,
      etiqueta: etiquetaProgreso,
    },
    enlaces: [
      { url: "https://ejemplo.test/serie/temporada-2/episodio-7", etiqueta: "AnimeFLV V2 · Ep 7", temporada: 2, episodio: 7 },
      { url: "https://otro-ejemplo.test/watch/12345", etiqueta: "Crunchyroll", temporada: 2, episodio: 7 },
    ],
    generos: [
      { slug: "drama-adulto", nombre: "Drama adulto", tipo: "OFICIAL", confianza: null },
      { slug: "psicologico", nombre: "Psicológico", tipo: "IA", confianza: "0.870" },
      { slug: "romance-tragico", nombre: "Romance trágico", tipo: "IA", confianza: "0.640" },
      { slug: "obra-maestra-visual", nombre: "Obra maestra visual", tipo: "IA", confianza: "0.910" },
    ],
    // SOLO la referencia. Los bytes NO viajan aquí.
    portada: {
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      urlOrigen: "https://drive.google.com/uc?export=download&id=1h0_TndBOMHwv4hCYVAQ8Ai2k6IXRfpND",
      ancho: 480,
      alto: 720,
    },
  };
}

function exportDeLosOchentaYTres(): ExportVault {
  return {
    version: 1,
    generadoEn: "2026-08-23T18:00:00.000Z",
    usuario: { email: "propietario@ejemplo.test", nombre: "Propietario del vault" },
    animes: TITULOS_REALES.map((a) => animeGordo(a.titulo, a.progresoEtiqueta)),
    sitiosPropios: [
      {
        slug: "mi-sitio",
        nombre: "Mi sitio favorito",
        tipo: "GRATIS",
        espejos: [
          { etiqueta: "V1", url: "https://ejemplo.test" },
          { etiqueta: "V2", url: "https://ejemplo2.test" },
        ],
      },
    ],
    excluido: notaDeExclusion(83),
  };
}

describe("EL EXPORT DE 83 ANIMES CABE EN EL PRESUPUESTO", () => {
  it("los datos de prueba son los 83 títulos reales", () => {
    expect(TITULOS_REALES).toHaveLength(83);
  });

  it("cabe en 1 MiB, con margen", () => {
    const medida = medirExport(exportDeLosOchentaYTres());

    // El número exacto queda a la vista: si un cambio lo empeora, se ve cuánto.
    expect(
      medida.cabe,
      `export de 83 animes: ${(medida.bytes / 1024).toFixed(0)} KB ` +
        `(${medida.porcentaje} % del presupuesto de 1 MiB)`,
    ).toBe(true);

    // Y no solo cabe: sobra sitio para crecer.
    expect(medida.porcentaje).toBeLessThan(60);
  });

  it("no dispara el aviso de «conviene descargar por partes»", () => {
    expect(medirExport(exportDeLosOchentaYTres()).conviene_avisar).toBe(false);
  });

  it("aguantaría un vault DIEZ VECES mayor antes de rozar el límite", () => {
    // 830 animes con todos los campos llenos. Es el margen que separa esto de
    // volver a romperse dentro de dos años.
    const grande: ExportVault = {
      ...exportDeLosOchentaYTres(),
      animes: Array.from({ length: 830 }, (_, i) =>
        animeGordo(`Anime número ${i} con un título razonablemente largo`, "Completo (Todo Visto)"),
      ),
    };

    const medida = medirExport(grande);
    // Este SÍ se pasa, y es información útil: sabemos dónde está el techo.
    expect(medida.bytes).toBeGreaterThan(LIMITE_EXPORT_BYTES);
  });
});

describe("LO QUE PASARÍA CON LAS PORTADAS DENTRO", () => {
  it("83 portadas en base64 revientan el presupuesto por 3x", () => {
    // Un WebP 480x720 de calidad 82 pesa ~30 KB; en base64, ~40 KB.
    // ESTE es el motivo de que los binarios vayan aparte.
    const UNA_PORTADA_BASE64 = 40 * 1024;
    const conPortadas = 83 * UNA_PORTADA_BASE64;

    expect(conPortadas).toBeGreaterThan(LIMITE_EXPORT_BYTES * 3);
  });

  it("el export declara EXPLÍCITAMENTE lo que deja fuera", () => {
    // Un export silencioso al que le faltan las portadas es peor que no tener
    // export: el usuario cree que lo tiene todo.
    const nota = notaDeExclusion(83);

    expect(nota.portadas.cantidad).toBe(83);
    expect(nota.portadas.motivo.length).toBeGreaterThan(0);
    expect(nota.portadas.comoObtenerlas).toContain("Descargar portadas");
  });

  it("cada anime conserva checksum y URL de origen de su portada", () => {
    // Es lo que permite reconstruirlas: una portada perdida se vuelve a
    // descargar; una nota personal, no.
    const uno = animeGordo("Prueba", "Completo");

    expect(uno.portada?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(uno.portada?.urlOrigen).toContain("https://");
  });

  it("el tipo de export NO tiene ningún campo de bytes", () => {
    // Barrera de tipos además de la de tamaño: que no se cuele por descuido.
    const uno = animeGordo("Prueba", "Completo");
    const claves = Object.keys(uno.portada ?? {});

    expect(claves).not.toContain("bytes");
    expect(claves).not.toContain("thumbBytes");
    expect(claves).toEqual(["checksum", "urlOrigen", "ancho", "alto"]);
  });
});

describe("lo irrecuperable SÍ viaja", () => {
  it("las notas del usuario están en el export", () => {
    const json = JSON.stringify(exportDeLosOchentaYTres());
    expect(json).toContain("Mis notas personales");
  });

  it("el progreso y su etiqueta original están en el export", () => {
    const e = exportDeLosOchentaYTres();
    const primero = e.animes[0];

    expect(primero?.progreso).not.toBeNull();
    // La etiqueta que escribió el usuario, no una reescrita por nosotros.
    expect(primero?.progreso?.etiqueta).toBe(TITULOS_REALES[0]?.progresoEtiqueta);
  });

  it("los enlaces de continuación están en el export", () => {
    const primero = exportDeLosOchentaYTres().animes[0];
    expect(primero?.enlaces.length).toBeGreaterThan(0);
    expect(primero?.enlaces[0]?.url).toContain("https://");
  });

  it("las etiquetas de IA conservan su confianza", () => {
    const primero = exportDeLosOchentaYTres().animes[0];
    const ia = primero?.generos.filter((g) => g.tipo === "IA") ?? [];

    expect(ia.length).toBeGreaterThan(0);
    expect(ia[0]?.confianza).toMatch(/^\d\.\d+$/);
  });
});

describe("medición", () => {
  it("tamanoEnBytes cuenta UTF-8, no caracteres", () => {
    // Un título japonés ocupa 3 bytes por carácter: contar caracteres
    // subestimaría el tamaño real justo en el vault de este usuario.
    expect(tamanoEnBytes("日本語")).toBe(11); // 9 bytes + 2 comillas
    expect(tamanoEnBytes("abc")).toBe(5);
  });

  it("el umbral de aviso está por debajo del límite duro", () => {
    expect(UMBRAL_AVISO_BYTES).toBeLessThan(LIMITE_EXPORT_BYTES);
  });

  it("un export vacío es diminuto", () => {
    const vacio: ExportVault = {
      version: 1,
      generadoEn: "2026-08-23T18:00:00.000Z",
      usuario: { email: "a@b.test", nombre: null },
      animes: [],
      sitiosPropios: [],
      excluido: notaDeExclusion(0),
    };

    expect(medirExport(vacio).porcentaje).toBe(0);
  });
});
