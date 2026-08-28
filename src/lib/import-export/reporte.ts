import type { FilaPlanificada, Veredicto } from "./plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL REPORTE DE LA IMPORTACIÓN, EN CSV.
 *
 * ── UN CSV NO ES TEXTO INERTE ───────────────────────────────────────────
 *
 * Lo va a abrir Excel o Google Sheets, y ahí una celda que empieza por `=`,
 * `+`, `-` o `@` **se interpreta como fórmula**. El contenido de este reporte
 * sale del fichero que subió el usuario, así que una celda hostil viaja intacta
 * desde su hoja hasta este CSV y se ejecuta al abrirlo, en su ordenador.
 *
 * Es el mismo razonamiento que el saneado del HTML de AniList: el dato viene de
 * fuera y el destino lo interpreta. Se neutraliza en la puerta, con una comilla
 * delante — la celda sigue diciendo lo que decía y deja de ejecutarse.
 *
 * ── SÓLO LO QUE HAY QUE CONTAR ──────────────────────────────────────────
 *
 * El reporte NO lleva las filas que entraron limpias. Un CSV con las 300
 * buenas dentro esconde las 4 que fallaron, que es justo lo que se venía a
 * mirar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ETIQUETA_VEREDICTO: Readonly<Record<Veredicto, string>> = {
  NUEVA: "Importada",
  DUPLICADA: "Ya estaba en el vault",
  REPETIDA_EN_EL_FICHERO: "Repetida en el fichero",
  ERROR: "No se pudo importar",
};

/** Los cuatro caracteres con los que una hoja de cálculo empieza una fórmula. */
const INICIOS_DE_FORMULA = new Set(["=", "+", "-", "@"]);

function celda(valor: string): string {
  const primero = valor.slice(0, 1);
  // La comilla va DENTRO de las comillas del CSV: así el fichero sigue siendo
  // un CSV válido y la hoja de cálculo lee el contenido como texto.
  const seguro = INICIOS_DE_FORMULA.has(primero) ? `'${valor}` : valor;

  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Las incidencias, y sólo las incidencias.
 *
 * Una fila entra en el reporte si NO es una `NUEVA` limpia: los errores, las
 * duplicadas, las repetidas, y las que entraron pero con algo que decir.
 */
export function csvDeIncidencias(plan: readonly FilaPlanificada[]): string {
  const lineas = ["Fila,Titulo,Resultado,Motivo"];

  for (const fila of plan) {
    const hayAvisos = fila.avisos.length > 0;
    if (fila.veredicto === "NUEVA" && !hayAvisos) continue;

    const motivo = [fila.motivo, ...fila.avisos].filter((m) => m !== null && m !== "").join(". ");

    lineas.push(
      [
        String(fila.filaDeLaHoja),
        celda(fila.datos.titulo),
        celda(ETIQUETA_VEREDICTO[fila.veredicto]),
        celda(motivo),
      ].join(","),
    );
  }

  // Salto final: un CSV sin él deja la última fila pegada a lo que venga
  // detrás en algunos lectores.
  return `${lineas.join("\n")}\n`;
}

/** Con la fecha, para no sobrescribir el reporte de la importación anterior. */
export function nombreDelReporte(ahora: Date): string {
  return `anime-vault-importacion-${ahora.toISOString().slice(0, 10)}.csv`;
}
