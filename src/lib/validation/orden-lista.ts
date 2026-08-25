import { z } from "zod";

import { ESTADOS } from "@/lib/domain/enums";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ORDEN DE LA LISTA — vive en la URL, como los filtros.
 *
 * `api-conventions.md` § «Paginación y filtros»: «El estado de filtros vive en
 * la URL, no en el cliente: una vista se comparte pegando el enlace». El orden
 * es exactamente lo mismo, y por los mismos tres motivos: el botón de atrás
 * funciona, recargar no lo pierde, y se puede mandar el enlace ya ordenado.
 *
 * Por eso las cabeceras de la tabla son ENLACES, no botones con `useState`.
 *
 * ── SE ORDENA EN EL SERVIDOR, SOBRE LAS FILAS YA TRAÍDAS ──────────────────
 *
 * Una sola consulta trae las 83 filas (`vault.listar`), y el orden se aplica en
 * memoria. No es pereza: `listar()` no acepta orden ni filtro, y añadírselo
 * significaría tocar `src/lib/db/vault.ts`, que no es de esta pantalla. Con
 * ≤500 filas ordenar en memoria es irrelevante, y lo que importa —una consulta,
 * no 83— se respeta igual.
 *
 * ── LOS EMPATES SE ROMPEN SIEMPRE POR TÍTULO ASCENDENTE ───────────────────
 *
 * `Array.prototype.sort` es estable desde ES2019, pero eso solo garantiza que
 * conserva el orden PREVIO, que aquí es el de la base (`updated_at DESC`). Sin
 * un desempate explícito, ordenar por Estado dejaría las 69 filas `VISTO` en un
 * orden que cambia cada vez que el usuario toca cualquier anime. Un orden que
 * baila entre recargas parece un fallo aunque no lo sea.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Las columnas por las que se puede ordenar. Las demás no tienen orden útil. */
export const CAMPOS_ORDEN = ["titulo", "estado", "actualizado"] as const;
export type CampoOrden = (typeof CAMPOS_ORDEN)[number];

export const DIRECCIONES = ["asc", "desc"] as const;
export type Direccion = (typeof DIRECCIONES)[number];

export type Orden = { campo: CampoOrden; direccion: Direccion };

/**
 * Lo que se ve al entrar sin nada en la URL: lo último tocado arriba.
 *
 * Coincide con el `ORDER BY updated_at DESC` de `vault.listar()`, así que la
 * primera pintada no reordena nada.
 */
export const ORDEN_POR_DEFECTO: Orden = { campo: "actualizado", direccion: "desc" };

/** Lo mínimo que necesita una fila para poder ordenarse. */
export type FilaOrdenable = {
  titulo: string;
  estado: Estado;
  actualizadoEn: Date;
};

/**
 * `searchParams` con basura NO rompe la página.
 *
 * `api-conventions.md`: «Se parsean con un esquema Zod que aplica valores por
 * defecto y descarta basura sin romper la página». `.catch()` cubre los tres
 * casos de una vez: parámetro ausente, parámetro repetido con un valor absurdo
 * y parámetro con un valor inventado (`?orden=DROP TABLE`).
 */
const EsquemaOrden = z.object({
  orden: z.enum(CAMPOS_ORDEN).catch(ORDEN_POR_DEFECTO.campo),
  dir: z.enum(DIRECCIONES).catch(ORDEN_POR_DEFECTO.direccion),
});

/** Lo que Next entrega en `searchParams`: un valor, varios, o nada. */
// `ParametrosCrudos` ya no se declara aquí: lo define `biblioteca.ts` y lo
// comparten los dos esquemas de `searchParams`. Dos alias idénticos del mismo
// tipo es la clase de duplicación que deja de serlo el día que uno cambia.
export type { ParametrosCrudos } from "./biblioteca";

import type { ParametrosCrudos } from "./biblioteca";

/** Se queda con el PRIMER valor si el parámetro viene repetido. */
function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function leerOrden(parametros: ParametrosCrudos): Orden {
  const { orden, dir } = EsquemaOrden.parse({
    orden: primerValor(parametros["orden"]),
    dir: primerValor(parametros["dir"]),
  });

  return { campo: orden, direccion: dir };
}

