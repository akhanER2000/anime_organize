import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ESTADOS,
  ETIQUETA_ESTADO,
  FORMATOS,
  ETIQUETA_FORMATO,
  TIPOS_PROGRESO,
  TIPOS_GENERO,
  TIPOS_SITIO,
  ESTADOS_TRABAJO,
  listaSql,
  mapearEstado,
  normalizarEtiquetaLibre,
} from "./enums";

describe("mapearEstado · valores canónicos", () => {
  it.each(ESTADOS)("reconoce el propio valor del dominio: %s", (estado) => {
    expect(mapearEstado(estado)).toEqual({ estado, reconocido: true });
  });

  it("reconoce EN_ESPERA pese al guion bajo", () => {
    // normalizarEtiquetaLibre convierte '_' en espacio, así que la comparación
    // contra la lista canónica tiene que normalizar ambos lados.
    expect(mapearEstado("EN_ESPERA")).toEqual({ estado: "EN_ESPERA", reconocido: true });
  });
});

describe("mapearEstado · texto libre de importaciones", () => {
  it.each([
    ["Visto", "VISTO"],
    ["visto", "VISTO"],
    ["  COMPLETADO  ", "VISTO"],
    ["Terminado", "VISTO"],
    ["watched", "VISTO"],
    ["Viendo", "VIENDO"],
    ["En curso", "VIENDO"],
    ["en proceso", "VIENDO"],
    ["Watching", "VIENDO"],
    ["En Espera", "EN_ESPERA"],
    ["pausado", "EN_ESPERA"],
    ["on hold", "EN_ESPERA"],
    ["Abandonado", "ABANDONADO"],
    ["dropped", "ABANDONADO"],
    ["Pendiente", "PENDIENTE"],
    ["Plan to Watch", "PENDIENTE"],
    ["PTW", "PENDIENTE"],
    ["por ver", "PENDIENTE"],
  ])("mapea %s a %s", (entrada, esperado) => {
    expect(mapearEstado(entrada)).toEqual({ estado: esperado, reconocido: true });
  });

  it("ignora acentos y mayúsculas", () => {
    expect(mapearEstado("EN EMISIÓN")).toEqual({ estado: "VIENDO", reconocido: true });
  });
});

describe("mapearEstado · lo desconocido no se traga en silencio", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["valor inventado", "me lo estoy pensando"],
    ["solo puntuación", "???"],
  ])("%s cae en PENDIENTE marcado como NO reconocido", (_caso, entrada) => {
    const r = mapearEstado(entrada);
    expect(r.estado).toBe("PENDIENTE");
    // Es lo que permite listarlo en el reporte de importación en vez de ocultarlo.
    expect(r.reconocido).toBe(false);
  });
});

describe("normalizarEtiquetaLibre", () => {
  it.each([
    ["Ánimé", "anime"],
    ["EN_ESPERA", "en espera"],
    ["  On   Hold  ", "on hold"],
    ["Plan-To-Watch", "plan to watch"],
  ])("normaliza %s a %s", (entrada, esperado) => {
    expect(normalizarEtiquetaLibre(entrada)).toBe(esperado);
  });
});

describe("listaSql", () => {
  it("produce la lista para un CHECK de Postgres", () => {
    expect(listaSql(ESTADOS)).toBe("'VISTO','VIENDO','EN_ESPERA','ABANDONADO','PENDIENTE'");
  });

  it("no rompe con un solo elemento", () => {
    expect(listaSql(["TV"])).toBe("'TV'");
  });
});

describe("integridad de los dominios cerrados", () => {
  it("toda etiqueta de estado tiene texto visible", () => {
    // El estado nunca se comunica solo por color: cada badge lleva su etiqueta.
    for (const e of ESTADOS) {
      expect(ETIQUETA_ESTADO[e]).toBeTruthy();
    }
  });

  it("todo formato tiene etiqueta visible", () => {
    for (const f of FORMATOS) {
      expect(ETIQUETA_FORMATO[f]).toBeTruthy();
    }
  });

  it.each([
    ["ESTADOS", ESTADOS],
    ["FORMATOS", FORMATOS],
    ["TIPOS_PROGRESO", TIPOS_PROGRESO],
    ["TIPOS_GENERO", TIPOS_GENERO],
    ["TIPOS_SITIO", TIPOS_SITIO],
    ["ESTADOS_TRABAJO", ESTADOS_TRABAJO],
  ])("%s no tiene duplicados", (_nombre, lista) => {
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("los valores del encargo están completos y sin añadidos", () => {
    expect([...ESTADOS]).toEqual(["VISTO", "VIENDO", "EN_ESPERA", "ABANDONADO", "PENDIENTE"]);
    expect([...FORMATOS]).toEqual(["TV", "MOVIE", "OVA", "ONA", "SPECIAL"]);
    expect([...TIPOS_PROGRESO]).toEqual([
      "COMPLETO",
      "TEMPORADA",
      "EPISODIO",
      "PORCENTAJE",
      "CUSTOM",
    ]);
    expect([...TIPOS_GENERO]).toEqual(["OFICIAL", "IA", "USUARIO"]);
    expect([...TIPOS_SITIO]).toEqual(["GRATIS", "PAGO", "MIXTO"]);
  });
});

describe("regresión: los estados del vault real se mapean", () => {
  const semilla = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../animes-seed.json", import.meta.url)), "utf-8"),
  ) as { animes: { estado: string; estadoOriginal: string }[] };

  it("los 83 animes traen un estado reconocido", () => {
    const noReconocidos = semilla.animes
      .map((a) => ({ original: a.estadoOriginal, ...mapearEstado(a.estadoOriginal) }))
      .filter((r) => !r.reconocido);

    expect(noReconocidos, `estados sin mapear: ${JSON.stringify(noReconocidos)}`).toEqual([]);
  });

  it("los 83 vienen como VISTO", () => {
    const estados = new Set(semilla.animes.map((a) => mapearEstado(a.estado).estado));
    expect([...estados]).toEqual(["VISTO"]);
  });
});
