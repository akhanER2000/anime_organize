import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { TIPOS_SITIO, listaSql } from "@/lib/domain/enums";

import { users } from "./auth";

/**
 * Hub de sitios de streaming.
 *
 * `is_global = true` son la semilla compartida; `user_id` no nulo son los que
 * añade cada usuario. Los dominios espejo CAMBIAN con frecuencia: se siembran
 * los conocidos y el usuario los edita desde Ajustes. No son verdad permanente.
 */
export const streamingSite = pgTable(
  "streaming_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    brandColor: text("brand_color"),
    iconKey: text("icon_key"),

    isGlobal: boolean("is_global").notNull().default(false),
    /** Nulo cuando `is_global`. No nulo cuando lo añade un usuario. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_streaming_site_slug").on(t.slug),
    check("ck_streaming_site_kind", sql`${t.kind} IN (${sql.raw(listaSql(TIPOS_SITIO))})`),
    /** Un sitio es global O de un usuario, nunca las dos cosas ni ninguna. */
    check(
      "ck_streaming_site_propiedad",
      sql`(${t.isGlobal} = true AND ${t.userId} IS NULL) OR (${t.isGlobal} = false AND ${t.userId} IS NOT NULL)`,
    ),
    index("idx_streaming_site_user").on(t.userId),
  ],
);

/**
 * Espejos ("versiones") de un sitio: V1, V2, V3…
 *
 * «Comprobar espejos» hace HEAD y marca `is_active = false` los caídos.
 * NUNCA se borra un espejo automáticamente: se desactiva.
 */
export const streamingMirror = pgTable(
  "streaming_mirror",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => streamingSite.id, { onDelete: "cascade" }),

    label: text("label").notNull(),
    url: text("url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_streaming_mirror_site").on(t.siteId, t.sort),
    check("ck_streaming_mirror_url", sql`${t.url} ~* '^https?://'`),
  ],
);

export type SitioStreaming = typeof streamingSite.$inferSelect;
export type EspejoStreaming = typeof streamingMirror.$inferSelect;
