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

/** Lo mínimo que necesita una celda del cruce para poder sumarse. */
export type CeldaContable = {
  readonly estado: Estado;
  readonly favorito: boolean;
  readonly n: number;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CUÁNTOS COINCIDEN CON EL FILTRO, CONTADO EN LA BASE.
 *
 * ── EL AGREGADO QUE ERA EL TOPE DISFRAZADO ────────────────────────────────
 *
 * Las dos pantallas escribían el contador con `visibles.length` y
 * `todos.length` sobre el resultado de `listar()`, que trae como mucho
 * `LIMITE_LISTADO` filas. Con 83 animes sale bien. Con 600, la rejilla diría
 * «500 de 600» y la lista «500 series»: el 500 no es una cuenta, es el tope.
 *
 * Y es invisible hasta el día que deja de serlo, porque no falla — miente con
 * un número plausible.
 *
 * ── POR QUÉ SE SUMA AQUÍ Y NO SE PIDE OTRA CONSULTA ───────────────────────
 *
 * Porque la suma es sobre **agregados que ya calculó Postgres**: diez celdas
 * como mucho, ninguna afectada por ningún tope. Sumar diez números en
 * JavaScript no reintroduce el problema; sumar 500 filas de una consulta
 * acotada sí. La diferencia no es dónde se suma: es **sobre qué**.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function contarCoincidentes(
  matriz: readonly CeldaContable[],
  filtros: FiltrosBiblioteca,
): number {
  const permitidos = new Set<Estado>(filtros.estados);

  return matriz.reduce((suma, celda) => {
    if (permitidos.size > 0 && !permitidos.has(celda.estado)) return suma;
    if (filtros.soloFavoritos && !celda.favorito) return suma;
    return suma + celda.n;
  }, 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA URL SIN FACETAS — «quitar el filtro», en un solo sitio.
 *
 * ── HABÍA DOS FORMAS DE QUITAR EL FILTRO Y HACÍAN COSAS DISTINTAS ─────────
 *
 * El chip «Todos» borraba `estado` y `favorito` y **conservaba el resto** de la
 * query. La salida del vacío sin resultados era un `href="/app"` a pelo, que
 * **tiraba la query entera**.
 *
 * Desde `/app/lista?estado=ABANDONADO&orden=titulo&dir=asc`, pulsar el chip
 * dejaba el orden puesto y pulsar el botón del vacío lo perdía. Dos controles
 * que dicen lo mismo, en la misma pantalla, haciendo cosas distintas — y el que
 * más se usa cuando NO hay resultados es justo el que se llevaba por delante lo
 * que el usuario había elegido.
 *
 * ── QUÉ GANA, Y POR QUÉ ───────────────────────────────────────────────────
 *
 * Se conserva todo lo que no sean las dos facetas. «Quitar el filtro» quiere
 * decir quitar EL FILTRO, no reiniciar la pantalla: el orden es una preferencia
 * distinta y no tiene por qué caerse con él.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function urlSinFacetas(
  ruta: string,
  parametros: URLSearchParams | ParametrosCrudos,
): string {
  // Acepta las dos formas porque los dos controles viven a lados distintos de
  // la frontera: el chip es cliente y recibe un `URLSearchParams`; el vacío se
  // pinta en el servidor, donde `searchParams` es un objeto plano. Convertir
  // aquí es lo que permite que la ruta de decisión sea UNA.
  const siguiente =
    parametros instanceof URLSearchParams
      ? new URLSearchParams(parametros.toString())
      : paramsDeCrudos(parametros);

  siguiente.delete("estado");
  siguiente.delete("favorito");

  const cadena = siguiente.toString();
  return cadena === "" ? ruta : `${ruta}?${cadena}`;
}

/** El inverso de lo que hace `parsearFiltrosDeUrl` al entrar. */
function paramsDeCrudos(crudos: ParametrosCrudos): URLSearchParams {
  const salida = new URLSearchParams();

  for (const [clave, valor] of Object.entries(crudos)) {
    if (valor === undefined) continue;
    // Un array es una faceta repetida (`?estado=A&estado=B`): se repite igual,
    // porque colapsarlo a una cadena cambiaría lo que la URL significa.
    if (Array.isArray(valor)) for (const uno of valor) salida.append(clave, uno);
    else salida.append(clave, valor);
  }

  return salida;
}
