import { z } from "zod";

import { FORMATOS } from "@/lib/domain/enums";

import type { Formato } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PASO 1 DEL ENRIQUECIMIENTO — ANILIST (GraphQL público).
 *
 * ── LA SINOPSIS ES HTML DE UN TERCERO ────────────────────────────────────
 *
 * `description` llega con marcado: `<br>`, `<i>`, `<b>`, y a veces enlaces. Se
 * guarda **texto plano**, sanitizado aquí, en el servidor (`security.md` §9).
 *
 * El motivo no es la estética. Guardar HTML de un tercero significa que
 * cualquier día alguien lo pinte con `dangerouslySetInnerHTML` —porque «es que
 * los saltos de línea se ven mal»— y eso es XSS almacenado con la fuente ya
 * dentro de nuestra base. Se corta en la puerta: lo que entra ya no es HTML.
 *
 * ── EL ORDEN DEL SANEADO IMPORTA, Y ES CONTRAINTUITIVO ───────────────────
 *
 * Primero se quitan las etiquetas y DESPUÉS se decodifican las entidades. Al
 * revés, `&lt;script&gt;` se convertiría en `<script>` justo después de haber
 * pasado el filtro. Está fijado con un test.
 *
 * ── NADA SE INVENTA ──────────────────────────────────────────────────────
 *
 * AniList tiene formatos que nuestro `CHECK` no admite (`TV_SHORT`, `MUSIC`).
 * Se descartan y queda `null`. Traducir `MUSIC` a `TV` sería escribir en el
 * vault del dueño un dato que nadie le ha dicho — y la tercera regla del
 * proyecto es que no se inventan datos de sus animes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ENDPOINT_ANILIST = "https://graphql.anilist.co";

/**
 * De qué rango entra un tag como género oficial.
 *
 * AniList puntúa cada tag de 0 a 100 según cuánta gente lo confirma.
 *
 * MEDIDO sobre *Higurashi no Naku Koro ni* (2026-08-28): con el umbral en 70
 * entran **15 tags**, y los de la cola son «Urban Fantasy» y «Male
 * Protagonist», los dos exactamente en 70. Ese último no dice nada de ninguna
 * serie. Con el umbral en 80 quedan 10, y el más flojo es «Achronological
 * Order» (85), que sí describe la obra.
 *
 * No es una preferencia: es lo que separa una ficha con etiquetas útiles de una
 * con una manta de chips que nadie lee.
 */
export const RANGO_MINIMO_TAG = 80;

/**
 * Y un tope, porque el rango no acota la cantidad.
 *
 * Una serie muy etiquetada puede tener veinte tags por encima de 80. La ficha
 * los pinta todos como chips y el diseño no prevé esa fila. Se cogen los ocho
 * mejores; los géneros de `genres` van aparte y entran siempre.
 */
export const MAXIMO_TAGS = 8;

const Titulo = z.object({
  romaji: z.string().nullish(),
  english: z.string().nullish(),
  native: z.string().nullish(),
});

const Tag = z.object({
  name: z.string(),
  rank: z.number().nullish(),
  isGeneralSpoiler: z.boolean().nullish(),
  isMediaSpoiler: z.boolean().nullish(),
});

/**
 * Casi todo es opcional, y no por prudencia: en AniList lo es de verdad. Hay
 * fichas sin sinopsis, sin puntuación, sin episodios y sin año.
 */
export const EsquemaMedia = z.object({
  id: z.number(),
  title: Titulo,
  synonyms: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  format: z.string().nullish(),
  episodes: z.number().nullish(),
  seasonYear: z.number().nullish(),
  startDate: z.object({ year: z.number().nullish() }).nullish(),
  averageScore: z.number().nullish(),
  genres: z.array(z.string()).nullish(),
  coverImage: z.object({ extraLarge: z.string().nullish() }).nullish(),
  tags: z.array(Tag).nullish(),
});

