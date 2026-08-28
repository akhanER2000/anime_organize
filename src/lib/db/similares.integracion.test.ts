import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { marcaDeRevocacion } from "@/lib/auth/sesion";
import { normalizarTitulo } from "@/lib/domain/normalizar";

import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "./cliente-test";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { anime, users } from "./schema";
import { vaultDe, type Vault } from "./vault";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `vault.similares()` CONTRA POSTGRES DE VERDAD
 *
 * ── POR QUÉ ESTO NO PUEDE SER UN TEST DE UNIDAD ───────────────────────────
 *
 * Quien calcula la similitud es `pg_trgm`, dentro de Postgres. Un test que
 * fabricara las puntuaciones probaría mi aritmética, no la del motor — y la
 * pregunta que hay que responder es exactamente cuánto se parecen DOS TÍTULOS
 * REALES según la extensión que va a ejecutarse en producción.
 *
 * Es el mismo patrón que ya nos enseñó `registrarIntento`: la unidad medía la
 * decisión, y quien contaba era el SQL que nunca se había ejecutado en un test.
 *
 * ── LO QUE DE VERDAD ESTÁ EN JUEGO ────────────────────────────────────────
 *
 * El vault real tiene TRES Higurashi y DOS White Album, y están separados **a
 * propósito** (`CLAUDE.local.md`: «si un cambio en la normalización los junta,
 * el cambio está mal»). Son series distintas.
 *
 * Si la similitud BLOQUEARA en vez de preguntar, el usuario no podría dar de
 * alta la segunda. Por eso este test comprueba las dos mitades:
 *
 *   · que los parecidos SE ENCUENTRAN —si no, el aviso no salta nunca y el
 *     usuario acaba con «Kimi no na wa» dos veces escrito distinto—;
 *   · y que encontrarse **no impide nada**: `crear()` los mete igual.
 *
 * ── CONTROL POSITIVO Y CONTROL NEGATIVO, LOS DOS ──────────────────────────
 *
 * `testing.md` § «Lo que NO cuenta como verificación»: un test que solo cubre
 * el caso negativo pasaría igual si la función devolviera vacío siempre. Así
 * que aquí hay títulos que SÍ deben salir y títulos que NO, en el mismo vault.
 *
 * ── DOS UMBRALES, NO UNO. Y AL PRINCIPIO SOLO SE PROBABA EL DE POSTGRES ──
 *
 * La consulta filtra DOS veces y no es redundante:
 *
 *   · el operador `%`, que es el que usa el índice GIN. Su umbral es el de
 *     `pg_trgm`, **0.3 medido con `show_limit()`** en esta base;
 *   · y `similarity(...) > 0.55`, que es NUESTRO umbral (skill §2c).
 *
 * O sea que hay una banda —entre 0.30 y 0.55— donde `%` deja pasar y nosotros
 * rechazamos. **Esa banda es la única que prueba nuestro umbral.** Todo lo que
 * caiga por debajo de 0.30 lo descarta Postgres antes, y un test escrito ahí
 * pasa igual aunque nuestro umbral valga cero.
 *
 * Es exactamente lo que pasó: el primer caso negativo de este fichero era
 * «Fate/Zero contra Fate/stay night», que mide **0.238**. Bajar
 * `UMBRAL_SIMILITUD` a 0.01 dejaba los nueve tests en verde. Un test que no
 * puede fallar por el bug que dice vigilar.
 *
 * Medido contra esta misma base, para no volver a elegir a ojo:
 *
 *     0.828   higurashi no naku koro ni | higurashi no naku koro ni 2020
 *     0.857   white album               | white album 2
 *     0.438   higurashi no naku koro ni | umineko no naku koro ni
 *     0.412   naruto                    | naruto shippuden      <- discrimina
 *     0.333   white album               | black album           <- discrimina
 *     0.238   fate zero                 | fate stay night       (ni llega al %)
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   1. Quitando `mias()` del `WHERE` → 2 tests en rojo, los dos de aislamiento:
 *      el vault de A empieza a ver los títulos de B.
 *   2. Bajando `UMBRAL_SIMILITUD` de 0.55 a 0.01 → 2 tests en rojo: «Naruto
 *      Shippuden» (0.412) y «Umineko» (0.438), que son los dos que viven en la
 *      banda que discrimina. Con solo el caso de Fate, esta mutación dejaba los
 *      nueve tests en verde.
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;

