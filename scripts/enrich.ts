/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENRIQUECIMIENTO MASIVO — AniList (paso 1) + Claude (paso 2).
 *
 *     npm run enrich                       los que aún no han pasado por AniList
 *     npm run enrich -- --limite 10        sólo los diez primeros
 *     npm run enrich -- --reanalizar       también los ya enriquecidos
 *     npm run enrich -- --sin-ia           sólo metadatos, sin gastar en Claude
 *     npm run enrich -- --dry-run          dice a cuántos afectaría y no toca nada
 *
 * ── SIN CLAVE DE ANTHROPIC NO FALLA ──────────────────────────────────────
 *
 * El paso 2 se salta con aviso y el paso 1 sigue funcionando (skill §6). Es el
 * caso NORMAL en este proyecto, no una avería: `ANTHROPIC_API_KEY` es opcional.
 *
 * ── ANUNCIA SU DESTINO, COMO EL SEED ─────────────────────────────────────
 *
 * Escribe en `anime`, en `genre` y en `anime_genre` de una cuenta concreta.
 * Equivocarse de rama de Neon no tiene deshacer, y ya pasó dos veces en este
 * proyecto (`testing.md`, fallos 3 y 6). `exigirMismaRama()` para antes de
 * escribir si las dos variables apuntan a sitios distintos.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { eq } from "drizzle-orm";

import { contextoDeScript } from "../src/lib/db/contexto-fuera-de-sesion";
import { enriquecimientoDe } from "../src/lib/db/enriquecimiento";
import { dbInterna } from "../src/lib/db/interno";
import { users } from "../src/lib/db/schema";
import { hayClaveDeIa, modeloConfigurado } from "../src/lib/enrich/consultas";
import { enriquecerLote } from "../src/lib/enrich/orquestar";
import { cargarEntorno, vinoDelEntorno } from "./cargar-entorno";
import { anunciarDestino, exigirMismaRama } from "./rama-destino";

cargarEntorno();

exigirMismaRama();
anunciarDestino(process.env.DATABASE_URL ?? "", {
  variable: "DATABASE_URL",
  pasadaEnLinea: vinoDelEntorno("DATABASE_URL"),
});

const argumentos = process.argv.slice(2);
const banderas = new Set(argumentos);
const REANALIZAR = banderas.has("--reanalizar");
const SIN_IA = banderas.has("--sin-ia");
const ENSAYO = banderas.has("--dry-run");

function limitePedido(): number {
  const i = argumentos.indexOf("--limite");
  if (i === -1) return 500;
  const bruto = Number(argumentos[i + 1]);
  if (!Number.isInteger(bruto) || bruto <= 0) {
    throw new Error("--limite necesita un entero positivo detrás. Ej: --limite 10");
  }
  return bruto;
}

function correoDelPropietario(): string {
  const email = process.env.SEED_OWNER_EMAIL;
  if (email === undefined || email.trim() === "") {
    throw new Error(
      "Falta SEED_OWNER_EMAIL. El enriquecimiento trabaja sobre el vault de UNA " +
        "persona concreta, así que hay que decir de quién. Ver .env.example.",
    );
  }
  return email.trim().toLowerCase();
}

async function principal(): Promise<void> {
  const db = dbInterna();
  const email = correoDelPropietario();

  const [duenno] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (duenno === undefined) {
    throw new Error(
      `No hay ninguna cuenta con ${email} en esta base. ` +
        "Corre `npm run seed` antes, o revisa que la rama sea la que crees.",
    );
  }

  const datos = enriquecimientoDe(
    contextoDeScript(duenno.id, "npm run enrich, lanzado por el dueño del vault"),
    db,
  );
  const pendientes = await datos.pendientes(limitePedido(), REANALIZAR);

  console.log(`\n  ${String(pendientes.length)} animes por enriquecer`);
  console.log(
    SIN_IA
      ? "  paso 2 (IA): desactivado por --sin-ia"
      : hayClaveDeIa()
        ? `  paso 2 (IA): ${modeloConfigurado()}`
        : "  paso 2 (IA): OMITIDO — falta ANTHROPIC_API_KEY (no es un fallo)",
  );

  if (ENSAYO) {
    console.log("\n  [ensayo] no se ha escrito nada.\n");
    for (const uno of pendientes.slice(0, 10)) console.log(`    · ${uno.titulo}`);
    if (pendientes.length > 10) console.log(`    … y ${String(pendientes.length - 10)} más`);
    console.log("");
    return;
  }

  if (pendientes.length === 0) {
    console.log("\n  Nada que hacer. Con --reanalizar se vuelven a consultar todos.\n");
    return;
  }

  const resultados = await enriquecerLote(
    datos,
    pendientes.map((p) => p.id),
    {
      reanalizar: REANALIZAR,
      sinIa: SIN_IA,
      alAvanzar: ({ hechos, total, actual }) => {
        console.log(`  [${String(hechos)}/${String(total)}] ${actual}`);
      },
    },
  );

  const cuenta = (predicado: (r: (typeof resultados)[number]) => boolean): number =>
    resultados.filter(predicado).length;

  console.log(
    `\n  AniList: ${String(cuenta((r) => r.anilist === "OK"))} ok · ` +
      `${String(cuenta((r) => r.anilist === "SIN_RESULTADO"))} sin resultado · ` +
      `${String(cuenta((r) => r.anilist === "ERROR"))} error`,
  );
  console.log(
    `  IA:      ${String(cuenta((r) => r.ia === "OK"))} ok · ` +
      `${String(cuenta((r) => r.ia === "NO_CONFIGURADA"))} sin clave · ` +
      `${String(cuenta((r) => r.ia === "ERROR"))} error`,
  );

  // Los que no salieron: se listan con su motivo. Un resumen que sólo cuenta
  // los éxitos deja al dueño sin saber QUÉ anime se quedó fuera ni por qué.
  const fallidos = resultados.filter((r) => r.anilist !== "OK");
  if (fallidos.length > 0) {
    console.log(`\n  ${String(fallidos.length)} sin enriquecer:`);
    for (const r of fallidos.slice(0, 20)) console.log(`    · ${r.titulo} — ${r.detalle ?? "?"}`);
    if (fallidos.length > 20) console.log(`    … y ${String(fallidos.length - 20)} más`);
  }

  console.log("\n  Listo.\n");
}

principal()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("\n  El enriquecimiento falló:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
