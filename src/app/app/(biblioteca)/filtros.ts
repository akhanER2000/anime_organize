import { ETIQUETA_ESTADO } from "@/lib/domain/enums";
import { hayFiltro } from "@/lib/validation/biblioteca";

import type { FiltrosBiblioteca } from "@/lib/validation/biblioteca";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE ES DE ESTA PANTALLA Y DE NINGUNA OTRA.
 *
 * El parseo de las facetas, el filtrado y los recuentos se comparten con la
 * vista lista y viven en `src/lib/validation/biblioteca.ts` —ahí está contado
 * por qué, y qué divergencia real había cuando estaban duplicados—.
 *
 * Aquí solo quedan los dos textos que pinta la rejilla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * El filtro puesto, en palabras, para el vacío sin resultados.
 *
 * `null` cuando no hay filtro: ese caso no es «sin resultados», es un vault
 * vacío, y son dos pantallas distintas.
 */
export function describirFiltros(filtros: FiltrosBiblioteca): string | null {
  if (!hayFiltro(filtros)) return null;

  const partes: string[] = [];

  if (filtros.estados.length > 0) {
    partes.push(filtros.estados.map((estado) => ETIQUETA_ESTADO[estado]).join(" o "));
  }
  if (filtros.soloFavoritos) {
    partes.push("Favoritos");
  }

  return partes.join(" · ");
}
