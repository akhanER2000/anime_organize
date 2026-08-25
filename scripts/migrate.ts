/**
 * Aplica las migraciones pendientes.
 *
 * Usa `Pool` (WebSocket) y no el driver HTTP: el DDL va en transacción y el
 * pooler de Neon no sirve para esto. Por eso lee DATABASE_URL_UNPOOLED.
 *
 *     npm run db:migrate
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";

import { cargarEntorno, vinoDelEntorno } from "./cargar-entorno";
import { anunciarDestino } from "./rama-destino";

cargarEntorno();

// El driver por WebSocket necesita una implementación de WS en Node.
neonConfig.webSocketConstructor = ws;

const variable =
  process.env.DATABASE_URL_UNPOOLED !== undefined ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (url === undefined || url.trim().length === 0) {
  console.error(
    "\nFalta DATABASE_URL_UNPOOLED (o DATABASE_URL).\n" +
      "Es la cadena DIRECTA de Neon, la que NO lleva '-pooler' en el host.\n" +
      "El DDL largo no va por el pooler.\n" +
      "Ver .env.example y el README §1.\n",
  );
  process.exit(1);
}

// Antes de tocar nada: contra qué base. Las dos ramas de Neon se parecen lo
// bastante como para confundirlas, y migrar la equivocada no tiene deshacer.
anunciarDestino(url, { variable, pasadaEnLinea: vinoDelEntorno(variable) });

const carpeta = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Comprueba que las extensiones existen ANTES de intentar crear las tablas. */
async function comprobarExtensiones(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ extname: string }>(
    "SELECT extname FROM pg_extension WHERE extname = ANY($1)",
    [["citext", "pg_trgm", "unaccent"]],
  );
  const presentes = new Set(rows.map((r) => r.extname));
  const faltan = ["citext", "pg_trgm", "unaccent"].filter((e) => !presentes.has(e));

  if (faltan.length > 0) {
    console.log(`  extensiones por crear: ${faltan.join(", ")} (las crea la migración 0000)`);
  } else {
    console.log("  extensiones: citext, pg_trgm, unaccent ya presentes");
  }
}

async function principal(): Promise<void> {
  const journal = JSON.parse(readFileSync(`${carpeta}/meta/_journal.json`, "utf-8")) as {
    entries: { tag: string }[];
  };

  console.log(`\nMigraciones en el repositorio (${journal.entries.length}):`);
  for (const e of journal.entries) console.log(`  · ${e.tag}`);

  const pool = new Pool({ connectionString: url });

  try {
    const { rows } = await pool.query<{ v: string }>("SELECT version() AS v");
    console.log(`\nConectado a: ${rows[0]?.v.split(",")[0] ?? "?"}`);

    await comprobarExtensiones(pool);

    console.log("\nAplicando...");
    await migrate(drizzle(pool), { migrationsFolder: carpeta });
    console.log("Migraciones aplicadas.\n");

    // Recuento de tablas, para poder ver de un vistazo que cuajó.
    const { rows: tablas } = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    console.log(`Tablas en el esquema public: ${tablas[0]?.n ?? "?"}\n`);
  } finally {
    await pool.end();
  }
}

principal().catch((error: unknown) => {
  console.error("\nLa migración ha fallado:\n", error);
  process.exit(1);
});
