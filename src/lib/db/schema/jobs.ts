import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { ESTADOS_TRABAJO, listaSql } from "@/lib/domain/enums";

import { anime } from "./anime";
import { users } from "./auth";

/** Registro de una importación de .xlsx/.csv, con su reporte de errores. */
export const importJob = pgTable(
  "import_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsCreated: integer("rows_created").notNull().default(0),
    rowsDuplicate: integer("rows_duplicate").notNull().default(0),
    rowsError: integer("rows_error").notNull().default(0),

    /** Detalle por fila, para poder descargar el CSV de errores. */
    report: jsonb("report"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("idx_import_job_user").on(t.userId, t.createdAt.desc())],
);

/**
 * Un intento de enriquecimiento. Registra tokens y errores.
 *
 * `anime_id` es nulo cuando el trabajo es de lote y aún no se ha asignado.
 */
export const aiJob = pgTable(
  "ai_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    animeId: uuid("anime_id").references(() => anime.id, { onDelete: "cascade" }),

    /** 'ANILIST' | 'ANTHROPIC'. */
    provider: text("provider").notNull(),
    status: text("status").notNull(),

    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),

    result: jsonb("result"),
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_ai_job_status", sql`${t.status} IN (${sql.raw(listaSql(ESTADOS_TRABAJO))})`),
    index("idx_ai_job_user").on(t.userId, t.createdAt.desc()),
    index("idx_ai_job_anime").on(t.animeId),
  ],
);

export type TrabajoImportacion = typeof importJob.$inferSelect;
export type TrabajoIa = typeof aiJob.$inferSelect;
