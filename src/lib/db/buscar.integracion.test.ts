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
 * EL BUSCADOR GLOBAL, CONTRA POSTGRES REAL.
 *
 * ── POR QUÉ NO PUEDE SER UN TEST DE UNIDAD ────────────────────────────────
 *
 * Toda la consulta es SQL que no existía: `unaccent()`, `ILIKE`,
 * `array_to_string` sobre un `text[]`, y `similarity()` en el `ORDER BY`. Un
 * mock del ORM comprobaría que se llamó a `select`, no que
 * `unaccent('Kimi nó')` case con `kimi no` — que es la única pregunta que
 * importa.
 *
 * Y `unaccent` es una **extensión**: si no estuviera instalada en la rama, la
 * consulta reventaría en runtime con todo lo demás en verde. Este fichero es lo
 * único que lo detectaría.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   1. Quitando `mias()` del `WHERE` → rojo «no encuentra lo de otro usuario».
 *   2. Quitando la rama de `title_normalized` → rojo «encuentra por
 *      puntuación distinta».
 *   3. Quitando la rama de `unaccent(title)` → **verde**, al principio. Esa
 *      rama parecía redundante porque `title_normalized` ya viene sin acentos.
 *      Una mutación verde significa que la rama NO estaba cubierta, así que se
 *      añadió el caso que solo ella puede resolver —un título con japonés en
 *      `title`, cuyo normalizado es la cadena vacía— y ahora → rojo.
 *   4. Devolviendo el vault entero con la consulta vacía → rojo.
 *   Restaurado → 12 verdes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;
const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[buscar] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que el buscador no cruza usuarios y que `unaccent`\n" +
      "  está instalada. Omitirlo NO es aprobarlo.\n",
  );
}

