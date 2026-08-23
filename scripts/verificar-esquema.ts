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
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

import { cargarEntorno } from "./cargar-entorno";

cargarEntorno();
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (url === undefined) {
  console.error("Falta DATABASE_URL_UNPOOLED");
  process.exit(1);
}

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

async function principal(): Promise<void> {
  const pool = new Pool({ connectionString: url });

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
    const col = await pool.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name='users' AND column_name='sessions_valid_from'`,
    );
    comprobar(
      "existe, timestamptz, NOT NULL",
      col.rows[0]?.data_type === "timestamp with time zone" && col.rows[0]?.is_nullable === "NO",
      `${col.rows[0]?.data_type ?? "ausente"} / nullable=${col.rows[0]?.is_nullable ?? "?"}`,
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

async function tiene(pool: Pool, ext: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM pg_extension WHERE extname = $1", [ext]);
  return r.rows.length > 0;
}

principal().catch((error: unknown) => {
  console.error("\nHa fallado la verificación:\n", error);
  process.exit(1);
});
