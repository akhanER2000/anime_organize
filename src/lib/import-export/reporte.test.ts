import { describe, expect, it } from "vitest";

import { csvDeIncidencias, nombreDelReporte } from "./reporte";

import type { FilaPlanificada } from "./plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL REPORTE DE LA IMPORTACIÓN.
 *
 * ── SE VA A ABRIR EN EXCEL, Y ESO CAMBIA LAS REGLAS ─────────────────────
 *
 * Un CSV no es texto inerte cuando lo abre una hoja de cálculo: una celda que
 * empieza por `=`, `+`, `-` o `@` se interpreta como **fórmula**. Y el
 * contenido de este reporte sale del fichero que subió el usuario, así que una
 * celda hostil llega hasta aquí y se ejecuta en SU ordenador al abrirlo.
 *
 * Es el mismo razonamiento que el saneado de la sinopsis de AniList: el dato
 * viene de fuera y el destino lo interpreta. Se neutraliza en la puerta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fila = (parcial: Partial<FilaPlanificada> & { filaDeLaHoja: number }): FilaPlanificada => ({
  datos: {
    titulo: "Monster",
    estado: "PENDIENTE",
    progreso: null,
    notas: null,
    esFavorito: false,
    portada: null,
    enlace: null,
    errores: [],
    avisos: [],
  },
  veredicto: "NUEVA",
  motivo: null,
  avisos: [],
  seleccionada: true,
  ...parcial,
});

describe("csvDeIncidencias", () => {
  it("lleva una cabecera legible en español", () => {
    const csv = csvDeIncidencias([
      fila({ filaDeLaHoja: 2, veredicto: "ERROR", motivo: "Falta el título" }),
    ]);

    expect(csv.split("\n")[0]).toBe("Fila,Titulo,Resultado,Motivo");
  });

  it("incluye las filas con error, con SU número de fila de la hoja", () => {
    const csv = csvDeIncidencias([
      fila({ filaDeLaHoja: 7, veredicto: "ERROR", motivo: "Falta el título" }),
    ]);

    expect(csv).toContain("7,");
    expect(csv).toContain("Falta el título");
  });

  it("incluye también duplicadas, repetidas y avisos: todo lo que NO entró limpio", () => {
    const csv = csvDeIncidencias([
      fila({ filaDeLaHoja: 2, veredicto: "DUPLICADA", motivo: "Ya está en tu vault" }),
      fila({ filaDeLaHoja: 3, veredicto: "REPETIDA_EN_EL_FICHERO", motivo: "Repetida: fila 2" }),
      fila({ filaDeLaHoja: 4, avisos: ["estado «raro» no reconocido"] }),
    ]);

    expect(csv).toContain("Ya está en tu vault");
    expect(csv).toContain("Repetida");
    expect(csv).toContain("no reconocido");
  });

  it("NO incluye las filas que entraron sin nada que contar", () => {
    // Un reporte con las 300 filas buenas dentro esconde las 4 que fallaron.
    const csv = csvDeIncidencias([fila({ filaDeLaHoja: 2 }), fila({ filaDeLaHoja: 3 })]);

    expect(csv.trim().split("\n")).toHaveLength(1);
  });

  it("escapa las comas y las comillas, que es lo que rompe un CSV", () => {
    const csv = csvDeIncidencias([
      fila({
        filaDeLaHoja: 2,
        veredicto: "ERROR",
        motivo: 'Motivo con, coma y "comillas"',
        datos: { ...fila({ filaDeLaHoja: 2 }).datos, titulo: "Fate/Zero, edición" },
      }),
    ]);

    expect(csv).toContain('"Fate/Zero, edición"');
    expect(csv).toContain('"Motivo con, coma y ""comillas"""');
  });

  it("NEUTRALIZA una celda que Excel interpretaría como fórmula", () => {
    const csv = csvDeIncidencias([
      fila({
        filaDeLaHoja: 2,
        veredicto: "ERROR",
        motivo: "x",
        datos: { ...fila({ filaDeLaHoja: 2 }).datos, titulo: "=1+1" },
      }),
    ]);

    // Con la comilla delante, Excel lo trata como texto. La celda sigue
    // diciendo lo que decía, y ya no se ejecuta.
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).not.toMatch(/,=1\+1/);
  });

  it("y las otras tres formas de empezar una fórmula", () => {
    for (const peligroso of ["+1", "-1", "@SUM(A1)"]) {
      const csv = csvDeIncidencias([
        fila({
          filaDeLaHoja: 2,
          veredicto: "ERROR",
          motivo: "x",
          datos: { ...fila({ filaDeLaHoja: 2 }).datos, titulo: peligroso },
        }),
      ]);

      expect(csv).toContain(`"'${peligroso}"`);
    }
  });

  it("un título normal NO se toca: la comilla sólo va donde hace falta", () => {
    const csv = csvDeIncidencias([fila({ filaDeLaHoja: 2, veredicto: "ERROR", motivo: "x" })]);

    expect(csv).toContain("Monster");
    expect(csv).not.toContain("'Monster");
  });

  it("una fila sin nada que reportar y sin incidencias deja sólo la cabecera", () => {
    expect(csvDeIncidencias([]).trim()).toBe("Fila,Titulo,Resultado,Motivo");
  });
});

describe("nombreDelReporte", () => {
  it("lleva la fecha, para no sobrescribir el anterior", () => {
    expect(nombreDelReporte(new Date("2026-08-28T10:00:00Z"))).toBe(
      "anime-vault-importacion-2026-08-28.csv",
    );
  });
});