const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[similares] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que el aviso de duplicado encuentra los parecidos\n" +
      "  y que NO bloquea las series legítimamente distintas del vault real.\n" +
      "  Omitirlo NO es aprobarlo.\n",
  );
}

/**
 * Los títulos que se siembran. Salen de `animes-seed.json`, no inventados:
 * son los casos que la skill de dominio marca como frontera.
 */
const TITULOS = [
  "Higurashi no Naku Koro Ni",
  "Higurashi no Naku Koro ni (2020)",
  "Higurashi no Naku Koro ni Sotsu",
  "White Album",
  "White Album 2",
  "Fate/Zero",
  "Fate/stay night",
  "Kimi no Na wa",
  // Para la banda que discrimina: «naruto» contra «naruto shippuden» mide
  // 0.412, o sea que el operador `%` lo deja pasar y NUESTRO umbral lo corta.
  "Naruto",
] as const;

describeSiHayBase("vault.similares() contra pg_trgm real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let vaultA: Vault;
  let vaultB: Vault;
  let idA: string;
  let idB: string;

  const marca = randomUUID().slice(0, 8);
  const emailA = `similares-a-${marca}@ejemplo.test`;
  const emailB = `similares-b-${marca}@ejemplo.test`;

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable: hayBase ya lo comprueba");
    cliente = crearClientePrueba(url);
    db = cliente.db;

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

    vaultA = vaultDe(contextoDePrueba(idA), db);
    vaultB = vaultDe(contextoDePrueba(idB), db);

    for (const titulo of TITULOS) {
      await db.insert(anime).values({
        userId: idA,
        title: titulo,
        titleNormalized: normalizarTitulo(titulo),
        status: "VISTO",
      });
    }

    // B tiene UNO de los mismos títulos: es el control de aislamiento.
    await db.insert(anime).values({
      userId: idB,
      title: "Higurashi no Naku Koro Ni",
      titleNormalized: normalizarTitulo("Higurashi no Naku Koro Ni"),
      status: "VISTO",
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, idA));
    await db.delete(users).where(eq(users.id, idB));
    await cliente.cerrar();
  });

  it("ENCUENTRA los Higurashi parecidos: el aviso de duplicado tiene con qué saltar", async () => {
    const encontrados = await vaultA.similares(normalizarTitulo("Higurashi no Naku Koro ni Kai"));

    // Control positivo: si esto saliera vacío, el aviso nunca aparecería y el
    // usuario acabaría con la misma serie escrita de dos formas.
    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados.map((c) => c.titulo)).toEqual(
      expect.arrayContaining(["Higurashi no Naku Koro Ni"]),
    );
  });

  it("devuelve COMO MUCHO 3, ordenados de más parecido a menos", async () => {
    const encontrados = await vaultA.similares(normalizarTitulo("Higurashi no Naku Koro ni"));

    // La skill §2c fija el máximo en 3: es un aviso, no un buscador.
    expect(encontrados.length).toBeLessThanOrEqual(3);

    const puntuaciones = encontrados.map((c) => c.similitud);
    expect(puntuaciones).toEqual([...puntuaciones].sort((x, y) => y - x));
  });

  it("todo lo devuelto supera 0.55: el umbral es real, no decorativo", async () => {
    const encontrados = await vaultA.similares(normalizarTitulo("White Album 3"));

    for (const candidato of encontrados) {
      expect(candidato.similitud).toBeGreaterThan(0.55);
    }
  });

  it("NUESTRO umbral corta a 0.55: «Naruto Shippuden» no avisa de «Naruto»", async () => {
    // ── ESTE ES EL TEST QUE PRUEBA EL 0.55, Y EL ÚNICO ──────────────────
    //
    // Miden 0.412: por encima del 0.3 del operador `%` —así que Postgres lo
    // deja pasar— y por debajo de nuestro 0.55. Si alguien baja la constante,
    // este test se pone rojo. Ver la nota de la cabecera sobre los dos
    // umbrales, porque el caso de Fate NO servía para esto.
    //
    // Y el comportamiento es el correcto: son dos entradas que mucha gente
    // quiere separadas, así que no hay nada de qué avisar.
    const encontrados = await vaultA.similares(normalizarTitulo("Naruto Shippuden"));

    expect(encontrados.map((c) => c.titulo)).not.toContain("Naruto");
  });

  it("«Fate/Zero» y «Fate/stay night» tampoco, pero los descarta Postgres antes", async () => {
    // Miden 0.238: ni llegan al operador `%`. Se conserva porque es un caso
    // real del vault —el usuario tiene las dos— pero NO prueba nuestro umbral,
    // y decirlo aquí evita que alguien lo cuente como si lo hiciera.
    const encontrados = await vaultA.similares(normalizarTitulo("Fate/Zero"));

    expect(encontrados.map((c) => c.titulo)).not.toContain("Fate/stay night");
  });

  it("«Umineko» no avisa de «Higurashi», aunque compartan medio título", async () => {
    // 0.438, también en la banda que discrimina. Son dos obras del mismo autor
    // con la misma coletilla («no naku koro ni»), y son el caso en el que un
    // umbral flojo empezaría a dar avisos falsos hasta que se dejaran de leer.
    const encontrados = await vaultA.similares(normalizarTitulo("Umineko no Naku Koro ni"));

    expect(encontrados).toEqual([]);
  });

  it("ENCONTRAR un parecido NO impide crear: la similitud pregunta, no bloquea", async () => {
    const titulo = `Higurashi no Naku Koro ni Gou ${marca}`;

    const avisos = await vaultA.similares(normalizarTitulo(titulo));
    const creado = await vaultA.crear({ titulo, estado: "PENDIENTE" });

    // Las dos cosas a la vez: hay aviso Y se crea. Eso es «preguntar».
    expect(avisos.length).toBeGreaterThan(0);
    expect(creado).not.toBeNull();
  });

  it("NO cruza usuarios: A no ve el Higurashi de B", async () => {
    const deA = await vaultA.similares(normalizarTitulo("Higurashi no Naku Koro Ni"));

    // A tiene tres Higurashi propios, así que encuentra; lo que hay que
    // comprobar es que ninguno de los devueltos es la fila de B.
    const idsDeB = await db.select({ id: anime.id }).from(anime).where(eq(anime.userId, idB));
    const idsProhibidos = new Set(idsDeB.map((f) => f.id));

    expect(deA.length).toBeGreaterThan(0);
    for (const candidato of deA) {
      expect(idsProhibidos.has(candidato.id)).toBe(false);
    }
  });

  it("un vault ajeno con UN solo título no ve los del otro", async () => {
    // La otra mitad del aislamiento, desde el lado de B: B tiene un Higurashi,
    // así que se encuentra a sí mismo y a nadie más.
    const deB = await vaultB.similares(normalizarTitulo("Higurashi no Naku Koro ni Sotsu"));

    expect(deB.length).toBeLessThanOrEqual(1);
    for (const candidato of deB) {
      expect(candidato.titulo).toBe("Higurashi no Naku Koro Ni");
    }
  });

  it("un título vacío no va a la base y devuelve vacío", async () => {
    expect(await vaultA.similares("")).toEqual([]);
    expect(await vaultA.similares("   ")).toEqual([]);
  });

  it("porAnilistId encuentra el propio y NUNCA el ajeno", async () => {
    const anilistId = 900000 + Math.floor(Number.parseInt(marca.slice(0, 4), 16) % 1000);

    await db.update(anime).set({ anilistId }).where(eq(anime.userId, idB));

    // B sí lo tiene.
    expect(await vaultB.porAnilistId(anilistId)).not.toBeNull();
    // A no, aunque el id exista en la tabla.
    expect(await vaultA.porAnilistId(anilistId)).toBeNull();
  });
});
