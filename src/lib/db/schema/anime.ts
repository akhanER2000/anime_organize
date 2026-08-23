import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ESTADOS, FORMATOS, TIPOS_PROGRESO, listaSql } from "@/lib/domain/enums";

import { users } from "./auth";
import { bytea } from "./tipos";

/**
 * El anime y todo lo que cuelga de él.
 *
 * Regla que domina esta familia de tablas: cada fila pertenece a un usuario, por
 * `anime.user_id` directamente o por transitividad a través de `anime_id`.
 * Ninguna consulta cruza usuarios (`.claude/rules/security.md` §1).
 */

export const anime = pgTable(
  "anime",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),

    /**
     * Resultado de `normalizarTitulo`. Clave de deduplicación.
     *
     * CUIDADO: está MATERIALIZADO y participa en un UNIQUE. Cambiar la función de
     * normalización obliga a recalcular todas las filas en la misma migración; si
     * no, quedan duplicados invisibles y colisiones al insertar.
     */
    titleNormalized: text("title_normalized").notNull(),

    titleEnglish: text("title_english"),
    titleNative: text("title_native"),
    synonyms: text("synonyms").array(),

    synopsis: text("synopsis"),
    year: integer("year"),
    format: text("format"),

    totalEpisodes: integer("total_episodes"),
    totalSeasons: integer("total_seasons"),

    status: text("status").notNull(),

    /** 0.0–10.0. `numeric`, nunca `float`: una puntuación no admite error binario. */
    score: numeric("score", { precision: 3, scale: 1 }),

    isFavorite: boolean("is_favorite").notNull().default(false),
    notes: text("notes"),

    anilistId: integer("anilist_id"),
    malId: integer("mal_id"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * ÚLTIMA LÍNEA DE DEFENSA de la deduplicación. La aplicación comprueba antes,
     * pero es la base quien garantiza. Una violación se traduce a
     * `ANIME_DUPLICADO` (409), nunca a un 500.
     */
    uniqueIndex("uq_anime_user_title_norm").on(t.userId, t.titleNormalized),

    check("ck_anime_status", sql`${t.status} IN (${sql.raw(listaSql(ESTADOS))})`),
    check("ck_anime_format", sql`${t.format} IS NULL OR ${t.format} IN (${sql.raw(listaSql(FORMATOS))})`),
    check("ck_anime_score", sql`${t.score} IS NULL OR (${t.score} >= 0 AND ${t.score} <= 10)`),
    check("ck_anime_year", sql`${t.year} IS NULL OR (${t.year} >= 1900 AND ${t.year} <= 2200)`),

    /** Similitud difusa (umbral 0.55) y buscador. Ver `anime-vault-domain` §2. */
    index("idx_anime_title_norm_trgm").using("gin", sql`${t.titleNormalized} gin_trgm_ops`),

    index("idx_anime_user_status").on(t.userId, t.status),
    index("idx_anime_user_updated").on(t.userId, t.updatedAt.desc()),
    index("idx_anime_user_created").on(t.userId, t.createdAt.desc()),
    index("idx_anime_user_year").on(t.userId, t.year),

    /**
     * Dos títulos distintos con el mismo `anilist_id` son el mismo anime.
     * Parcial: la inmensa mayoría de filas lo tienen a NULL hasta que se enriquecen.
     */
    index("idx_anime_user_anilist")
      .on(t.userId, t.anilistId)
      .where(sql`${t.anilistId} IS NOT NULL`),

    index("idx_anime_user_favorito")
      .on(t.userId)
      .where(sql`${t.isFavorite} = true`),
  ],
);

/**
 * Portada. La URL es solo el origen, NUNCA el almacenamiento.
 *
 * `anime_id` es a la vez PK y FK: una portada por anime.
 */
export const animeCover = pgTable(
  "anime_cover",
  {
    animeId: uuid("anime_id")
      .primaryKey()
      .references(() => anime.id, { onDelete: "cascade" }),

    mime: text("mime").notNull(),

    /** Portada 480x720 en WebP 82. NUNCA se selecciona en un listado. */
    bytes: bytea("bytes").notNull(),
    /** Miniatura 100x150 para la vista lista. Tampoco va en los listados. */
    thumbBytes: bytea("thumb_bytes"),

    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),

    /** Solo referencia histórica. Nada de la aplicación lee de aquí. */
    sourceUrl: text("source_url"),

    /** sha256 del binario original: evita re-descargar y re-procesar lo mismo. */
    checksum: text("checksum").notNull(),

    /** Espejo opcional en Drive. Si Drive falla, la app sigue: la BD manda. */
    driveFileId: text("drive_file_id"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    /** Reutilizar los bytes cuando el mismo usuario sube dos veces la misma imagen. */
    index("idx_anime_cover_checksum").on(t.checksum),
    check(
      "ck_anime_cover_mime",
      sql`${t.mime} IN ('image/webp','image/jpeg','image/png','image/avif')`,
    ),
  ],
);

/**
 * Progreso. `anime_id` es PK y FK: como mucho una fila por anime.
 *
 * `label` SIEMPRE se rellena — es lo que pinta la interfaz. Los demás campos son
 * los que permiten calcular la barra y los botones rápidos.
 */
export const progress = pgTable(
  "progress",
  {
    animeId: uuid("anime_id")
      .primaryKey()
      .references(() => anime.id, { onDelete: "cascade" }),

    kind: text("kind").notNull(),
    season: integer("season"),
    episode: integer("episode"),
    percent: integer("percent"),
    label: text("label").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_progress_kind", sql`${t.kind} IN (${sql.raw(listaSql(TIPOS_PROGRESO))})`),
    check(
      "ck_progress_percent",
      sql`${t.percent} IS NULL OR (${t.percent} >= 0 AND ${t.percent} <= 100)`,
    ),
    check("ck_progress_season", sql`${t.season} IS NULL OR ${t.season} >= 0`),
    check("ck_progress_episode", sql`${t.episode} IS NULL OR ${t.episode} >= 0`),
  ],
);

/**
 * Enlace para continuar viendo: la URL exacta del capítulo donde se quedó.
 *
 * El más reciente por `last_used_at` es la acción primaria de la card y la ficha.
 */
export const continueLink = pgTable(
  "continue_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),

    /** Opcional: se puede pegar un enlace suelto sin asociarlo a un sitio. */
    siteId: uuid("site_id"),

    url: text("url").notNull(),
    /** Legible: «AnimeFLV V2 · Ep 7». */
    label: text("label"),
    season: integer("season"),
    episode: integer("episode"),

    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_continue_link_anime_used").on(t.animeId, t.lastUsedAt.desc()),
    /** `javascript:` es XSS: el esquema tampoco lo admite, no solo la validación. */
    check("ck_continue_link_url", sql`${t.url} ~* '^https?://'`),
  ],
);

export type Anime = typeof anime.$inferSelect;
export type AnimeNuevo = typeof anime.$inferInsert;
export type Portada = typeof animeCover.$inferSelect;
export type Progreso = typeof progress.$inferSelect;
export type EnlaceContinuar = typeof continueLink.$inferSelect;
