/**
 * Aplica las migraciones pendientes.
 *
 * Usa `Pool` (conexión persistente) y no el driver HTTP: el DDL va en
 * transacción y el pooler de Neon no sirve para esto. Por eso lee
 * DATABASE_URL_UNPOOLED.
 *
 * ── DOS MOTORES, PORQUE HAY DOS CLASES DE POSTGRES ──────────────────────
 *
 * Contra **Neon** se habla su protocolo por WebSocket (`@neondatabase/serverless`).
 * Contra un **Postgres normal** —el contenedor `postgres:18` de CI— ese protocolo
 * no existe: no hay proxy de Neon al otro lado, así que la conexión muere antes
 * de la primera consulta. Ahí se usa `pg`.
 *
 * ESTO ES POR QUÉ CI NUNCA PASÓ. El workflow levanta un contenedor a propósito
 * —repositorio público, sin secreto que rotar, base vacía por ejecución— y este
 * script intentaba hablarle por WebSocket. Fallaba en la primera migración y
 * arrastraba a los tests y al build. Veinte ejecuciones, veinte fallos, y el
 * badge del README en rojo desde que se creó.
 *
 * La elección NO es nueva: `src/lib/db/cliente-test.ts` ya la hacía igual para
 * los tests de integración. Lo que faltaba era que este script la hiciera
 * también — un caso de libro de «el mismo concepto resuelto dos veces, y solo
 * una de las dos copias completa».
 *
 *     npm run db:migrate
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { esNeon } from "@/lib/db/motor";

import { neonConfig, Pool as PoolNeon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrarNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migrarPg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PoolPg } from "pg";
import ws from "ws";

import { cargarEntorno, vinoDelEntorno } from "./cargar-entorno";
import { anunciarDestino, exigirMismaRama } from "./rama-destino";

cargarEntorno();

/**
 * Lo ÚNICO que este script necesita de un pool: consultar y cerrar.
 *
 * Los dos `Pool` —el de Neon y el de `pg`— tienen firmas de `query`
 * incompatibles entre sí, así que una variable con el tipo unión no compila.
 * Declarar la forma que de verdad se usa evita un `as any` y además deja
 * escrito qué parte del driver depende de esto: dos métodos.
 */
type PoolMinimo = {
  query: <T>(texto: string, valores?: unknown[]) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

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

/**
 * La cadena, ya comprobada.
 *
 * El guard de arriba sale con `process.exit`, pero TypeScript no arrastra ese
 * estrechamiento al cuerpo de una función declarada después. Fijarlo aquí evita
 * un `!` —que `code-style.md` prohíbe— sin repetir la comprobación.
 */
const destino: string = url;

// Antes de tocar nada: contra qué base. Las dos ramas de Neon se parecen lo
// bastante como para confundirlas, y migrar la equivocada no tiene deshacer.
exigirMismaRama();
anunciarDestino(url, { variable, pasadaEnLinea: vinoDelEntorno(variable) });

const carpeta = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Comprueba que las extensiones existen ANTES de intentar crear las tablas. */
async function comprobarExtensiones(pool: PoolMinimo): Promise<void> {
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

type Conexion = { pool: PoolMinimo; migrar: () => Promise<void> };

function abrirNeon(cadena: string): Conexion {
  neonConfig.webSocketConstructor = ws;
  const pool = new PoolNeon({ connectionString: cadena });
  return {
    pool: pool as unknown as PoolMinimo,
    migrar: () => migrarNeon(drizzleNeon(pool), { migrationsFolder: carpeta }),
  };
}

function abrirPg(cadena: string): Conexion {
  const pool = new PoolPg({ connectionString: cadena });
  return {
    pool: pool as unknown as PoolMinimo,
    migrar: () => migrarPg(drizzlePg(pool), { migrationsFolder: carpeta }),
  };
}

async function principal(): Promise<void> {
  const journal = JSON.parse(readFileSync(`${carpeta}/meta/_journal.json`, "utf-8")) as {
    entries: { tag: string }[];
  };

  console.log(`\nMigraciones en el repositorio (${journal.entries.length}):`);
  for (const e of journal.entries) console.log(`  · ${e.tag}`);

  // El motor se elige por el destino, no por el entorno: así `npm run db:migrate`
  // se comporta igual lo lances contra Neon o contra un contenedor.
  const contraNeon = esNeon(destino);

  console.log(`Motor: ${contraNeon ? "neon (websocket)" : "postgres (pg)"}`);

  const { pool, migrar } = contraNeon ? abrirNeon(destino) : abrirPg(destino);

  try {
    const { rows } = await pool.query<{ v: string }>("SELECT version() AS v");
    console.log(`\nConectado a: ${rows[0]?.v.split(",")[0] ?? "?"}`);

    await comprobarExtensiones(pool);

    console.log("\nAplicando...");
    await migrar();
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
