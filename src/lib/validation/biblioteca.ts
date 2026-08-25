import { z } from "zod";

import { ESTADOS } from "@/lib/domain/enums";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS FACETAS DE LA BIBLIOTECA — un solo parseador para las DOS vistas.
 *
 * ── POR QUÉ ESTO VIVE AQUÍ Y NO EN LA CARPETA DE UNA PANTALLA ─────────────
 *
 * La rejilla (`/app`) y la lista (`/app/lista`) comparten `BarraFiltros`, así
 * que leen los MISMOS `?estado=` y `?favorito=` de la MISMA barra. Cada una
 * llegó con su propio parseador —las escribieron dos agentes distintos, cada
 * uno confinado a su carpeta— y **no hacían lo mismo**:
 *
 *   · el orden de `estados`: una lo devolvía en el orden canónico de `ESTADOS`,
 *     la otra en el orden en que venían en la URL. Eso cambia el texto del
 *     vacío sin resultados: «Visto o Viendo» contra «Viendo o Visto» para el
 *     mismo filtro.
 *   · `?favorito=`: una miraba **todos** los valores, la otra **solo el
 *     primero**. Con `?favorito=0&favorito=1`, una filtraba y la otra no.
 *
 * Ninguna de las dos estaba mal por separado. Lo que estaba mal era que la
 * misma URL significara dos cosas según en qué vista la pegaras, con los mismos
 * chips arriba prometiendo lo mismo. Por eso `api-conventions.md` § «Validación»
 * dice que los esquemas viven aquí y se comparten: **un esquema por concepto**.
 *
 * ── LO QUE SE ELIGIÓ AL UNIFICAR, Y POR QUÉ ───────────────────────────────
 *
 *   · **Orden canónico.** El texto del filtro tiene que ser estable: el mismo
 *     conjunto de estados se lee siempre igual, venga como venga en la URL.
 *   · **`favorito` se activa si aparece un "1" en cualquier posición.** Es lo
 *     que escribe `BarraFiltros` (un único `favorito=1`), así que para toda URL
 *     real las dos lecturas coinciden; la diferencia solo existía para URLs
 *     escritas a mano, y ahí gana la interpretación literal de lo que se pide.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `searchParams` tal cual llega de Next, sin tocar. */
export type ParametrosCrudos = Record<string, string | string[] | undefined>;

/**
 * Solo se declaran las facetas que la biblioteca entiende.
 *
 * Un `z.object` **descarta las claves que no conoce**, así que `?utm_source=…`
 * o `?estado[]=…` entran y salen sin efecto. No hace falta una lista negra.
 */
const EsquemaFacetas = z.object({
  estado: z.union([z.string(), z.array(z.string())]).optional(),
  favorito: z.union([z.string(), z.array(z.string())]).optional(),
});

export type FiltrosBiblioteca = {
  /** Estados seleccionados, siempre en el orden canónico de `ESTADOS`. */
  readonly estados: readonly Estado[];
  readonly soloFavoritos: boolean;
};

export const SIN_FILTROS: FiltrosBiblioteca = { estados: [], soloFavoritos: false };

/** Lo mínimo que necesita una fila —card o fila de tabla— para filtrarse. */
export type FilaFiltrable = {
  readonly estado: Estado;
  readonly esFavorito: boolean;
};

