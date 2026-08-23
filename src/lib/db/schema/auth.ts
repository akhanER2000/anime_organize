import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { citext } from "./tipos";

/**
 * Usuarios y tablas de Auth.js v5.
 *
 * La sesión es JWT, así que `sessions` queda creada pero sin uso: el adaptador
 * de Drizzle la espera y encenderla más tarde no debe requerir una migración.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** `citext`: `Juan@x.com` y `juan@x.com` son la MISMA cuenta. */
    email: citext("email").notNull(),

    /**
     * Nulo cuando el usuario solo entra por OAuth y nunca ha puesto contraseña.
     * Argon2id; ver `.claude/rules/security.md` §2.
     */
    passwordHash: text("password_hash"),

    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),

    /** Estándar de Auth.js: marca de verificación del email. */
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),

    /**
     * Desactivación administrativa. NO es el borrado que pide el usuario: ese es
     * real y en cascada (`security.md` §3). No se usa para simular una papelera.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_users_email").on(t.email),
    index("idx_users_deleted_at").on(t.deletedAt),
  ],
);

/**
 * Cuentas OAuth vinculadas. Tabla estándar de Auth.js.
 *
 * Se crea COMPLETA aunque Google esté desactivado: retrofitear esta tabla con
 * datos ya en producción es caro, y el `UNIQUE (provider, provider_account_id)`
 * es lo que impide que la misma cuenta del proveedor se vincule a dos usuarios.
 *
 * La política de vinculación está cerrada en `.claude/rules/security.md` §2 bis:
 * NUNCA automática por coincidencia de email; solo desde Ajustes, con sesión.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "pk_accounts",
      columns: [t.provider, t.providerAccountId],
    }),
    index("idx_accounts_user").on(t.userId),
  ],
);

/**
 * Sesiones en base de datos. Creada por compatibilidad con el adaptador; la
 * estrategia actual es JWT, así que en la práctica queda vacía.
 */
export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

/** Tokens de verificación de email. Tabla estándar de Auth.js. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ name: "pk_verification_tokens", columns: [t.identifier, t.token] })],
);

/**
 * Recuperación de contraseña.
 *
 * Se guarda SOLO el sha256 del token, nunca el token. Si alguien lee la tabla no
 * puede usar nada de lo que hay dentro. Caduca a 1 h y se marca `used_at` en la
 * misma transacción en que se consume: un token usado responde exactamente igual
 * que uno inválido.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** sha256 en hexadecimal del token enviado por email. */
    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_password_reset_token_hash").on(t.tokenHash),
    // Para limpiar los caducados sin recorrer la tabla entera.
    index("idx_password_reset_expires")
      .on(t.expiresAt)
      .where(sql`${t.usedAt} IS NULL`),
    index("idx_password_reset_user").on(t.userId),
  ],
);

export type Usuario = typeof users.$inferSelect;
export type UsuarioNuevo = typeof users.$inferInsert;
export type CuentaOAuth = typeof accounts.$inferSelect;
export type TokenReset = typeof passwordResetTokens.$inferSelect;
