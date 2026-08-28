import { z } from "zod";

import { ESTADOS } from "@/lib/domain/enums";
import { normalizarTitulo } from "@/lib/domain/normalizar";

import type { FilaLeida } from "./mapeo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PLAN: QUÉ SE VA A ESCRIBIR, ANTES DE ESCRIBIRLO.
 *
 * ── POR QUÉ HAY UN PLAN Y NO SE IMPORTA DIRECTAMENTE ────────────────────
 *
 * Porque el usuario tiene que poder MIRARLO. Una importación de 300 filas que
 * se ejecuta al pulsar «subir» es irreversible en la práctica: deshacerla es
 * borrar 300 animes a mano. El plan se enseña, se corrige y se ejecuta.
 *
 * Es lógica pura: sin base, sin red y sin React. Se le pasan las filas leídas y
 * el conjunto de títulos normalizados que ya están en el vault, y decide.
 *
 * ── LA REGLA CRÍTICA: LOS LOTES NO BLOQUEAN POR SIMILITUD ───────────────
 *
 * Skill §2, y es la que protege los datos del dueño: se bloquea por
 * **coincidencia exacta del título normalizado** y por `anilist_id`, nunca por
 * trigram. Los tres *Higurashi* y los dos *White Album* de su lista están ahí a
 * propósito y son series distintas; un filtro por similitud se llevaría dos de
 * cada grupo sin preguntar.
 *
 * La similitud es para el alta interactiva, donde hay una persona decidiendo
 * caso por caso. Aquí hay 300 filas y un botón.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Veredicto = "NUEVA" | "DUPLICADA" | "REPETIDA_EN_EL_FICHERO" | "ERROR";

export type FilaPlanificada = {
  /** El número que el usuario ve en su hoja: la cabecera es la 1. */
  readonly filaDeLaHoja: number;
  readonly datos: FilaLeida;
  readonly veredicto: Veredicto;
  /** Por qué, en español y listo para el CSV de errores. `null` si es nueva. */
  readonly motivo: string | null;
  readonly avisos: readonly string[];
  /** Lo que se va a importar. El usuario puede cambiarlo antes de ejecutar. */
  readonly seleccionada: boolean;
};

export function planificar(
  filas: readonly FilaLeida[],
  yaEnElVault: ReadonlySet<string>,
): FilaPlanificada[] {
  /** Lo visto en ESTE fichero, con la fila donde apareció por primera vez. */
  const vistos = new Map<string, number>();

  return filas.map((datos, indice) => {
    // +2: la fila 1 de la hoja es la cabecera, y el índice empieza en 0. El
    // usuario va a abrir su Excel y buscar el número que le demos.
    const filaDeLaHoja = indice + 2;
    const base = { filaDeLaHoja, datos, avisos: datos.avisos };

    if (datos.errores.length > 0) {
      // Y NO entra en `vistos`: una fila sin título no puede hacer que la
      // siguiente fila sin título se marque como repetida.
      return {
        ...base,
        veredicto: "ERROR" as const,
        motivo: datos.errores.join(". "),
        seleccionada: false,
      };
    }

    const normalizado = normalizarTitulo(datos.titulo);

    if (yaEnElVault.has(normalizado)) {
      return {
        ...base,
        veredicto: "DUPLICADA" as const,
        motivo: "Ya está en tu vault",
        // Deseleccionada, pero se puede volver a marcar: quizá el usuario
        // quiera reimportarla. La base lo rechazará con `ANIME_DUPLICADO`, que
        // es un mensaje claro y no un 500.
        seleccionada: false,
      };
    }

    const primera = vistos.get(normalizado);
    if (primera !== undefined) {
      return {
        ...base,
        veredicto: "REPETIDA_EN_EL_FICHERO" as const,
        motivo: `Repetida: ya aparece en la fila ${String(primera)}`,
        seleccionada: false,
      };
    }

    vistos.set(normalizado, filaDeLaHoja);
    return { ...base, veredicto: "NUEVA" as const, motivo: null, seleccionada: true };
  });
}

/**
 * El plan, para PARSEARLO al volver de la base.
 *
 * `code-style.md`: «los datos que cruzan una frontera (HTTP, **BD**, fichero,
 * IA) se parsean, no se castean». La base es una frontera aunque lo que haya
 * dentro lo escribiéramos nosotros: entre la escritura y la lectura puede haber
 * una migración, un despliegue con otra forma del tipo, o una fila tocada a
 * mano. Un `as` aquí convertiría cualquiera de esas cosas en un anime escrito
 * con datos que no son los que se leyeron del fichero.
 */
export const EsquemaFilaPlanificada = z.object({
  filaDeLaHoja: z.number().int().positive(),
  datos: z.object({
    titulo: z.string(),
    estado: z.enum(ESTADOS),
    progreso: z.string().nullable(),
    notas: z.string().nullable(),
    esFavorito: z.boolean(),
    portada: z.string().nullable(),
    enlace: z.string().nullable(),
    errores: z.array(z.string()),
    avisos: z.array(z.string()),
  }),
  veredicto: z.enum(["NUEVA", "DUPLICADA", "REPETIDA_EN_EL_FICHERO", "ERROR"]),
  motivo: z.string().nullable(),
  avisos: z.array(z.string()),
  seleccionada: z.boolean(),
});

export const EsquemaPlan = z.array(EsquemaFilaPlanificada);

export type ResumenPlan = {
  readonly total: number;
  readonly nuevas: number;
  readonly duplicadas: number;
  readonly repetidas: number;
  readonly errores: number;
  readonly seleccionadas: number;
};

export function resumirPlan(plan: readonly FilaPlanificada[]): ResumenPlan {
  const cuenta = (v: Veredicto): number => plan.filter((f) => f.veredicto === v).length;

  return {
    total: plan.length,
    nuevas: cuenta("NUEVA"),
    duplicadas: cuenta("DUPLICADA"),
    repetidas: cuenta("REPETIDA_EN_EL_FICHERO"),
    errores: cuenta("ERROR"),
    seleccionadas: plan.filter((f) => f.seleccionada).length,
  };
}
