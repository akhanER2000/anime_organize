import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { marcaDeRevocacion } from "@/lib/auth/sesion";

import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "./cliente-test";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { enriquecimientoDe, type Enriquecimiento } from "./enriquecimiento";
import { aiJob, anime, animeGenre, genre, users } from "./schema";

import type { DatosDeAniList } from "@/lib/enrich/anilist";
import type { AnalisisValidado } from "@/lib/enrich/claude";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ENRIQUECIMIENTO, CONTRA POSTGRES REAL.
 *
 * ── LAS TRES COSAS QUE SÓLO SE VEN AQUÍ ──────────────────────────────────
 *
 * 1. **`COALESCE` protege lo que escribió el dueño.** Es SQL: un mock del ORM
 *    diría que se llamó a `update` y no diría con qué quedó la fila. Y este es
 *    el punto donde un enriquecimiento mal hecho **pisa los 83 animes**.
 * 2. **`genre` es global y `anime_genre` es del usuario.** Dos reglas distintas
 *    en la misma operación; sólo la base dice cuál se aplicó a qué.
 * 3. **La idempotencia es de la PK compuesta.** Repetir el enriquecimiento no
 *    puede reventar, y eso lo decide Postgres, no el código.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-28): abajo, junto a cada bloque.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;
const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[enriquecimiento] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Comprueba que el enriquecimiento no pisa lo que escribió el dueño ni\n" +
      "  toca el vault de otro. Omitirlo NO es aprobarlo.\n",
  );
}

const marca = randomUUID().slice(0, 8);

const DE_ANILIST: DatosDeAniList = {
  anilistId: 999_001,
  tituloRomaji: "Titulo Romaji",
  tituloIngles: "English Title",
  tituloNativo: "ネイティブ",
  sinonimos: [],
  sinopsis: "Sinopsis que viene de AniList.",
  formato: "TV",
  totalEpisodios: 26,
  anio: 2006,
  puntuacion: "8.4",
  generos: [`Genero-${marca}`],
  etiquetasOficiales: [`Tag-${marca}`],
  portadaUrl: null,
};

const DE_CLAUDE: AnalisisValidado = {
  delVocabulario: [{ slug: "yandere", nombre: "Yandere", confianza: 0.87 }],
  propuestas: [{ slug: `propuesta-${marca}`, nombre: "Propuesta", confianza: 0.4 }],
  tono: "melancólico",
  publico: "seinen",
  advertencias: ["gore"],
  resumenCorto: "Breve.",
};

