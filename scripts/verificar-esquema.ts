/**
 * Comprueba que la base tiene de verdad lo que el esquema dice.
 *
 * `npm run db:migrate` terminando sin error solo prueba que el SQL corrió, no
 * que las piezas críticas existan: un índice que se llame distinto, un CHECK que
 * no cuajó o una extensión ausente pasan desapercibidos hasta que fallan en
 * producción.
 *
 *     npx tsx scripts/verificar-esquema.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esNeon } from "@/lib/db/motor";

import { neonConfig, Pool as PoolNeon } from "@neondatabase/serverless";
import { Pool as PoolPg } from "pg";
import ws from "ws";

import { cargarEntorno, vinoDelEntorno } from "./cargar-entorno";
import { anunciarDestino, exigirMismaRama } from "./rama-destino";

cargarEntorno();

/** Lo único que este script usa de un pool: consultar y cerrar. */
type PoolMinimo = {
  query: <T>(texto: string, valores?: unknown[]) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

// ── OJO AL ORDEN: `UNPOOLED` GANA, Y ESO ES UNA TRAMPA AL OPERAR ─────────
//
// Si alguien pasa solo `DATABASE_URL` en la línea de comandos para verificar
// producción, `DATABASE_URL_UNPOOLED` se rellena desde `.env.local` —que apunta
// a desarrollo— y **este script verificaría la rama equivocada diciendo que
// todo está bien**. Pasó al preparar el despliegue y se vio por el anuncio de
// destino, no por el resultado.
//
// Se conserva la precedencia (el DDL y los índices se leen mejor por la
// conexión directa) y se añade el anuncio, que es lo que hace visible cuál de
// las dos ganó.
const variable =
  process.env.DATABASE_URL_UNPOOLED !== undefined ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (url === undefined) {
  console.error("Falta DATABASE_URL_UNPOOLED");
  process.exit(1);
}

/**
 * La cadena, ya comprobada. TypeScript no arrastra el estrechamiento del guard
 * al cuerpo de una función declarada después, y `code-style.md` prohíbe el `!`.
 */
const destino: string = url;

exigirMismaRama();
anunciarDestino(url, { variable, pasadaEnLinea: vinoDelEntorno(variable) });

const TABLAS = [
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "password_reset_tokens",
  "anime",
  "anime_cover",
  "progress",
  "continue_link",
  "genre",
  "anime_genre",
  "streaming_site",
  "streaming_mirror",
  "import_job",
  "ai_job",
  "rate_limit_bucket",
] as const;

const EXTENSIONES = ["citext", "pg_trgm", "unaccent"] as const;

/** Las piezas de las que depende la deduplicación y la seguridad. */
const INDICES_CRITICOS = [
  "uq_anime_user_title_norm",
  "idx_anime_title_norm_trgm",
  "uq_users_email",
  "uq_password_reset_token_hash",
  "pk_rate_limit_bucket",
] as const;

let fallos = 0;
function comprobar(etiqueta: string, ok: boolean, detalle = ""): void {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${etiqueta}${detalle !== "" ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
}

function abrirPool(cadena: string): PoolMinimo {
  if (esNeon(cadena)) {
    neonConfig.webSocketConstructor = ws;
    return new PoolNeon({ connectionString: cadena }) as unknown as PoolMinimo;
  }
  return new PoolPg({ connectionString: cadena }) as unknown as PoolMinimo;
}

async function principal(): Promise<void> {
  const contraNeon = esNeon(destino);
  console.log(`Motor: ${contraNeon ? "neon (websocket)" : "postgres (pg)"}`);

  const pool = abrirPool(destino);

  try {
    console.log("\n=== EXTENSIONES ===");
    const ext = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = ANY($1)",
      [[...EXTENSIONES]],
    );
    const presentes = new Set(ext.rows.map((r) => r.extname));
    for (const e of EXTENSIONES) comprobar(e, presentes.has(e));
    comprobar("pgcrypto ausente (no se usa)", !(await tiene(pool, "pgcrypto")));

    console.log("\n=== TABLAS ===");
    const tab = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    const hay = new Set(tab.rows.map((r) => r.table_name));
    for (const t of TABLAS) comprobar(t, hay.has(t));

    console.log("\n=== ÍNDICES CRÍTICOS ===");
    const idx = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public'",
    );
    const indices = new Set(idx.rows.map((r) => r.indexname));
    for (const i of INDICES_CRITICOS) comprobar(i, indices.has(i));

    console.log("\n=== EL ÍNDICE TRIGRAM ES REALMENTE GIN ===");
    const gin = await pool.query<{ amname: string }>(
      `SELECT am.amname FROM pg_class c
         JOIN pg_am am ON am.oid = c.relam
        WHERE c.relname = 'idx_anime_title_norm_trgm'`,
    );
    comprobar(
      "idx_anime_title_norm_trgm usa GIN",
      gin.rows[0]?.amname === "gin",
      gin.rows[0]?.amname ?? "no existe",
    );

    console.log("\n=== CHECKS DE DOMINIO ===");
    const chk = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype='c' AND con.conname LIKE 'ck_%' AND n.nspname='public'`,
    );
    const nChecks = Number(chk.rows[0]?.n ?? 0);
    comprobar("16 CHECK de dominio", nChecks === 16, `encontrados ${nChecks}`);

    console.log("\n=== CASCADAS (el borrado de cuenta debe ser real) ===");
    // FILTRAR POR ESQUEMA: la rama de Neon trae ademas el esquema `neon_auth`
    // (Neon Auth, que no usamos) con sus propias cascadas. Sin el filtro salen 20.
    const cas = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype='f' AND con.confdeltype='c' AND n.nspname='public'`,
    );
    const nCascadas = Number(cas.rows[0]?.n ?? 0);
    comprobar("14 FK con ON DELETE CASCADE", nCascadas === 14, `encontradas ${nCascadas}`);

    console.log("\n=== ESQUEMAS AJENOS ===");
    const otros = await pool.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%'
          AND nspname NOT IN ('information_schema','public','drizzle')
        ORDER BY nspname`,
    );
    const ajenos = otros.rows.map((r) => r.nspname);
    // No es un fallo: Neon provisiona `neon_auth` (su propio producto de auth) en
    // cada rama, con 9 tablas vacías. NO lo usamos —usamos Auth.js sobre `public`—
    // y se informa para que nadie confunda `neon_auth.user` con `public.users`.
    console.log(
      ajenos.length === 0 ? "  ninguno" : `  presentes, NO los usamos: ${ajenos.join(", ")}`,
    );
    comprobar("nuestras tablas viven en public", hay.has("users") && hay.has("anime"));

    console.log("\n=== users.sessions_valid_from ===");
    const col = await pool.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      // `column_default` NO se consultaba, y esa omisión dejó pasar el fallo
      // durante horas: la migración que quita el `DEFAULT now()` se escribió a
      // mano sin registrarla en el journal de Drizzle, así que **nunca se
      // aplicó**, y este guardián imprimía OK contra una base que seguía
      // teniendo el default del reloj equivocado. Tres documentos afirmaban lo
      // contrario y ninguno miraba la base.
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name='users' AND column_name='sessions_valid_from'`,
    );
    comprobar(
      "existe, timestamptz, NOT NULL",
      col.rows[0]?.data_type === "timestamp with time zone" && col.rows[0]?.is_nullable === "NO",
      `${col.rows[0]?.data_type ?? "ausente"} / nullable=${col.rows[0]?.is_nullable ?? "?"}`,
    );
    comprobar(
      "SIN default (se escribe con el reloj de la aplicación)",
      col.rows[0]?.column_default === null,
      col.rows[0]?.column_default === null
        ? ""
        : `tiene DEFAULT ${String(col.rows[0]?.column_default)} — lo pondría el reloj de ` +
            "Postgres, que va ~600 ms por delante del de la app: la sesión de quien entra " +
            "justo tras registrarse nacería revocada. Ver db-conventions.md § «Dos relojes».",
    );

    console.log("\n=== las migraciones del journal están aplicadas ===");
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf-8"),
    ) as { entries: { tag: string }[] };
    const aplicadas = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations",
    );
    const enDisco = journal.entries.length;
    const enBase = Number(aplicadas.rows[0]?.n ?? "0");
    comprobar(
      `${String(enDisco)} en el journal, ${String(enBase)} aplicadas`,
      enBase >= enDisco,
      enBase >= enDisco
        ? ""
        : "hay migraciones en disco que la base no tiene. Ojo: un `.sql` que NO esté en " +
            "`_journal.json` no se aplica nunca y `db:migrate` no se queja.",
    );

    console.log("\n=== citext funciona de verdad ===");
    const ci = await pool.query<{ igual: boolean }>(
      "SELECT ('A@B.test'::citext = 'a@b.test'::citext) AS igual",
    );
    comprobar("A@B.test = a@b.test", ci.rows[0]?.igual === true);

    console.log("\n=== pg_trgm funciona de verdad ===");
    const sim = await pool.query<{ s: number }>(
      "SELECT similarity('higurashi no naku koro ni', 'higurashi no naku koro ni 2020') AS s",
    );
    const s = Number(sim.rows[0]?.s ?? 0);
    comprobar("similitud > 0.55 entre los dos Higurashi", s > 0.55, `similarity = ${s.toFixed(3)}`);

    console.log(
      fallos === 0
        ? "\nEsquema verificado: todo correcto.\n"
        : `\n${fallos} COMPROBACIONES FALLIDAS.\n`,
    );
  } finally {
    await pool.end();
  }

  process.exit(fallos === 0 ? 0 : 1);
}

async function tiene(pool: PoolMinimo, ext: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM pg_extension WHERE extname = $1", [ext]);
  return r.rows.length > 0;
}

principal().catch((error: unknown) => {
  console.error("\nHa fallado la verificación:\n", error);
  process.exit(1);
});