export type MediaAniList = z.infer<typeof EsquemaMedia>;

/**
 * `Media: null` es la respuesta normal cuando no hay coincidencia, no un error.
 * Una respuesta SIN `data` sí lo es: ahí AniList devolvió `errors`.
 */
export const EsquemaRespuestaAniList = z.object({
  data: z.object({ Media: EsquemaMedia.nullable() }),
});

const ENTIDADES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * HTML de AniList → texto plano.
 *
 * Devuelve `null` cuando no queda nada: una sinopsis vacía y una sinopsis
 * ausente son lo mismo para quien la lee, y guardar `""` obligaría a todo el
 * código de arriba a comprobar dos casos en vez de uno.
 */
export function aTextoPlano(bruto: string | null | undefined): string | null {
  if (bruto === null || bruto === undefined) return null;

  const texto = bruto
    // Los `<br>` son los párrafos de AniList: se conservan como saltos ANTES de
    // que el barrido de etiquetas se los lleve por delante.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    // Contenedores con cuerpo: se van ENTEROS. Quitar sólo las marcas dejaría
    // el cuerpo del script como texto de la sinopsis.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    // Las entidades, AL FINAL: decodificarlas antes reconstruiría etiquetas
    // que acaban de pasar el filtro.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (entera, nombre: string) => ENTIDADES[nombre.toLowerCase()] ?? entera)
    // Espacio horizontal colapsado, saltos limitados a dos: AniList encadena
    // cuatro `<br>` con frecuencia y eso deja un agujero en la ficha.
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
    .trim();

  return texto === "" ? null : texto;
}

export type DatosDeAniList = {
  readonly anilistId: number;
  readonly tituloRomaji: string | null;
  readonly tituloIngles: string | null;
  readonly tituloNativo: string | null;
  readonly sinonimos: readonly string[];
  readonly sinopsis: string | null;
  readonly formato: Formato | null;
  readonly totalEpisodios: number | null;
  readonly anio: number | null;
  /** Como cadena: `numeric` en Drizzle es `string` y así no se pierde precisión. */
  readonly puntuacion: string | null;
  readonly generos: readonly string[];
  /** Tags de rango alto y SIN spoiler. Entran como género `OFICIAL`. */
  readonly etiquetasOficiales: readonly string[];
  readonly portadaUrl: string | null;
};

function formatoConocido(bruto: string | null | undefined): Formato | null {
  if (bruto === null || bruto === undefined) return null;
  return FORMATOS.find((f) => f === bruto) ?? null;
}

export function mapearMedia(media: MediaAniList): DatosDeAniList {
  return {
    anilistId: media.id,
    tituloRomaji: media.title.romaji ?? null,
    tituloIngles: media.title.english ?? null,
    tituloNativo: media.title.native ?? null,
    sinonimos: media.synonyms ?? [],
    sinopsis: aTextoPlano(media.description),
    formato: formatoConocido(media.format),
    totalEpisodios: media.episodes ?? null,
    anio: media.seasonYear ?? media.startDate?.year ?? null,
    // 0–100 → 0.0–10.0. La columna es `numeric(3,1)`: un 84 tal cual no cabe.
    puntuacion:
      media.averageScore === null || media.averageScore === undefined
        ? null
        : (media.averageScore / 10).toFixed(1),
    generos: media.genres ?? [],
    etiquetasOficiales: (media.tags ?? [])
      // El spoiler no se enseña NUNCA, por muy confirmado que esté. Es el peor
      // fallo que puede tener la ficha de algo que el dueño no ha visto aún.
      .filter((t) => t.isGeneralSpoiler !== true && t.isMediaSpoiler !== true)
      .filter((t) => (t.rank ?? 0) >= RANGO_MINIMO_TAG)
      // Los mejores primero, y sólo los mejores.
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, MAXIMO_TAGS)
      .map((t) => t.name),
    portadaUrl: media.coverImage?.extraLarge ?? null,
  };
}
