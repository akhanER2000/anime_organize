import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { dbInterna, type ClienteInterno } from "./interno";
import { aiJob, anime, animeGenre, genre } from "./schema";

import type { DatosDeAniList } from "@/lib/enrich/anilist";
import type { TipoGenero } from "@/lib/domain/enums";
import type { AnalisisValidado } from "@/lib/enrich/claude";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CAPA DE DATOS DEL ENRIQUECIMIENTO.
 *
 * ── `genre` ES GLOBAL, `anime_genre` ES DEL USUARIO ──────────────────────
 *
 * La tabla de géneros no tiene `user_id` y es correcto que no lo tenga: es un
 * catálogo compartido, como los sitios de la semilla. «Mystery» es la misma
 * fila para todo el mundo, y duplicarla por usuario haría imposible filtrar.
 *
 * Lo que SÍ es de cada uno es el **vínculo**: `anime_genre` cuelga de `anime`,
 * que cuelga de `users`. Así que aquí hay otra vez dos reglas y no una:
 *
 * | tabla | propiedad |
 * |---|---|
 * | `genre` | de nadie. Se crea si falta y se reutiliza siempre. |
 * | `anime_genre` | del dueño del anime, por `EXISTS` contra `anime`. |
 *
 * Y una consecuencia que hay que decir en voz alta: **crear un género revela
 * que alguien lo usó**. Es información mínima —el nombre de un género— y es el
 * precio de tener un catálogo compartido; no se puede filtrar nada más por ahí
 * porque `genre` no guarda quién lo creó.
 *
 * ── LO QUE ESCRIBE ANILIST NO PISA LO QUE ESCRIBIÓ EL DUEÑO ──────────────
 *
 * `title`, `status`, `is_favorite` y `notes` **no se tocan nunca**. El
 * enriquecimiento rellena lo que estaba vacío y corrige metadatos de catálogo;
 * si sobrescribiera el título, los 83 animes del dueño pasarían a llamarse como
 * los llama AniList, y su `title_normalized` cambiaría bajo un `UNIQUE`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AnimeParaEnriquecer = {
  readonly id: string;
  readonly titulo: string;
  readonly sinopsis: string | null;
  readonly anilistId: number | null;
};