/**
 * Al pulsar una cabecera: si ya se ordenaba por ella, se da la vuelta; si no,
 * se empieza por la dirección natural de ese campo.
 *
 * «Natural» no es siempre `asc`: un título se lee de la A a la Z, pero una fecha
 * se mira por lo más reciente. Pulsar «Actualizado» y obtener 2019 arriba sería
 * técnicamente coherente y prácticamente inútil.
 */
const DIRECCION_NATURAL: Readonly<Record<CampoOrden, Direccion>> = {
  titulo: "asc",
  estado: "asc",
  actualizado: "desc",
};

export function siguienteOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo !== campo) {
    return { campo, direccion: DIRECCION_NATURAL[campo] };
  }

  return { campo, direccion: actual.direccion === "asc" ? "desc" : "asc" };
}

/**
 * El valor de `aria-sort` de una cabecera.
 *
 * Es lo que hace que un lector de pantalla anuncie «ordenado ascendente» al
 * llegar a la columna. Sin esto, la flechita de la cabecera es información que
 * solo existe para quien la ve.
 */
export function ariaSort(actual: Orden, campo: CampoOrden): "ascending" | "descending" | "none" {
  if (actual.campo !== campo) return "none";
  return actual.direccion === "asc" ? "ascending" : "descending";
}

/**
 * La URL que deja puesto un orden, CONSERVANDO los filtros que ya hubiera.
 *
 * Perder el filtro al reordenar es el fallo clásico de esta pantalla: la
 * persona filtra «Viendo», ordena por título y de repente vuelve a tener 83
 * filas. Por eso se parte de los parámetros actuales y solo se reemplazan los
 * dos del orden.
 */
export function enlaceDeOrden(ruta: string, parametros: ParametrosCrudos, orden: Orden): string {
  const siguiente = new URLSearchParams();

  // Las facetas se REPITEN (`?estado=VISTO&estado=VIENDO`), así que se copian
  // una a una en vez de con `set`, que se quedaría con la última.
  for (const [clave, valor] of Object.entries(parametros)) {
    if (clave === "orden" || clave === "dir") continue;
    if (valor === undefined) continue;

    if (Array.isArray(valor)) {
      for (const uno of valor) siguiente.append(clave, uno);
    } else {
      siguiente.append(clave, valor);
    }
  }

  siguiente.set("orden", orden.campo);
  siguiente.set("dir", orden.direccion);

  return `${ruta}?${siguiente.toString()}`;
}

/**
 * Comparador de títulos: el ÚNICO desempate, y el orden principal del campo
 * `titulo`.
 *
 * `localeCompare` con locale `es` porque el vault está en español y los títulos
 * llevan acentos y ancho completo japonés: un `<` sobre code points pondría
 * `Ángel` detrás de `Zorro`. `numeric` para que `White Album 2` vaya después de
 * `White Album` y no entre `White Album 10` y `White Album 19`.
 */
function compararTitulos(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

/**
 * El orden del dominio, no el alfabético: VISTO, VIENDO, EN_ESPERA, ABANDONADO,
 * PENDIENTE. Sale de `ESTADOS`, que es la única lista del proyecto, en vez de
 * una tabla de pesos copiada aquí que se desincronizaría en cuanto cambie.
 */
function pesoDeEstado(estado: Estado): number {
  return ESTADOS.indexOf(estado);
}

function comparar<T extends FilaOrdenable>(a: T, b: T, campo: CampoOrden): number {
  switch (campo) {
    case "titulo":
      return compararTitulos(a.titulo, b.titulo);
    case "estado":
      return pesoDeEstado(a.estado) - pesoDeEstado(b.estado);
    case "actualizado":
      return a.actualizadoEn.getTime() - b.actualizadoEn.getTime();
  }
}

/**
 * Devuelve una copia ordenada. **No muta la entrada**: las filas vienen del
 * vault y ordenarlas en el sitio sería tocar el resultado de una consulta que
 * alguien más puede estar leyendo.
 */
export function ordenar<T extends FilaOrdenable>(filas: readonly T[], orden: Orden): T[] {
  const signo = orden.direccion === "asc" ? 1 : -1;

  return [...filas].sort((a, b) => {
    const principal = comparar(a, b, orden.campo) * signo;
    if (principal !== 0) return principal;

    // El desempate NO se invierte con la dirección: si lo hiciera, dos listas
    // ordenadas por estado (asc y desc) no serían una la inversa de la otra por
    // partes, y el orden dentro de un mismo estado cambiaría al invertir.
    return compararTitulos(a.titulo, b.titulo);
  });
}
