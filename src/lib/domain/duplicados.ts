import { normalizarTitulo } from "./normalizar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEDUPLICACIÓN — la POLÍTICA, no el cálculo.
 *
 * El parecido entre títulos lo calcula Postgres con `pg_trgm`, que es quien
 * tiene el índice GIN. Lo que vive aquí es la decisión: dada una lista de
 * candidatos con su puntuación, qué se hace.
 *
 * El contrato está en `.claude/skills/anime-vault-domain/SKILL.md` §2 y está
 * validado contra los 83 animes reales del propietario.
 *
 * Módulo puro: no importa nada de `db/`, de `app/` ni de React.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Umbral de similitud trigram por encima del cual se PREGUNTA.
 *
 * Es el mismo número que la consulta pasa a `set_limit()` en Postgres. Los dos
 * lados tienen que decir lo mismo: si aquí fuera más bajo, la aplicación
 * propondría candidatos que la consulta ni siquiera devuelve.
 *
 * **No se toca sin actualizar `duplicados.test.ts`.**
 */
export const UMBRAL_SIMILITUD = 0.55;

/** Cuántos candidatos como mucho se le ofrecen al usuario (artboard 06). */
export const MAXIMO_SIMILARES = 3;

/** Un anime que el usuario YA tiene y que podría ser el que está añadiendo. */
export type Candidato = {
  id: string;
  titulo: string;
  tituloNormalizado: string;
  anilistId: number | null;
  /** `similarity(title_normalized, $1)` de `pg_trgm`, en `[0, 1]`. */
  similitud: number;
};

/** Lo que el usuario quiere dar de alta. El título llega SIN normalizar. */
export type EntradaAlta = {
  titulo: string;
  anilistId: number | null;
};

/**
 * Quién pide el alta.
 *
 * - `interactivo` — hay una persona delante que puede contestar una pregunta.
 * - `lote` — seed o importación de `.xlsx`/`.csv`: nadie va a contestar nada.
 */
export type ModoAlta = "interactivo" | "lote";

export type Veredicto =
  /** (a) Mismo `title_normalized`. Se traduce a `ANIME_DUPLICADO` (409). */
  | { clase: "DUPLICADO_EXACTO"; existente: Candidato }
  /** (b) Mismo `anilist_id`. También `ANIME_DUPLICADO` (409). */
  | { clase: "MISMO_ANILIST"; existente: Candidato }
  /** (c) Parecidos por trigram. NO es un error: 200 con `data.similares`. */
  | { clase: "SIMILARES"; candidatos: readonly Candidato[] }
  /** Nada que se le parezca lo suficiente: adelante. */
  | { clase: "NUEVO" };

export type ClaseVeredicto = Veredicto["clase"];

/**
 * Decide si un alta puede seguir adelante.
 *
 * Tres comprobaciones **en este orden**, y la primera que dispara manda:
 *
 * | # | Comprobación | Efecto |
 * |---|---|---|
 * | (a) | mismo `title_normalized` | **bloquea** → `ANIME_DUPLICADO` (409) |
 * | (b) | mismo `anilist_id` | **bloquea** → `ANIME_DUPLICADO` (409) |
 * | (c) | `similitud > 0.55` | **pregunta**, hasta 3 candidatos (200, `ok: true`) |
 *
 * El orden no es cosmético: (a) y (b) identifican **el mismo registro**, así
 * que reportar «parecidos» cuando ya sabemos cuál es sería peor información.
 *
 * ── POR QUÉ `modo` ES OBLIGATORIO Y NO TIENE VALOR POR DEFECTO ────────────
 *
 * El valor por defecto cómodo sería `"interactivo"`, y sería justo el
 * peligroso: un proceso por lotes que se olvidara del parámetro recibiría
 * `SIMILARES`, que no puede contestar, y lo más probable es que lo tratara
 * como «ya lo tengo, lo salto». Eso **tiraría los tres Higurashi y el segundo
 * White Album** del vault real. Al no haber default, olvidarlo es un error de
 * compilación en vez de una pérdida de datos silenciosa.
 *
 * @param entrada lo que se quiere añadir; el título se normaliza aquí dentro
 * @param candidatos lo que devolvió la consulta al vault DEL MISMO USUARIO
 * @param modo quién pide el alta; ver arriba
 *
 * @example
 * decidirAlta({ titulo: "Death Note", anilistId: null }, vault, "interactivo");
 */
export function decidirAlta(
  entrada: EntradaAlta,
  candidatos: readonly Candidato[],
  modo: ModoAlta,
): Veredicto {
  // La clave de deduplicación sale SIEMPRE de `normalizarTitulo`: es la misma
  // función que materializa `anime.title_normalized`, así que comparar aquí
  // con otra receta abriría un hueco entre la app y el `UNIQUE` de la base.
  const normalizado = normalizarTitulo(entrada.titulo);

  // (a) Coincidencia exacta.
  const exacto = candidatos.find((c) => c.tituloNormalizado === normalizado);
  if (exacto !== undefined) {
    return { clase: "DUPLICADO_EXACTO", existente: exacto };
  }

  // (b) Mismo `anilist_id`: romaji, inglés y sinónimos son la misma obra.
  // El `!== null` de la entrada no es defensivo, es el caso normal: casi todo
  // el vault está sin enriquecer, y sin él dos animes con `anilistId` nulo se
  // considerarían el mismo y el segundo no se podría dar de alta jamás.
  if (entrada.anilistId !== null) {
    const mismoAnilist = candidatos.find((c) => c.anilistId === entrada.anilistId);
    if (mismoAnilist !== undefined) {
      return { clase: "MISMO_ANILIST", existente: mismoAnilist };
    }
  }

  // (c) Similitud. Solo tiene sentido si hay alguien para contestar.
  //
  // REGLA CRÍTICA DEL SEED Y DE LA IMPORTACIÓN: los procesos por lotes NUNCA
  // miran la similitud. `higurashi no naku koro ni` y
  // `higurashi no naku koro ni 2020` pasan de 0,55 de sobra, y son dos series
  // que el propietario tiene A PROPÓSITO. Un seed que descartara por trigram
  // se comería tres animes suyos sin decir nada.
  if (modo === "lote") {
    return { clase: "NUEVO" };
  }

  const similares = candidatos
    // `filter` ya devuelve un array nuevo, así que el `sort` de después no
    // toca la lista que nos pasaron: quien llama la sigue usando.
    .filter((c) => c.similitud > UMBRAL_SIMILITUD)
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, MAXIMO_SIMILARES);

  if (similares.length === 0) {
    return { clase: "NUEVO" };
  }

  return { clase: "SIMILARES", candidatos: similares };
}

/**
 * Si el alta debe detenerse.
 *
 * `SIMILARES` **no** bloquea: es una pregunta con dos botones —«Ver el que
 * tengo» y «Añadir igualmente»— y viaja como 200 con `ok: true`. Solo (a) y
 * (b) se traducen a `ANIME_DUPLICADO` (409).
 */
export function esBloqueante(veredicto: Veredicto): boolean {
  return veredicto.clase === "DUPLICADO_EXACTO" || veredicto.clase === "MISMO_ANILIST";
}