export function enriquecimientoDe(ctx: ContextoUsuario, cliente: ClienteInterno = dbInterna()) {
  if (!(ctx instanceof ContextoUsuario)) throw new ErrorContextoFalsificado();

  /** Lo mío, y sólo lo mío. */
  const mias = () => eq(anime.userId, ctx.userId);
  const mio = (animeId: string) => and(eq(anime.id, animeId), mias());

  /** El vínculo es mío si el anime lo es. Correlacionado, como los espejos. */
  const vinculoMio = (animeId: string) =>
    sql`exists (select 1 from ${anime} where ${anime.id} = ${animeId} and ${anime.userId} = ${ctx.userId})`;

  /**
   * Da de alta los géneros que falten y devuelve sus ids.
   *
   * `onConflictDoNothing` + un `SELECT` posterior en vez de `returning` a
   * secas: con el conflicto, `returning` no devuelve la fila que YA existía, y
   * quedarse sólo con las nuevas dejaría sin vincular justo los géneros más
   * comunes —los que ya había creado otro anime—.
   */
  async function idsDeGeneros(
    entradas: readonly { slug: string; nombre: string; tipo: "OFICIAL" | "IA" }[],
  ): Promise<Map<string, string>> {
    if (entradas.length === 0) return new Map();

    await cliente
      .insert(genre)
      .values(entradas.map((e) => ({ slug: e.slug, name: e.nombre, kind: e.tipo })))
      .onConflictDoNothing({ target: genre.slug });

    const filas = await cliente
      .select({ id: genre.id, slug: genre.slug })
      .from(genre)
      .where(
        inArray(
          genre.slug,
          entradas.map((e) => e.slug),
        ),
      );

    return new Map(filas.map((f) => [f.slug, f.id]));
  }

  async function vincular(
    animeId: string,
    vinculos: readonly {
      slug: string;
      nombre: string;
      tipo: "OFICIAL" | "IA";
      fuente: string;
      confianza: number | null;
    }[],
  ): Promise<number> {
    if (vinculos.length === 0) return 0;

    const ids = await idsDeGeneros(vinculos);
    const filas = vinculos
      .map((v) => {
        const genreId = ids.get(v.slug);
        return genreId === undefined
          ? null
          : {
              animeId,
              genreId,
              source: v.fuente,
              confidence: v.confianza === null ? null : v.confianza.toFixed(3),
            };
      })
      .filter((f) => f !== null);

    if (filas.length === 0) return 0;

    const insertadas = await cliente
      .insert(animeGenre)
      .values(filas)
      // Repetir el enriquecimiento no debe fallar por la PK compuesta: es
      // idempotente por contrato (`api-conventions.md` § Idempotencia).
      .onConflictDoNothing()
      .returning({ animeId: animeGenre.animeId });

    return insertadas.length;
  }

  return {
    /**
     * Los animes que todavía no han pasado por AniList.
     *
     * `reanalizar` los trae todos: es la escotilla de `{ reanalizar: true }`
     * del contrato, y sin ella un enriquecimiento que salió mal no se podría
     * repetir nunca.
     */
    async pendientes(limite: number, reanalizar = false): Promise<AnimeParaEnriquecer[]> {
      return cliente
        .select({
          id: anime.id,
          titulo: anime.title,
          sinopsis: anime.synopsis,
          anilistId: anime.anilistId,
        })
        .from(anime)
        .where(reanalizar ? mias() : and(mias(), isNull(anime.anilistId)))
        .limit(limite);
    },

    /** Un anime concreto, si es mío. `null` si no existe O no es mío. */
    async uno(animeId: string): Promise<AnimeParaEnriquecer | null> {
      const [fila] = await cliente
        .select({
          id: anime.id,
          titulo: anime.title,
          sinopsis: anime.synopsis,
          anilistId: anime.anilistId,
        })
        .from(anime)
        .where(mio(animeId))
        .limit(1);

      return fila ?? null;
    },

    /**
     * Los géneros de un anime MÍO, listos para la ficha.
     *
     * Devuelve `[]` para el anime de otro sin decir si existe, que es la misma
     * respuesta que da el vault: 404 y nunca 403 (`security.md` §1).
     *
     * El orden pone los OFICIALES primero porque es como los lee la ficha: lo
     * que dice el catálogo, y después lo que propone la IA.
     */
    async generosDeFicha(animeId: string) {
      return cliente
        .select({
          id: genre.id,
          nombre: genre.name,
          // `kind` es `text` en el esquema —`db-conventions.md` prohíbe
          // `pgEnum`— así que Drizzle lo tipa como `string`. Se estrecha aquí,
          // en la frontera, y lo que lo hace CIERTO no es esta línea: es el
          // `CHECK ck_genre_kind` de la columna. Mismo patrón que `sitios.ts`.
          kind: sql<TipoGenero>`${genre.kind}`,
        })
        .from(animeGenre)
        .innerJoin(genre, eq(genre.id, animeGenre.genreId))
        .where(and(eq(animeGenre.animeId, animeId), vinculoMio(animeId)))
        .orderBy(sql`case when ${genre.kind} = 'OFICIAL' then 0 else 1 end`, genre.name);
    },

    /** Los géneros ya vinculados, para dárselos a Claude como contexto. */
    async generosDe(animeId: string): Promise<string[]> {
      const filas = await cliente
        .select({ nombre: genre.name })
        .from(animeGenre)
        .innerJoin(genre, eq(genre.id, animeGenre.genreId))
        .where(and(eq(animeGenre.animeId, animeId), vinculoMio(animeId)));

      return filas.map((f) => f.nombre);
    },

    /**
     * Escribe lo que trajo AniList. Devuelve `null` si el anime no es mío.
     *
     * **Sólo rellena lo que está vacío**, salvo los identificadores y los
     * contadores de catálogo. El título, el estado, el favorito y las notas son
     * del dueño y no se tocan.
     */
    async guardarDeAniList(animeId: string, datos: DatosDeAniList) {
      const [fila] = await cliente
        .update(anime)
        .set({
          anilistId: datos.anilistId,
          // `sql` con COALESCE: lo que ya escribió el dueño gana. Un `??` en JS
          // no serviría —aquí no tenemos la fila delante— y traérsela antes
          // abriría una carrera entre la lectura y la escritura.
          titleEnglish: sql`coalesce(${anime.titleEnglish}, ${datos.tituloIngles})`,
          titleNative: sql`coalesce(${anime.titleNative}, ${datos.tituloNativo})`,
          synopsis: sql`coalesce(${anime.synopsis}, ${datos.sinopsis})`,
          format: sql`coalesce(${anime.format}, ${datos.formato})`,
          totalEpisodes: sql`coalesce(${anime.totalEpisodes}, ${datos.totalEpisodios})`,
          year: sql`coalesce(${anime.year}, ${datos.anio})`,
          score: sql`coalesce(${anime.score}, ${datos.puntuacion})`,
          updatedAt: new Date(),
        })
        .where(mio(animeId))
        .returning({ id: anime.id });

      if (fila === undefined) return null;

      const vinculados = await vincular(
        animeId,
        [...datos.generos, ...datos.etiquetasOficiales].map((nombre) => ({
          slug: nombre
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
          nombre,
          tipo: "OFICIAL" as const,
          fuente: "ANILIST",
          confianza: null,
        })),
      );

      return { id: fila.id, generosVinculados: vinculados };
    },

    /**
     * Escribe el análisis de Claude. Devuelve `null` si el anime no es mío.
     *
     * Las propuestas van con `source = 'IA_PROPUESTA'` y `kind = 'IA'`: quedan
     * marcadas para revisión y **no amplían el vocabulario** (skill §6). El
     * vocabulario sólo crece cuando una persona edita `etiquetas.ts`.
     */
    async guardarDeClaude(animeId: string, analisis: AnalisisValidado) {
      const [fila] = await cliente
        .select({ id: anime.id })
        .from(anime)
        .where(mio(animeId))
        .limit(1);

      if (fila === undefined) return null;

      const vinculados = await vincular(animeId, [
        ...analisis.delVocabulario.map((e) => ({
          slug: e.slug,
          nombre: e.nombre,
          tipo: "IA" as const,
          fuente: "CLAUDE",
          confianza: e.confianza,
        })),
        ...analisis.propuestas.map((e) => ({
          slug: e.slug,
          nombre: e.nombre,
          tipo: "IA" as const,
          fuente: "IA_PROPUESTA",
          confianza: e.confianza,
        })),
      ]);

      return { id: fila.id, etiquetasVinculadas: vinculados };
    },

    /**
     * Deja constancia del intento. **Siempre**, salga bien o mal.
     *
     * Un enriquecimiento que falla en silencio es indistinguible de uno que no
     * se ha lanzado, y el dueño no tendría forma de saber por qué su ficha
     * sigue vacía.
     */
    async registrar(trabajo: {
      readonly animeId: string | null;
      readonly proveedor: "ANILIST" | "ANTHROPIC";
      readonly estado: "PENDIENTE" | "OK" | "ERROR" | "OMITIDO";
      readonly tokensEntrada?: number;
      readonly tokensSalida?: number;
      readonly resultado?: unknown;
      readonly error?: string;
    }) {
      const [fila] = await cliente
        .insert(aiJob)
        .values({
          userId: ctx.userId,
          animeId: trabajo.animeId,
          provider: trabajo.proveedor,
          status: trabajo.estado,
          tokensIn: trabajo.tokensEntrada ?? null,
          tokensOut: trabajo.tokensSalida ?? null,
          // La columna se llama `result`, no `resultado`. Aquí había un
          // `as never` que la callaba: el campo no se habría escrito NUNCA y
          // el insert habría seguido devolviendo una fila, así que ni el
          // typecheck ni un test del efecto lo habrían visto. Por eso
          // `code-style.md` dice que `as` es casi prohibido.
          result: trabajo.resultado ?? null,
          // El error se recorta: puede traer trozos del prompt y de cabeceras
          // del proveedor, y esta tabla la lee el dueño.
          error: trabajo.error === undefined ? null : trabajo.error.slice(0, 500),
        })
        .returning({ id: aiJob.id });

      return fila ?? null;
    },

    /** Los últimos trabajos del usuario, para poder enseñar qué pasó. */
    async ultimosTrabajos(limite = 20) {
      return cliente
        .select({
          id: aiJob.id,
          animeId: aiJob.animeId,
          proveedor: aiJob.provider,
          estado: aiJob.status,
          error: aiJob.error,
          creadoEn: aiJob.createdAt,
        })
        .from(aiJob)
        .where(eq(aiJob.userId, ctx.userId))
        .orderBy(sql`${aiJob.createdAt} desc`)
        .limit(limite);
    },
  };
}

export type Enriquecimiento = ReturnType<typeof enriquecimientoDe>;
