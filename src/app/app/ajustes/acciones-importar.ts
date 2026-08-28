"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirSesionParaMutar } from "@/auth";
import { exito, fallo, falloDeValidacion, type Respuesta } from "@/lib/api/respuesta";
import { vaultDe } from "@/lib/db";
import { importacionesDe } from "@/lib/db/importaciones";
import { csvDeIncidencias, nombreDelReporte } from "@/lib/import-export/reporte";

import type { FilaPlanificada } from "@/lib/import-export/plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIRMAR LA IMPORTACIÓN — el paso que SÍ escribe.
 *
 * ── EL CLIENTE MANDA NÚMEROS DE FILA, NO DATOS ──────────────────────────
 *
 * Y no es una optimización de payload: es lo que impide que alguien importe en
 * su vault filas que nunca estaban en su fichero. El plan se leyó en el
 * servidor, se guardó en `import_job.report` y de ahí sale lo que se escribe.
 * El navegador sólo dice CUÁLES de esas filas quiere.
 *
 * ── LA REGLA DE LOS LOTES, OTRA VEZ ─────────────────────────────────────
 *
 * Se bloquea por coincidencia EXACTA —la que garantiza el `UNIQUE` de la
 * base—, nunca por similitud. Los tres *Higurashi* del dueño entran los tres.
 *
 * ── UN FALLO DE UNA FILA NO TUMBA LA IMPORTACIÓN ────────────────────────
 *
 * Igual que una portada rota no tumba el seed. Cada fila lleva su resultado y
 * el resumen se cuenta al final; lo que no salió va al CSV de incidencias con
 * su número de fila para que el usuario lo arregle en su hoja.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const EsquemaConfirmar = z.object({
  loteId: z.uuid("Importación no válida"),
  /** Los números de fila de la HOJA, que es lo que el usuario ve marcado. */
  filas: z.array(z.number().int().positive()).min(1, "No has seleccionado ninguna fila").max(5000),
});

export type ResultadoImportacion = {
  readonly creadas: number;
  readonly duplicadas: number;
  readonly errores: number;
  /** El CSV de incidencias, listo para descargar. `null` si no hubo ninguna. */
  readonly csv: string | null;
  readonly nombreCsv: string;
};

export async function confirmarImportacion(
  entrada: unknown,
): Promise<Respuesta<ResultadoImportacion>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaConfirmar.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const importaciones = importacionesDe(sesion.ctx);
  const lote = await importaciones.recuperar(validado.data.loteId);
  // `null` = no existe **o no es suyo**. Indistinguible, como en toda la app.
  if (lote === null) return fallo("NO_ENCONTRADO", "Esa importación ya no está disponible.");

  const pedidas = new Set(validado.data.filas);
  const aImportar = lote.plan.filter((f) => pedidas.has(f.filaDeLaHoja));

  const vault = vaultDe(sesion.ctx);
  const resultado: FilaPlanificada[] = [];
  let creadas = 0;
  let duplicadas = 0;
  let errores = 0;

  for (const fila of aImportar) {
    // Una fila que el servidor marcó como errónea NO se importa aunque el
    // cliente la pida: el veredicto lo decidió quien leyó el fichero.
    if (fila.veredicto === "ERROR") {
      errores += 1;
      resultado.push(fila);
      continue;
    }

    const creado = await vault.crear({
      titulo: fila.datos.titulo,
      estado: fila.datos.estado,
      notas: fila.datos.notas,
      esFavorito: fila.datos.esFavorito,
    });

    if (creado === null) {
      // El `UNIQUE` la rechazó. Es el caso normal de una fila que ya estaba y
      // que el usuario marcó de todas formas: no es un 500, es un duplicado.
      duplicadas += 1;
      resultado.push({ ...fila, veredicto: "DUPLICADA", motivo: "Ya estaba en tu vault" });
      continue;
    }

    // El progreso, con la etiqueta ORIGINAL del usuario. La skill §4 es
    // explícita: se conserva lo que él escribió, no una reescritura nuestra.
    if (fila.datos.progreso !== null) {
      await vault.guardarProgreso(creado.id, {
        kind: "CUSTOM",
        label: fila.datos.progreso,
        temporada: null,
      });
    }

    creadas += 1;
    resultado.push(fila);
  }

  // Las que el usuario NO marcó también van al reporte: son parte de lo que
  // pasó con su fichero, y sin ellas el CSV no explica las cuentas.
  const noPedidas = lote.plan.filter((f) => !pedidas.has(f.filaDeLaHoja));
  const csv = csvDeIncidencias([...resultado, ...noPedidas]);
  const hayIncidencias = csv.trim().split("\n").length > 1;

  await importaciones.anotarResultado(lote.id, { creadas, duplicadas, errores });

  revalidatePath("/app");
  revalidatePath("/app/ajustes");

  return exito({
    creadas,
    duplicadas,
    errores,
    csv: hayIncidencias ? csv : null,
    nombreCsv: nombreDelReporte(new Date()),
  });
}
