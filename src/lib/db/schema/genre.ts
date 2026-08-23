import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { TIPOS_GENERO, listaSql } from "@/lib/domain/enums";

import { anime } from "./anime";

/**
 * Géneros oficiales (AniList) y etiquetas de IA.
 *
 * Son DOS cosas distintas que comparten tabla y se distinguen por `kind`. Nunca
 * se mezclan en la interfaz: oficial va con borde sólido y texto `--gold-300`;
 * IA va con borde punteado, texto `--gold-500` y prefijo `✦`.
 */
export const genre = pgTable(
  "genre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_genre_slug").on(t.slug),
    check("ck_genre_kind", sql`${t.kind} IN (${sql.raw(listaSql(TIPOS_GENERO))})`),
    index("idx_genre_kind").on(t.kind),
  ],
);

export const animeGenre = pgTable(
  "anime_genre",
  {
    animeId: uuid("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => genre.id, { onDelete: "cascade" }),

    /** Confianza de la IA en [0,1]. Nula para los géneros oficiales. */
    confidence: numeric("confidence", { precision: 4, scale: 3 }),

    /** 'ANILIST' | 'CLAUDE' | 'IA_PROPUESTA' | 'USUARIO'. */
    source: text("source"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "pk_anime_genre", columns: [t.animeId, t.genreId] }),
    index("idx_anime_genre_genre").on(t.genreId),
    check(
      "ck_anime_genre_confidence",
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
  ],
);

export type Genero = typeof genre.$inferSelect;
export type AnimeGenero = typeof animeGenre.$inferSelect;