describeSiHayBase("el enriquecimiento, contra Postgres real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let deA: Enriquecimiento;
  let deB: Enriquecimiento;
  let idA: string;
  let idB: string;
  let animeA: string;
  let animeB: string;

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable");
    cliente = crearClientePrueba(url);
    db = cliente.db;

    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: `enr-a-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: `enr-b-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });

    if (a === undefined || b === undefined) throw new Error("no se pudieron crear los usuarios");
    idA = a.id;
    idB = b.id;

    deA = enriquecimientoDe(contextoDePrueba(idA), db);
    deB = enriquecimientoDe(contextoDePrueba(idB), db);

    const [ra] = await db
      .insert(anime)
      .values({
        userId: idA,
        title: `Anime de A ${marca}`,
        titleNormalized: `anime de a ${marca}`,
        status: "PENDIENTE",
      })
      .returning({ id: anime.id });
    const [rb] = await db
      .insert(anime)
      .values({
        userId: idB,
        title: `Anime de B ${marca}`,
        titleNormalized: `anime de b ${marca}`,
        status: "PENDIENTE",
        // B ya trae sinopsis PROPIA: es el control del COALESCE.
        synopsis: "La sinopsis que escribió el dueño.",
      })
      .returning({ id: anime.id });

    if (ra === undefined || rb === undefined) throw new Error("no se pudieron crear los animes");
    animeA = ra.id;
    animeB = rb.id;
  });

  afterAll(async () => {
    if (!hayBase) return;
    await db.delete(users).where(inArray(users.id, [idA, idB]));
    await db
      .delete(genre)
      .where(inArray(genre.slug, [`genero-${marca}`, `tag-${marca}`, `propuesta-${marca}`]));
    await cliente.cerrar();
  });

  /**
   * VERIFICADO POR MUTACIÓN (2026-08-28):
   *   Se quitó `mias()` de `mio()` en `enriquecimiento.ts` → «NO escribe en el
   *   anime de otro usuario» en rojo. Restaurado.
   */
  it("escribe lo de AniList en MI anime", async () => {
    const r = await deA.guardarDeAniList(animeA, DE_ANILIST);

    expect(r).not.toBeNull();

    const [fila] = await db
      .select({
        anilistId: anime.anilistId,
        sinopsis: anime.synopsis,
        anio: anime.year,
        puntuacion: anime.score,
        titulo: anime.title,
      })
      .from(anime)
      .where(eq(anime.id, animeA));

    expect(fila?.anilistId).toBe(999_001);
    expect(fila?.sinopsis).toBe("Sinopsis que viene de AniList.");
    expect(fila?.anio).toBe(2006);
    expect(fila?.puntuacion).toBe("8.4");
    // El título es del dueño y NO se toca, aunque AniList traiga otro.
    expect(fila?.titulo).toBe(`Anime de A ${marca}`);
  });

  it("NO escribe en el anime de otro usuario", async () => {
    const r = await deA.guardarDeAniList(animeB, DE_ANILIST);

    expect(r).toBeNull();

    // Y el control que de verdad cierra el caso: la fila de B sigue intacta.
    const [fila] = await db
      .select({ anilistId: anime.anilistId, sinopsis: anime.synopsis })
      .from(anime)
      .where(eq(anime.id, animeB));

    expect(fila?.anilistId).toBeNull();
    expect(fila?.sinopsis).toBe("La sinopsis que escribió el dueño.");
  });

  /**
   * VERIFICADO POR MUTACIÓN (2026-08-28):
   *   Se cambió `coalesce(${anime.synopsis}, ${datos.sinopsis})` por
   *   `${datos.sinopsis}` a secas → este test en rojo: la sinopsis del dueño
   *   pasaba a ser la de AniList. Restaurado.
   */
  it("EL COALESCE PROTEGE LO DEL DUEÑO: una sinopsis ya escrita no se pisa", async () => {
    await deB.guardarDeAniList(animeB, DE_ANILIST);

    const [fila] = await db
      .select({ sinopsis: anime.synopsis, anio: anime.year })
      .from(anime)
      .where(eq(anime.id, animeB));

    expect(fila?.sinopsis).toBe("La sinopsis que escribió el dueño.");
    // Y lo que estaba vacío sí se rellena: si no, el test pasaría con un
    // `guardarDeAniList` que no escribiera nada en absoluto.
    expect(fila?.anio).toBe(2006);
  });

  it("los géneros de AniList quedan vinculados como OFICIAL", async () => {
    const filas = await db
      .select({ slug: genre.slug, tipo: genre.kind, fuente: animeGenre.source })
      .from(animeGenre)
      .innerJoin(genre, eq(genre.id, animeGenre.genreId))
      .where(eq(animeGenre.animeId, animeA));

    const porSlug = new Map(filas.map((f) => [f.slug, f]));
    expect(porSlug.get(`genero-${marca}`)?.tipo).toBe("OFICIAL");
    expect(porSlug.get(`genero-${marca}`)?.fuente).toBe("ANILIST");
    expect(porSlug.get(`tag-${marca}`)?.tipo).toBe("OFICIAL");
  });

  it("repetirlo NO revienta por la PK compuesta: es idempotente", async () => {
    await expect(deA.guardarDeAniList(animeA, DE_ANILIST)).resolves.not.toBeNull();

    const filas = await db
      .select({ slug: genre.slug })
      .from(animeGenre)
      .innerJoin(genre, eq(genre.id, animeGenre.genreId))
      .where(and(eq(animeGenre.animeId, animeA), eq(genre.slug, `genero-${marca}`)));

    // Una sola fila: la PK (anime_id, genre_id) lo garantiza, y el
    // `onConflictDoNothing` evita que el segundo intento lance.
    expect(filas).toHaveLength(1);
  });

  it("las etiquetas de Claude entran con su confianza y su fuente", async () => {
    const r = await deA.guardarDeClaude(animeA, DE_CLAUDE);

    expect(r).not.toBeNull();

    const filas = await db
      .select({
        slug: genre.slug,
        tipo: genre.kind,
        fuente: animeGenre.source,
        confianza: animeGenre.confidence,
      })
      .from(animeGenre)
      .innerJoin(genre, eq(genre.id, animeGenre.genreId))
      .where(eq(animeGenre.animeId, animeA));

    const porSlug = new Map(filas.map((f) => [f.slug, f]));

    expect(porSlug.get("yandere")?.tipo).toBe("IA");
    expect(porSlug.get("yandere")?.fuente).toBe("CLAUDE");
    expect(porSlug.get("yandere")?.confianza).toBe("0.870");

    // La propuesta queda MARCADA, no ascendida: `IA_PROPUESTA` es lo que
    // permite revisarla después (skill §6).
    expect(porSlug.get(`propuesta-${marca}`)?.fuente).toBe("IA_PROPUESTA");
  });

  it("no analiza con Claude el anime de otro", async () => {
    await expect(deA.guardarDeClaude(animeB, DE_CLAUDE)).resolves.toBeNull();
  });

  it("`pendientes` sólo trae los MÍOS y sólo los que no tienen anilist_id", async () => {
    const [sinAnilist] = await db
      .insert(anime)
      .values({
        userId: idA,
        title: `Sin AniList ${marca}`,
        titleNormalized: `sin anilist ${marca}`,
        status: "PENDIENTE",
      })
      .returning({ id: anime.id });

    const pendientes = await deA.pendientes(50);
    const ids = pendientes.map((p) => p.id);

    expect(ids).toContain(sinAnilist?.id);
    // Ya enriquecido: fuera.
    expect(ids).not.toContain(animeA);
    // De otro usuario: fuera, aunque tampoco tenga anilist_id.
    expect(ids).not.toContain(animeB);
  });

  it("`reanalizar` los trae todos los míos, incluidos los ya enriquecidos", async () => {
    const todos = await deA.pendientes(50, true);

    expect(todos.map((p) => p.id)).toContain(animeA);
    expect(todos.map((p) => p.id)).not.toContain(animeB);
  });

  it("`uno` devuelve null para el anime de otro, nunca sus datos", async () => {
    await expect(deA.uno(animeB)).resolves.toBeNull();
    await expect(deA.uno(animeA)).resolves.not.toBeNull();
  });

  /**
   * El registro del intento es lo único que le dice al dueño POR QUÉ su ficha
   * sigue vacía. Si no se escribiera, un fallo del proveedor sería
   * indistinguible de no haber lanzado nada.
   */
  it("registra el intento, con su proveedor y su estado", async () => {
    await deA.registrar({
      animeId: animeA,
      proveedor: "ANTHROPIC",
      estado: "ERROR",
      error: "la respuesta no cumple el contrato",
    });

    const trabajos = await deA.ultimosTrabajos(5);
    const nuestro = trabajos.find((t) => t.animeId === animeA && t.proveedor === "ANTHROPIC");

    expect(nuestro?.estado).toBe("ERROR");
    expect(nuestro?.error).toContain("no cumple el contrato");
  });

  it("el resultado del trabajo se guarda de verdad en `result`", async () => {
    // Aquí había un `as never` que renombraba la columna sin que nadie se
    // enterara: el insert seguía devolviendo una fila y el campo quedaba nulo.
    await deA.registrar({
      animeId: animeA,
      proveedor: "ANILIST",
      estado: "OK",
      resultado: { anilistId: 999_001 },
    });

    const [fila] = await db
      .select({ resultado: aiJob.result })
      .from(aiJob)
      .where(and(eq(aiJob.userId, idA), eq(aiJob.provider, "ANILIST")))
      .limit(1);

    expect(fila?.resultado).toEqual({ anilistId: 999_001 });
  });

  it("un usuario NO ve los trabajos de otro", async () => {
    await deB.registrar({ animeId: animeB, proveedor: "ANILIST", estado: "OK" });

    const deAMios = await deA.ultimosTrabajos(50);

    expect(deAMios.map((t) => t.animeId)).not.toContain(animeB);
  });
});