/** `?estado=VISTO` y `?estado=VISTO&estado=VIENDO` se tratan igual. */
function comoLista(valor: string | string[] | undefined): readonly string[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/**
 * Traduce la URL a un filtro del dominio. **Nunca lanza.**
 *
 * @param crudos el objeto de `searchParams`, tal cual llega
 */
export function parsearFiltros(crudos: unknown): FiltrosBiblioteca {
  const leido = EsquemaFacetas.safeParse(crudos);
  const datos: z.infer<typeof EsquemaFacetas> = leido.success ? leido.data : {};

  // Se recorre ESTADOS —y no lo que llegó— y eso hace TRES cosas a la vez:
  // descarta cualquier valor que no sea un estado del dominio, elimina los
  // duplicados (`?estado=VISTO&estado=VISTO` cuenta una vez), y fija un orden
  // estable. Sin lo último, `?estado=VIENDO&estado=VISTO` y
  // `?estado=VISTO&estado=VIENDO` describirían el mismo filtro con dos textos
  // distintos en el vacío sin resultados.
  const pedidos = new Set(comoLista(datos.estado));
  const estados = ESTADOS.filter((estado) => pedidos.has(estado));

  // Solo el "1" exacto activa, que es lo que escribe `BarraFiltros` al construir
  // el enlace. `?favorito=0`, `?favorito=false` y `?favorito=` no activan nada:
  // ante la duda, no se filtra.
  const soloFavoritos = comoLista(datos.favorito).includes("1");

  return { estados, soloFavoritos };
}

/** ¿Hay algún filtro puesto? Distingue «vault vacío» de «filtro sin resultados». */
export function hayFiltro(filtros: FiltrosBiblioteca): boolean {
  return filtros.estados.length > 0 || filtros.soloFavoritos;
}

/**
 * Aplica el filtro. Los estados se acumulan con O; los favoritos con Y.
 *
 * `?estado=VISTO&estado=VIENDO&favorito=1` es «(visto o viendo) **y** favorito»,
 * que es lo que espera cualquiera que haya usado una faceta: dentro de un grupo
 * se suma, entre grupos se restringe.
 */
export function filtrarFilas<T extends FilaFiltrable>(
  filas: readonly T[],
  filtros: FiltrosBiblioteca,
): T[] {
  const permitidos = new Set<Estado>(filtros.estados);

  return filas.filter(
    (fila) =>
      (permitidos.size === 0 || permitidos.has(fila.estado)) &&
      (!filtros.soloFavoritos || fila.esFavorito),
  );
}

/**
 * Cuántas filas hay de cada estado, sobre el vault ENTERO.
 *
 * ── SOBRE TODO EL VAULT, NO SOBRE LO FILTRADO ─────────────────────────────
 * El chip «Viendo 10» tiene que decir cuántos hay, no cuántos quedan después de
 * aplicarse a sí mismo. Un recuento calculado sobre el resultado haría que todo
 * chip activo mostrara su propio total y los demás cero.
 *
 * El tipo es `Record<Estado, number>` completo y no `Partial`: si mañana se
 * añade un sexto estado a `ESTADOS`, este objeto deja de compilar y el chip
 * nuevo no puede nacer con un recuento fantasma.
 */
export function contarPorEstado(filas: readonly FilaFiltrable[]): Record<Estado, number> {
  const recuentos: Record<Estado, number> = {
    VISTO: 0,
    VIENDO: 0,
    EN_ESPERA: 0,
    ABANDONADO: 0,
    PENDIENTE: 0,
  };

  for (const fila of filas) {
    recuentos[fila.estado] += 1;
  }

  return recuentos;
}

/** Cuántos favoritos, para su chip. */
export function contarFavoritos(filas: readonly FilaFiltrable[]): number {
  return filas.filter((fila) => fila.esFavorito).length;
}

/**
 * La misma lectura, pero desde un `URLSearchParams` del cliente.
 *
 * ── POR QUÉ HACE FALTA ESTA PUERTA ────────────────────────────────────────
 *
 * `BarraFiltros` corre en el navegador y recibe un `URLSearchParams`, no el
 * objeto de `searchParams` del servidor. Como no encajaba, se hizo su propia
 * lectura — y era el **TERCER** parseador de las mismas dos facetas.
 *
 * Y divergía justo donde más se nota: usaba `parametros.get("favorito")`, que
 * devuelve **solo el primer valor**, mientras el servidor mira todos. Con
 * `?favorito=0&favorito=1` la rejilla filtraba a favoritos y **el chip aparecía
 * apagado**, con «Todos» encendido. El chip decía una cosa y la pantalla hacía
 * otra, que es peor que cualquiera de las dos por separado.
 *
 * Convertir a objeto y delegar cuesta cuatro líneas y garantiza que la barra
 * describe exactamente lo que la página está aplicando.
 */
export function parsearFiltrosDeUrl(parametros: URLSearchParams): FiltrosBiblioteca {
  const crudos: ParametrosCrudos = {};

  for (const clave of new Set(parametros.keys())) {
    const valores = parametros.getAll(clave);
    crudos[clave] = valores.length === 1 ? valores[0] : valores;
  }

  return parsearFiltros(crudos);
}
