/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEXTOS QUE APARECEN EN MÁS DE UNA PANTALLA.
 *
 * ── EL CONTADOR DECÍA DOS COSAS DISTINTAS EN EL MISMO HUECO ───────────────
 *
 * La rejilla escribía «83 de 83 series» y la vista lista «83 series», en el
 * mismo sitio visual —mono, `--ash-400`, a la derecha del titular— y para el
 * mismo dato. Con el conmutador de vista puesto, cambiar de rejilla a lista
 * cambiaba el texto sin cambiar nada de lo que describe.
 *
 * La lista tenía además su propia regla: sin filtro decía «83 series» y con
 * filtro «12 de 83 series». Es defendible por separado —«83 de 83» es
 * redundante— pero convierte el contador en dos formatos que aparecen y
 * desaparecen, y quien mira no sabe si el número de la izquierda es «los que se
 * ven» o «los que hay».
 *
 * Gana la forma constante: **siempre «N de M»**. Es la del artboard, y el
 * artboard fija la FORMA aunque su «10 de 10» sea de sus diez animes de ejemplo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** «83 de 83 series» · «1 de 83 series» · «0 de 1 serie». */
export function textoContador(mostrados: number, total: number): string {
  return `${String(mostrados)} de ${String(total)} ${total === 1 ? "serie" : "series"}`;
}