describeSiHayBase("vault.buscar() contra Postgres real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let vaultA: Vault;
  let vaultB: Vault;
  let idA: string;
  let idB: string;

  const marca = randomUUID().slice(0, 8);
  const t = (titulo: string) => `${titulo} ${marca}`;

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable");
    cliente = crearClientePrueba(url);
    db = cliente.db;

    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: `buscar-a-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: `buscar-b-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    if (a === undefined || b === undefined) throw new Error("sin usuarios");
    idA = a.id;
    idB = b.id;

    vaultA = vaultDe(contextoDePrueba(idA), db);
    vaultB = vaultDe(contextoDePrueba(idB), db);

    const sembrar = async (
      userId: string,
      titulo: string,
      extra: Partial<{
        titleEnglish: string;
        titleNative: string;
        synonyms: string[];
        notes: string;
      }> = {},
    ) => {
      await db.insert(anime).values({
        userId,
        title: titulo,
        titleNormalized: normalizarTitulo(titulo),
        status: "VISTO",
        ...extra,
      });
    };

    await sembrar(idA, t("Fate/Zero"));
    await sembrar(idA, t("Kimi nó Ná wa"), {
      titleNative: `君の名は。${marca}`,
      titleEnglish: `Your Name ${marca}`,
      synonyms: [`Kimi no Nawa ${marca}`],
    });
    await sembrar(idA, t("Attack on Titan"), { notes: `pendiente de rever ${marca}` });
    // Un título CON JAPONÉS EN `title`, no en `title_native`. Es el único caso
    // que la rama de `unaccent(title) ILIKE` cubre y la de `title_normalized`
    // no puede: `normalizarTitulo` descarta lo que no sea `[0-9a-z]`, así que
    // el normalizado de esto es solo la marca.
    await sembrar(idA, t("涼宮ハルヒの憂鬱"));
    await sembrar(idA, t("Attack on Titan Season 2"));
    // El de B lleva una palabra que NO está en ninguno de A: si apareciera en
    // una búsqueda de A, el filtro de propiedad estaría roto.
    await sembrar(idB, `Berserk ${marca}`);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, idA));
    await db.delete(users).where(eq(users.id, idB));
    await cliente.cerrar();
  });

  const titulos = async (vault: Vault, consulta: string) =>
    (await vault.buscar(consulta)).map((fila) => fila.titulo);

  it("encuentra por el título, tal cual", async () => {
    expect(await titulos(vaultA, "Fate")).toContain(t("Fate/Zero"));
  });

  it("ENCUENTRA ESCRIBIENDO SIN ACENTOS", async () => {
    // `unaccent` en los dos lados. Sin esto, quien guardó «Kimi nó Ná wa» tiene
    // que escribirlo con los acentos exactos para encontrarlo, y nadie lo hace.
    expect(await titulos(vaultA, "kimi no na wa")).toContain(t("Kimi nó Ná wa"));
  });

  it("ENCUENTRA CON OTRA PUNTUACIÓN", async () => {
    // `fate zero` contra `Fate/Zero`. Es el camino de `title_normalized`, que
    // convierte la puntuación en espacios en los dos lados.
    expect(await titulos(vaultA, "fate zero")).toContain(t("Fate/Zero"));
  });

  it("encuentra por el título en inglés y por un sinónimo", async () => {
    expect(await titulos(vaultA, "Your Name")).toContain(t("Kimi nó Ná wa"));
    expect(await titulos(vaultA, "Nawa")).toContain(t("Kimi nó Ná wa"));
  });

  it("ENCUENTRA POR EL TÍTULO NATIVO, en japonés", async () => {
    // El camino que `normalizarParaBusqueda` no puede cubrir: descarta todo lo
    // que no sea `[0-9a-z]`, así que este término se le queda en vacío. Solo
    // funciona por la rama de `ILIKE`, y por eso las dos hacen falta.
    expect(await titulos(vaultA, "君の名は")).toContain(t("Kimi nó Ná wa"));
  });

  it("ENCUENTRA UN TÍTULO EN JAPONÉS ESCRITO EN `title`", async () => {
    // ── LO QUE ESTE TEST JUSTIFICA ──────────────────────────────────────
    //
    // La rama `unaccent(title) ILIKE` parecía redundante: quitarla dejaba los
    // once tests en VERDE, porque `title_normalized` ya viene sin acentos y
    // cubría el caso de «escribir sin tildes».
    //
    // Una mutación que sale verde significa que esa rama **no estaba
    // cubierta**, y entonces solo hay dos salidas honestas: escribir el test
    // que la justifica, o borrar el código. Éste es el test.
    //
    // `normalizarTitulo("涼宮ハルヒの憂鬱")` es la cadena vacía, así que la
    // rama del normalizado no puede encontrarlo. Y no está en `title_native`.
    expect(await titulos(vaultA, "涼宮")).toContain(t("涼宮ハルヒの憂鬱"));
  });

  it("encuentra por las notas", async () => {
    expect(await titulos(vaultA, "pendiente de rever")).toContain(t("Attack on Titan"));
  });

  it("BUSCAR «SEASON 2» NO DEVUELVE LA TEMPORADA 1", async () => {
    // La trampa del encargo: si el buscador normalizara como la deduplicación,
    // el término perdería el «2» y las dos temporadas serían indistinguibles.
    const encontrados = await titulos(vaultA, "Attack on Titan Season 2");

    expect(encontrados).toContain(t("Attack on Titan Season 2"));
    expect(encontrados).not.toContain(t("Attack on Titan"));
  });

  it("NO ENCUENTRA LO DE OTRO USUARIO", async () => {
    expect(await titulos(vaultA, "Berserk")).toEqual([]);
    // Control positivo: B SÍ lo encuentra. Sin esto, una consulta que devolviera
    // siempre vacío pasaría la aserción de arriba.
    expect(await titulos(vaultB, "Berserk")).toContain(`Berserk ${marca}`);
  });

  it("LA CONSULTA VACÍA DEVUELVE VACÍO, no el vault entero", async () => {
    // Con `LIKE '%%'` casaría todo, y enfocar el campo enseñaría los 83 como si
    // fueran un resultado de búsqueda.
    expect(await vaultA.buscar("")).toEqual([]);
    expect(await vaultA.buscar("   ")).toEqual([]);
  });

  it("devuelve las MISMAS columnas que listar()", async () => {
    // Si divergieran, la barra de progreso saldría vacía solo al buscar — un
    // fallo que aparece en la mitad de los casos, que es la peor forma.
    const [deLista] = await vaultA.listar({ limite: 1 });
    const [deBusqueda] = await vaultA.buscar("Fate");

    expect(deLista).toBeDefined();
    expect(deBusqueda).toBeDefined();
    expect(Object.keys(deBusqueda ?? {}).sort()).toEqual(Object.keys(deLista ?? {}).sort());
  });

  it("acota el número de resultados", async () => {
    expect(await vaultA.buscar(marca, { limite: 2 })).toHaveLength(2);
  });
});
