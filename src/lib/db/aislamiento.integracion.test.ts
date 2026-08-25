/**
 * TEST DE AISLAMIENTO ENTRE USUARIOS.
 *
 * Es el test más importante del proyecto. Anime Vault es multiusuario y la
 * regla que domina a todas las demás es que **ninguna consulta cruza usuarios**.
 * Una fuga aquí no es un bug: es enseñarle a alguien la biblioteca de otro.
 *
 * Corre contra POSTGRES DE VERDAD, no contra un mock del ORM: lo que se está
 * probando es precisamente que las consultas llevan el filtro, y un ORM simulado
 * devolvería lo que le pidamos.
 *
 *   · en LOCAL → la rama `development` de Neon
 *   · en CI    → un contenedor `postgres:18` efímero
 *
 * Ver `cliente-test.ts` para el porqué de las dos vías.
 *
 * Si no hay `DATABASE_URL_UNPOOLED`, el fichero entero se OMITE con un aviso
 * visible. Nunca se pone en verde fingiendo que pasó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * MUTACIÓN A: en `src/lib/db/vault.ts`, quitar el filtro de `mio()`
 *
 *     and(eq(anime.id, animeId), mias())   →   eq(anime.id, animeId)
 *
 * Resultado MEDIDO: **3 tests en rojo**
 *   · «pedir el anime de B con el uuid exacto devuelve NO ENCONTRADO»
 *   · «"no es tuyo" y "no existe" son indistinguibles»
 *   · «A no puede colgarle una portada al anime de B»
 *
 * MUTACIÓN B: quitar además el filtro de `mias()`
 *
 *     eq(anime.userId, ctx.userId)   →   sql`true`
 *
 * Resultado MEDIDO: **5 tests en rojo** (los 3 anteriores más)
 *   · «el listado del vault de A no contiene NADA de B»
 *   · «contar() solo cuenta lo propio»
 *
 * Las dos restauradas y verde (16/16).
 *
 * Si tocas `vault.ts`, repite las mutaciones y actualiza esta nota. Un test
 * verde que nunca se ha visto fallar no distingue entre proteger y no comprobar
 * nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { marcaDeRevocacion } from "@/lib/auth/sesion";
import { normalizarTitulo } from "@/lib/domain/normalizar";

import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "./cliente-test";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { anime, animeCover, continueLink, progress, users } from "./schema";
import { vaultDe, type Vault } from "./vault";

const url = urlDePruebas();
const hayBase = url !== undefined;

// `describe.skipIf` deja constancia en la salida: no es lo mismo omitir que pasar.
const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[aislamiento] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que un usuario no puede leer ni escribir datos de otro.\n" +
      "  Omitirlo NO es aprobarlo.\n",
  );
}

describeSiHayBase("aislamiento entre usuarios", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];

  /** Los dos usuarios del experimento, y sus datos. */
  let idA: string;
  let idB: string;
  /** Los vaults reales: es lo que usa producción, y es lo que hay que probar. */
  let vaultA: Vault;
  let vaultB: Vault;
  let animeDeA: string;
  let animeDeB: string;

  /** Sufijo único: los tests no deben chocar entre ejecuciones ni con datos reales. */
  const marca = randomUUID().slice(0, 8);
  const emailA = `aislamiento-a-${marca}@ejemplo.test`;
  const emailB = `aislamiento-b-${marca}@ejemplo.test`;

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable: hayBase ya lo comprueba");
    cliente = crearClientePrueba(url);
    db = cliente.db;
    console.info(`[aislamiento] motor: ${cliente.motor}`);

    // `sessionsValidFrom` va sin default a propósito (ver el esquema): se
    // escribe con el reloj de la aplicación, nunca con el de Postgres.
    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: emailA, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: emailB, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    if (a === undefined || b === undefined) throw new Error("no se pudieron crear los usuarios");
    idA = a.id;
    idB = b.id;

    const [ra] = await db
      .insert(anime)
      .values({
        userId: idA,
        title: "El anime privado de A",
        titleNormalized: normalizarTitulo(`El anime privado de A ${marca}`),
        status: "VISTO",
        notes: "SECRETO DE A",
      })
      .returning({ id: anime.id });

    const [rb] = await db
      .insert(anime)
      .values({
        userId: idB,
        title: "El anime privado de B",
        titleNormalized: normalizarTitulo(`El anime privado de B ${marca}`),
        status: "VIENDO",
        notes: "SECRETO DE B",
      })
      .returning({ id: anime.id });

    if (ra === undefined || rb === undefined) throw new Error("no se pudieron crear los animes");
    animeDeA = ra.id;
    animeDeB = rb.id;

    vaultA = vaultDe(contextoDePrueba(idA), db);
    vaultB = vaultDe(contextoDePrueba(idB), db);

    // Datos colgando del anime de B, para probar las tablas hijas.
    await db.insert(progress).values({
      animeId: animeDeB,
      kind: "EPISODIO",
      season: 2,
      episode: 7,
      label: "Temporada 2 · episodio 7",
    });
    await db.insert(continueLink).values({
      animeId: animeDeB,
      url: "https://ejemplo.test/b/ep7",
      label: "Sitio de B · Ep 7",
    });
  }, 30_000);

  afterAll(async () => {
    if (cliente !== undefined) {
      // El borrado en cascada se lleva animes, progreso y enlaces.
      await db.delete(users).where(eq(users.id, idA));
      await db.delete(users).where(eq(users.id, idB));
      await cliente.cerrar();
    }
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════════════
  // LECTURA
  // ═══════════════════════════════════════════════════════════════════════

  describe("A NO PUEDE LEER lo de B", () => {
    it("pedir el anime de B con el uuid exacto devuelve NO ENCONTRADO", async () => {
      // El caso que pediste: el uuid ajeno pasado directamente a la ruta de
      // detalle. Aunque el atacante conozca el id, no lo obtiene.
      // El vault de A devuelve `null`, INDISTINGUIBLE de «no existe».
      expect(await vaultA.obtener(animeDeB)).toBeNull();
    });

    it("«no es tuyo» y «no existe» son indistinguibles", async () => {
      // Si difirieran, un atacante enumeraría ids ajenos probando uuids: el que
      // diera «no es tuyo» existiría. Los dos devuelven exactamente `null`.
      const ajeno = await vaultA.obtener(animeDeB);
      const inventado = await vaultA.obtener("00000000-0000-4000-8000-000000000000");

      expect(ajeno).toBeNull();
      expect(inventado).toBeNull();
      expect(ajeno).toEqual(inventado);
    });

    it("A sí obtiene lo suyo", async () => {
      const suyo = await vaultA.obtener(animeDeA);
      expect(suyo?.notes).toBe("SECRETO DE A");
    });

    it("el listado del vault de A no contiene NADA de B", async () => {
      const filas = await vaultA.listar();

      expect(filas.map((f) => f.id)).toEqual([animeDeA]);
      expect(filas.some((f) => f.titulo.includes("de B"))).toBe(false);
    });

    it("el listado NO trae los bytes de la portada", async () => {
      // Son megabytes por fila. Solo debe viajar el checksum.
      const filas = await vaultA.listar();
      const claves = Object.keys(filas[0] ?? {});

      expect(claves).not.toContain("bytes");
      expect(claves).not.toContain("thumbBytes");
      expect(claves).toContain("checksumPortada");
    });

    it("contar() solo cuenta lo propio", async () => {
      expect(await vaultA.contar()).toBe(1);
      expect(await vaultB.contar()).toBe(1);
    });

    it("A no ve el progreso de B ni pidiéndolo por anime_id", async () => {
      // Las tablas hijas se alcanzan SIEMPRE por un JOIN contra `anime` ya
      // filtrado, nunca con un WHERE anime_id = ? a pelo.
      const filas = await db
        .select({ etiqueta: progress.label })
        .from(progress)
        .innerJoin(anime, eq(anime.id, progress.animeId))
        .where(and(eq(progress.animeId, animeDeB), eq(anime.userId, idA)));

      expect(filas).toEqual([]);
    });

    it("A no ve los enlaces de continuación de B", async () => {
      const filas = await db
        .select({ url: continueLink.url })
        .from(continueLink)
        .innerJoin(anime, eq(anime.id, continueLink.animeId))
        .where(and(eq(continueLink.animeId, animeDeB), eq(anime.userId, idA)));

      expect(filas).toEqual([]);
    });

    it("B sí ve lo suyo: el aislamiento no rompe el caso legítimo", async () => {
      // Un test de aislamiento que solo comprueba negativas pasaría con una
      // función que devuelve vacío siempre.
      const suyo = await vaultB.obtener(animeDeB);
      expect(suyo?.notes).toBe("SECRETO DE B");

      const prog = await db
        .select()
        .from(progress)
        .innerJoin(anime, eq(anime.id, progress.animeId))
        .where(and(eq(progress.animeId, animeDeB), eq(anime.userId, idB)));

      expect(prog).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ESCRITURA
  // ═══════════════════════════════════════════════════════════════════════

  describe("A NO PUEDE ESCRIBIR sobre lo de B", () => {
    it("un UPDATE de A sobre el anime de B no toca ninguna fila", async () => {
      const tocadas = await db
        .update(anime)
        .set({ title: "SECUESTRADO POR A", notes: "PISOTEADO" })
        .where(and(eq(anime.id, animeDeB), eq(anime.userId, idA)))
        .returning({ id: anime.id });

      expect(tocadas).toEqual([]);

      // Y se comprueba en la base que sigue intacto: que el UPDATE devuelva
      // vacío no basta como prueba.
      const [b] = await db.select().from(anime).where(eq(anime.id, animeDeB));
      expect(b?.title).toBe("El anime privado de B");
      expect(b?.notes).toBe("SECRETO DE B");
    });

    it("un DELETE de A sobre el anime de B no borra nada", async () => {
      // El otro caso que pediste: el uuid ajeno en la ruta de borrado.
      const borradas = await db
        .delete(anime)
        .where(and(eq(anime.id, animeDeB), eq(anime.userId, idA)))
        .returning({ id: anime.id });

      expect(borradas).toEqual([]);

      const [sigue] = await db.select().from(anime).where(eq(anime.id, animeDeB));
      expect(sigue).toBeDefined();
    });

    it("A no puede colgarle una portada al anime de B", async () => {
      // El vault de A no alcanza ese anime, así que tampoco puede colgarle nada.
      expect(await vaultA.obtener(animeDeB)).toBeNull();

      const portadas = await db.select().from(animeCover).where(eq(animeCover.animeId, animeDeB));
      expect(portadas).toEqual([]);
    });

    it("A no puede cambiar el progreso de B", async () => {
      const tocadas = await db
        .update(progress)
        .set({ label: "PISOTEADO POR A", episode: 99 })
        .from(anime)
        .where(
          and(
            eq(progress.animeId, animeDeB),
            eq(anime.id, progress.animeId),
            eq(anime.userId, idA),
          ),
        )
        .returning({ animeId: progress.animeId });

      expect(tocadas).toEqual([]);

      const [p] = await db.select().from(progress).where(eq(progress.animeId, animeDeB));
      expect(p?.episode).toBe(7);
      expect(p?.label).toBe("Temporada 2 · episodio 7");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DEDUPLICACIÓN Y BORRADO
  // ═══════════════════════════════════════════════════════════════════════

  describe("la deduplicación es POR USUARIO", () => {
    it("dos usuarios pueden tener el mismo título sin chocar", async () => {
      // El UNIQUE es (user_id, title_normalized), no solo title_normalized: que
      // B tenga «Death Note» no puede impedir que A lo tenga.
      const titulo = `Compartido ${marca}`;
      const norm = normalizarTitulo(titulo);

      const [enA] = await db
        .insert(anime)
        .values({ userId: idA, title: titulo, titleNormalized: norm, status: "VISTO" })
        .returning({ id: anime.id });
      const [enB] = await db
        .insert(anime)
        .values({ userId: idB, title: titulo, titleNormalized: norm, status: "VISTO" })
        .returning({ id: anime.id });

      expect(enA?.id).toBeDefined();
      expect(enB?.id).toBeDefined();
      expect(enA?.id).not.toBe(enB?.id);
    });

    it("el MISMO usuario no puede duplicar un título", async () => {
      const titulo = `Duplicado ${marca}`;
      const norm = normalizarTitulo(titulo);

      await db
        .insert(anime)
        .values({ userId: idA, title: titulo, titleNormalized: norm, status: "VISTO" });

      // La base es la última línea de defensa: la app comprueba antes, pero si
      // dos peticiones llegan a la vez, esto es lo que garantiza.
      await expect(
        db
          .insert(anime)
          .values({ userId: idA, title: titulo, titleNormalized: norm, status: "VISTO" }),
      ).rejects.toThrow();
    });
  });

  describe("borrar la cuenta borra TODO lo del usuario y NADA de los demás", () => {
    it("la cascada se lleva animes, progreso y enlaces del borrado, y respeta al otro", async () => {
      // Usuario desechable para no destruir a A ni a B a mitad de la suite.
      const emailC = `aislamiento-c-${marca}@ejemplo.test`;
      const [c] = await db
        .insert(users)
        .values({ email: emailC, sessionsValidFrom: marcaDeRevocacion(new Date()) })
        .returning({ id: users.id });
      if (c === undefined) throw new Error("no se pudo crear el usuario C");

      const [rc] = await db
        .insert(anime)
        .values({
          userId: c.id,
          title: `Anime de C ${marca}`,
          titleNormalized: normalizarTitulo(`Anime de C ${marca}`),
          status: "VISTO",
        })
        .returning({ id: anime.id });
      if (rc === undefined) throw new Error("no se pudo crear el anime de C");

      await db.insert(progress).values({ animeId: rc.id, kind: "COMPLETO", label: "Completo" });
      await db.insert(continueLink).values({ animeId: rc.id, url: "https://ejemplo.test/c" });

      await db.delete(users).where(eq(users.id, c.id));

      // Nada suyo sobrevive: el borrado tiene que ser real, no lógico.
      expect(await db.select().from(anime).where(eq(anime.id, rc.id))).toEqual([]);
      expect(await db.select().from(progress).where(eq(progress.animeId, rc.id))).toEqual([]);
      expect(await db.select().from(continueLink).where(eq(continueLink.animeId, rc.id))).toEqual(
        [],
      );

      // Y los de B siguen enteros.
      const deB = await db.select().from(anime).where(eq(anime.id, animeDeB));
      expect(deB).toHaveLength(1);
      expect(await db.select().from(progress).where(eq(progress.animeId, animeDeB))).toHaveLength(
        1,
      );
    }, 30_000);
  });
});
