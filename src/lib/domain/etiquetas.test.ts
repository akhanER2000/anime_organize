import { describe, expect, it } from "vitest";

import {
  VOCABULARIO_ETIQUETAS,
  esEtiquetaDelVocabulario,
  normalizarSlugDeEtiqueta,
} from "./etiquetas";

/**
 * El vocabulario es CERRADO y es la única copia (skill §6): de aquí salen el
 * prompt, el esquema Zod y los filtros de la interfaz. Si se escribiera dos
 * veces, el modelo acabaría proponiendo etiquetas que el validador rechaza.
 */
describe("VOCABULARIO_ETIQUETAS", () => {
  it("son las 26 de la skill, ni una más", () => {
    expect(VOCABULARIO_ETIQUETAS).toHaveLength(26);
  });

  it("incluye las que el dueño va a ver en su vault", () => {
    expect(VOCABULARIO_ETIQUETAS).toContain("yandere");
    expect(VOCABULARIO_ETIQUETAS).toContain("romance-tragico");
    expect(VOCABULARIO_ETIQUETAS).toContain("sobreviviente-culpa");
    expect(VOCABULARIO_ETIQUETAS).toContain("obra-maestra-visual");
  });

  it("no tiene repetidas", () => {
    expect(new Set(VOCABULARIO_ETIQUETAS).size).toBe(VOCABULARIO_ETIQUETAS.length);
  });

  it("todas son slugs: minúsculas, sin acentos y con guiones", () => {
    for (const etiqueta of VOCABULARIO_ETIQUETAS) {
      expect(etiqueta).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe("esEtiquetaDelVocabulario", () => {
  it("acepta una del vocabulario", () => {
    expect(esEtiquetaDelVocabulario("psicologico")).toBe(true);
  });

  it("rechaza una inventada", () => {
    expect(esEtiquetaDelVocabulario("mecha-gigante-espacial")).toBe(false);
  });

  it("rechaza una que sólo se le PARECE a una del vocabulario", () => {
    // El modelo devuelve variantes con acento o en plural más veces de las que
    // parece. Aceptarlas por parecido llenaría la tabla de sinónimos.
    expect(esEtiquetaDelVocabulario("psicológico")).toBe(false);
    expect(esEtiquetaDelVocabulario("psicologicos")).toBe(false);
    expect(esEtiquetaDelVocabulario("Psicologico")).toBe(false);
  });
});

describe("normalizarSlugDeEtiqueta", () => {
  it("convierte lo que propone el modelo en un slug de esta casa", () => {
    expect(normalizarSlugDeEtiqueta("Terror Cósmico")).toBe("terror-cosmico");
    expect(normalizarSlugDeEtiqueta("  slice of life  ")).toBe("slice-of-life");
    expect(normalizarSlugDeEtiqueta("Ciencia-Ficción DURA")).toBe("ciencia-ficcion-dura");
  });

  it("colapsa la puntuación en un solo guion y no deja guiones sueltos", () => {
    expect(normalizarSlugDeEtiqueta("¡acción!, aventura…")).toBe("accion-aventura");
    expect(normalizarSlugDeEtiqueta("---raro---")).toBe("raro");
  });

  it("devuelve cadena vacía cuando no queda nada utilizable", () => {
    // Y quien llama tiene que descartarla: una etiqueta sin slug no se guarda.
    expect(normalizarSlugDeEtiqueta("···")).toBe("");
    expect(normalizarSlugDeEtiqueta("")).toBe("");
  });
});
