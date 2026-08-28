import { describe, expect, it } from "vitest";

import { COLUMNAS, detectarColumnas, leerFila } from "./mapeo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE UNA HOJA DE CÁLCULO AJENA A LOS CAMPOS DE ESTE VAULT.
 *
 * La hoja la hizo una persona, no un sistema. Las cabeceras vienen con
 * mayúsculas, con acentos, con espacios de más y en dos idiomas, y **el orden
 * de las columnas no es el nuestro**. Adivinar mal la columna del título es
 * importar 300 filas con el nombre equivocado.
 *
 * Por eso la detección se prueba con las formas que salen de verdad de Excel y
 * de Google Sheets, no con una cabecera ideal.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe("detectarColumnas", () => {
  it("encuentra el título con cualquiera de sus nombres habituales", () => {
    for (const cabecera of ["titulo", "Título", "TÍTULO", "Nombre", "Anime", "Serie", "title"]) {
      expect(detectarColumnas([cabecera]).titulo).toBe(0);
    }
  });

  it("no distingue acentos, mayúsculas ni espacios sobrantes", () => {
    const mapa = detectarColumnas(["  TÍTULO  ", " Estado ", "PROGRESO"]);

    expect(mapa.titulo).toBe(0);
    expect(mapa.estado).toBe(1);
    expect(mapa.progreso).toBe(2);
  });

  it("respeta el orden real de la hoja, no uno supuesto", () => {
    const mapa = detectarColumnas(["Notas", "Estado", "Anime"]);

    expect(mapa.titulo).toBe(2);
    expect(mapa.estado).toBe(1);
    expect(mapa.notas).toBe(0);
  });

  it("deja en `null` lo que no está: media hoja no tiene por qué traerlo todo", () => {
    const mapa = detectarColumnas(["Anime"]);

    expect(mapa.titulo).toBe(0);
    expect(mapa.estado).toBeNull();
    expect(mapa.notas).toBeNull();
    expect(mapa.favorito).toBeNull();
  });

  it("con dos columnas candidatas se queda con la PRIMERA, y no con la última", () => {
    // Una hoja exportada de otra app puede traer `Título` y `Título original`.
    // Quedarse con la última importaría el nombre japonés como título.
    expect(detectarColumnas(["Titulo", "Nombre"]).titulo).toBe(0);
  });

  it("una cabecera desconocida no rompe nada: simplemente no se mapea", () => {
    const mapa = detectarColumnas(["Anime", "Columna rara del usuario"]);

    expect(mapa.titulo).toBe(0);
    expect(Object.values(mapa)).not.toContain(1);
  });

  it("COLUMNAS documenta todos los campos que se saben leer", () => {
    // Si alguien añade una columna al mapeo y no a la lista, la interfaz de
    // «asignar columnas» dejaría de ofrecerla y nadie se enteraría.
    expect(Object.keys(COLUMNAS)).toContain("titulo");
    expect(Object.keys(COLUMNAS)).toContain("estado");
    expect(Object.keys(COLUMNAS)).toContain("progreso");
  });
});

describe("leerFila", () => {
  const mapa = detectarColumnas(["Anime", "Estado", "Progreso", "Notas", "Favorito"]);

  it("lee una fila normal", () => {
    const fila = leerFila(["Higurashi", "Visto", "Completo", "Me encantó", "sí"], mapa);

    expect(fila.titulo).toBe("Higurashi");
    expect(fila.estado).toBe("VISTO");
    expect(fila.progreso).toBe("Completo");
    expect(fila.notas).toBe("Me encantó");
    expect(fila.esFavorito).toBe(true);
  });

  it("un estado desconocido cae en PENDIENTE, que es lo que dice la skill", () => {
    // Skill §3: «cualquier otra cosa → PENDIENTE + fila en el reporte».
    const fila = leerFila(["X", "estado inventado", "", "", ""], mapa);

    expect(fila.estado).toBe("PENDIENTE");
    // El aviso NOMBRA el valor que no se entendió: «no reconocido» a secas
    // deja al usuario buscando cuál de sus 300 filas era.
    expect(fila.avisos.join(" ")).toContain("estado inventado");
  });

  it("interpreta el favorito en las formas que escribe la gente", () => {
    for (const valor of ["sí", "si", "SI", "x", "X", "1", "true", "verdadero", "yes"]) {
      expect(leerFila(["X", "", "", "", valor], mapa).esFavorito).toBe(true);
    }
    for (const valor of ["", "no", "0", "false", "-"]) {
      expect(leerFila(["X", "", "", "", valor], mapa).esFavorito).toBe(false);
    }
  });

  it("recorta los espacios: Excel los deja por todas partes", () => {
    expect(leerFila(["  Higurashi  ", " Visto ", "", "", ""], mapa).titulo).toBe("Higurashi");
  });

  it("una celda numérica llega como número y NO se pierde", () => {
    // SheetJS devuelve números para las celdas numéricas. Un título que sea
    // «2199» tiene que sobrevivir a eso.
    expect(leerFila([2199, "", "", "", ""], mapa).titulo).toBe("2199");
  });

  it("una fila sin título es un error, no una fila con título vacío", () => {
    const fila = leerFila(["   ", "Visto", "", "", ""], mapa);

    expect(fila.titulo).toBe("");
    expect(fila.errores).toContain("Falta el título");
  });

  it("un título absurdamente largo se marca, no se recorta en silencio", () => {
    const fila = leerFila(["a".repeat(600), "", "", "", ""], mapa);

    expect(fila.errores.length).toBeGreaterThan(0);
  });

  it("lo que no está mapeado sale vacío, sin inventarse nada", () => {
    const soloTitulo = detectarColumnas(["Anime"]);
    const fila = leerFila(["Higurashi"], soloTitulo);

    expect(fila.estado).toBe("PENDIENTE");
    expect(fila.notas).toBeNull();
    expect(fila.esFavorito).toBe(false);
    // Y no se avisa de un estado que la hoja nunca prometió tener: una hoja
    // sin columna de estado no tiene nada que reportar.
    expect(fila.avisos).toEqual([]);
  });
});
