import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { dbInterna, type ClienteInterno } from "./interno";
import { importJob } from "./schema";

import { EsquemaPlan } from "@/lib/import-export/plan";

import type { FilaPlanificada } from "@/lib/import-export/plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL LOTE DE IMPORTACIÓN, GUARDADO ENTRE LOS DOS PASOS.
 *
 * ── POR QUÉ EL PLAN VIVE EN LA BASE Y NO EN EL NAVEGADOR ────────────────
 *
 * La importación son dos pasos: subir y mirar, y después confirmar. Entre uno
 * y otro hay que guardar el plan en alguna parte, y las dos alternativas
 * fallan:
 *
 * · **Devolvérselo al cliente y que lo reenvíe.** Cinco mil filas de vuelta por
 *   el valor de una Server Action se pasan del presupuesto de payload de
 *   Vercel (1 MiB). Y peor: el cliente podría reenviar filas que nunca estaban
 *   en su fichero, así que habría que revalidarlo todo igualmente.
 * · **Guardarlo en memoria del servidor.** En serverless, la segunda petición
 *   cae en otra instancia y el plan no está. Es el mismo motivo por el que el
 *   limitador vive en Postgres y no en un `Map`.
 *
 * Así que va en `import_job.report`, que es exactamente para lo que existe la
 * columna. El cliente sólo devuelve **números de fila**, y el servidor coge los
 * datos de su propia copia: lo que se importa es siempre lo que se leyó del
 * fichero, no lo que el navegador diga que se leyó.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type LoteGuardado = {
  readonly id: string;
  readonly nombreFichero: string;
  readonly plan: readonly FilaPlanificada[];
};

export function importacionesDe(ctx: ContextoUsuario, cliente: ClienteInterno = dbInterna()) {
  if (!(ctx instanceof ContextoUsuario)) throw new ErrorContextoFalsificado();

  const mio = (loteId: string) => and(eq(importJob.id, loteId), eq(importJob.userId, ctx.userId));

  return {
    /** Guarda el plan y devuelve el id del lote. */
    async guardarPlan(nombreFichero: string, plan: readonly FilaPlanificada[]) {
      const [fila] = await cliente
        .insert(importJob)
        .values({
          userId: ctx.userId,
          filename: nombreFichero.slice(0, 255),
          rowsTotal: plan.length,
          // Los recuentos definitivos se escriben al confirmar. Aquí van a
          // cero a propósito: un lote que se sube y no se confirma **no ha
          // importado nada**, y dejar el recuento del plan haría creer lo
          // contrario a quien lea la tabla.
          rowsCreated: 0,
          rowsDuplicate: 0,
          rowsError: 0,
          report: plan,
        })
        .returning({ id: importJob.id });

      return fila ?? null;
    },

    /** Recupera un lote MÍO. `null` si no existe o no es mío. */
    async recuperar(loteId: string): Promise<LoteGuardado | null> {
      const [fila] = await cliente
        .select({
          id: importJob.id,
          nombreFichero: importJob.filename,
          report: importJob.report,
        })
        .from(importJob)
        .where(mio(loteId))
        .limit(1);

      if (fila === undefined) return null;

      // Se PARSEA, no se castea. La base es una frontera (`code-style.md`)
      // aunque el plan lo escribiéramos nosotros: entre el guardado y la
      // lectura cabe un despliegue con otra forma del tipo o una fila tocada a
      // mano, y de aquí salen los animes que se escriben en el vault.
      const analisis = EsquemaPlan.safeParse(fila.report);
      if (!analisis.success) return null;

      return { id: fila.id, nombreFichero: fila.nombreFichero, plan: analisis.data };
    },

    /** Cierra el lote con lo que de verdad pasó. */
    async anotarResultado(
      loteId: string,
      recuento: { readonly creadas: number; readonly duplicadas: number; readonly errores: number },
    ) {
      const [fila] = await cliente
        .update(importJob)
        .set({
          rowsCreated: recuento.creadas,
          rowsDuplicate: recuento.duplicadas,
          rowsError: recuento.errores,
        })
        .where(mio(loteId))
        .returning({ id: importJob.id });

      return fila ?? null;
    },

    /** El historial, para que el dueño pueda mirar qué importó y cuándo. */
    async historial(limite = 10) {
      return cliente
        .select({
          id: importJob.id,
          nombreFichero: importJob.filename,
          total: importJob.rowsTotal,
          creadas: importJob.rowsCreated,
          duplicadas: importJob.rowsDuplicate,
          errores: importJob.rowsError,
          creadoEn: importJob.createdAt,
        })
        .from(importJob)
        .where(eq(importJob.userId, ctx.userId))
        .orderBy(sql`${importJob.createdAt} desc`)
        .limit(limite);
    },
  };
}

export type Importaciones = ReturnType<typeof importacionesDe>;
