import { z } from "zod";

import { ETIQUETA_FORMATO, FORMATOS } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LÓGICA PURA DE LA FICHA — artboard 05.
 *
 * Todo lo que la pantalla decide **sin pintar nada**: si el id de la URL es
 * siquiera un identificador válido, cómo se construye la URL de la portada,
 * qué títulos alternativos hay que enseñar y qué metadatos existen de verdad.
 *
 * Vive en un `.ts` y no dentro del `.tsx` por la misma razón de siempre en este
 * repo: **Vitest corre en `environment: "node"` y no transforma `.tsx`**.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ── EL ID DE LA RUTA SE PARSEA, NO SE PASA A LA BASE A CIEGAS ─────────────
 *
 * `anime.id` es `uuid`. Si llega `/app/anime/hola`, Postgres responde
 * `invalid input syntax for type uuid` y eso sube como **500**, no como 404:
 * la pantalla de error genérica en vez del 404 usable, y un mensaje del driver
 * en los logs por cada visita de un bot a una URL inventada.
 *
 * `api-conventions.md` lo dice con todas las letras: «**Todo** input pasa por
 * Zod antes de tocar lógica: body, `searchParams`, `FormData`, **parámetros de
 * ruta**». Aquí está el de esta pantalla.
 */
const EsquemaIdAnime = z.uuid();

/** ¿Es esto un identificador de anime, o basura en la barra de direcciones? */
export function esIdentificadorDeAnime(valor: string): boolean {
  return EsquemaIdAnime.safeParse(valor).success;
}

/**
 * ── LA PORTADA SALE SIEMPRE DE `/api/covers`, NUNCA DEL DOMINIO ORIGINAL ──
 *
 * Es la invariante que comprueba el e2e crítico del proyecto: los bytes viven
 * en Postgres ya re-encodeados por sharp, y se sirven tras comprobar la
 * propiedad. `anime_cover.source_url` es solo referencia histórica.
 *
 * ── EL `?v=` NO ES DECORACIÓN ────────────────────────────────────────────
 * La respuesta es `immutable` durante un año. Sin el checksum en la URL, un
 * cambio de portada no se vería **nunca**. Sin portada todavía no hay checksum
 * que poner, y el endpoint devuelve el hueco de laja.
 */
export function urlDePortada(animeId: string, checksum: string | null): string {
  const base = `/api/covers/${encodeURIComponent(animeId)}`;
  return checksum === null ? base : `${base}?v=${encodeURIComponent(checksum)}`;
}

/**
 * Los títulos alternativos del artboard: tres líneas bajo el título grande.
 *
 * Reglas, y las tres importan:
 *
 * 1. **No se repite el título principal.** Un anime cuyo `title_english`
 *    coincide con el `title` enseñaría la misma línea dos veces.
 * 2. **No se repiten entre sí** (mismo texto en nativo y en un sinónimo).
 * 3. **Máximo tres**, que es lo que dibuja el artboard. El resto no se pierde:
 *    simplemente no cabe en la ficha.
 *
 * Se compara sin distinguir mayúsculas ni espacios de sobra, pero **se devuelve
 * el texto original**: el usuario escribió lo que escribió.
 */
export function titulosAlternativos(anime: {
  title: string;
  titleNative: string | null;
  titleEnglish: string | null;
  synonyms: string[] | null;
}): string[] {
  const vistos = new Set<string>([clave(anime.title)]);
  const salida: string[] = [];

  for (const candidato of [anime.titleNative, anime.titleEnglish, ...(anime.synonyms ?? [])]) {
    if (salida.length === 3) break;
    if (candidato === null || candidato === undefined) continue;

    const limpio = candidato.trim();
    if (limpio.length === 0) continue;

    const k = clave(limpio);
    if (vistos.has(k)) continue;

    vistos.add(k);
    salida.push(limpio);
  }

  return salida;
}

function clave(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Una fila de la lista de metadatos de la columna izquierda. */
export type MetadatoDeFicha = { etiqueta: string; valor: string };

/**
 * Los metadatos que EXISTEN. Ni uno inventado.
 *
 * El artboard dibuja cuatro filas —Formato, Emisión, Estudio, AniList— con los
 * datos de Frieren, que son de ejemplo. En la base de hoy casi todo eso está a
 * `null` porque el enriquecimiento es otra fase, así que la lista sale corta o
 * vacía. **Eso es lo correcto**: una fila «Estudio —» ocupa sitio para decir
 * que no sabemos nada, y `estudio` ni siquiera es una columna del esquema.
 *
 * Cuando la lista salga vacía, quien llama pinta el estado vacío honesto.
 */
export function metadatosDeFicha(anime: {
  format: string | null;
  year: number | null;
  totalEpisodes: number | null;
  totalSeasons: number | null;
  score: string | null;
  anilistId: number | null;
}): MetadatoDeFicha[] {
  const filas: MetadatoDeFicha[] = [];

  const formato = FORMATOS.find((f) => f === anime.format);
  const partesDeFormato: string[] = [];
  if (formato !== undefined) partesDeFormato.push(ETIQUETA_FORMATO[formato]);
  if (anime.totalEpisodes !== null && anime.totalEpisodes > 0) {
    partesDeFormato.push(`${String(anime.totalEpisodes)} ep`);
  }
  if (partesDeFormato.length > 0) {
    filas.push({ etiqueta: "Formato", valor: partesDeFormato.join(" · ") });
  }

  if (anime.year !== null) {
    filas.push({ etiqueta: "Emisión", valor: String(anime.year) });
  }

  if (anime.totalSeasons !== null && anime.totalSeasons > 0) {
    filas.push({ etiqueta: "Temporadas", valor: String(anime.totalSeasons) });
  }

  // `score` es `numeric(3,1)`: Drizzle lo entrega como string para no perder
  // precisión por el camino. Se enseña tal cual, sin reformatear.
  if (anime.score !== null && anime.score.trim().length > 0) {
    filas.push({ etiqueta: "Puntuación", valor: `${anime.score.trim()} / 10` });
  }

  if (anime.anilistId !== null) {
    filas.push({ etiqueta: "AniList", valor: `#${String(anime.anilistId)}` });
  }

  return filas;
}

// `fechaCorta` vive en `@/lib/ui/fecha`: la pintan la ficha y la lista, y
// tenerla dos veces ya produjo un desfase de un día entre las dos pantallas.
