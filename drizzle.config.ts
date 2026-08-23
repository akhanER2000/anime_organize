import { defineConfig } from "drizzle-kit";

/**
 * Las migraciones y los scripts usan la cadena UNPOOLED (conexion directa):
 * el DDL largo no va por el pooler de Neon.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
