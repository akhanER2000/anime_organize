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
 * LOS ENLACES PARA CONTINUAR, CONTRA POSTGRES REAL.
 *
 * ── POR QUÉ ESTO NO PUEDE SER UN TEST DE UNIDAD ───────────────────────────
 *
 * Las tres escrituras llevan SQL que **nunca se había ejecutado**:
 *
 *   · `guardarEnlace` comprueba la propiedad con una lectura y luego escribe.
 *     Si la lectura no devuelve fila, no se inserta nada — y eso NO es un
 *     error, es la negativa. Un mock del ORM diría que «se llamó al insert» y
 *     no distinguiría los dos casos. Por qué dos sentencias y por qué aquí es
 *     correcto está contado en `vault.ts`, junto al código.
 *   · `marcarEnlaceUsado` y `borrarEnlace` comprueban la propiedad con un
 *     `EXISTS` correlacionado, porque `continue_link` **no tiene `user_id`**:
 *     cuelga de `anime`. Es el punto exacto donde se filtra entre usuarios si
 *     el `EXISTS` está mal escrito, y está mal escrito en silencio.
 *   · El orden lleva `DESC NULLS LAST`, y el comportamiento por defecto de
 *     Postgres es el CONTRARIO. Eso no se ve en TypeScript.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   1. Cambiando `mio(animeId)` por `eq(anime.id, animeId)` en `guardarEnlace`
 *      → 2 rojos: «no cuelga un enlace de un anime ajeno» y «no marca ni borra
 *      el enlace de otro».
 *   2. Quitando el `EXISTS` de `marcarEnlaceUsado` → 1 rojo.
 *   3. Cambiando `desc nulls last` por `desc()` → 1 rojo: «el recién pegado no
 *      adelanta al que se usó».
 *   Restaurado → 6 verdes.
 *
 * ── Y UNA MUTACIÓN QUE SALIÓ VERDE, QUE TAMBIÉN DICE ALGO ─────────────────
 *
 * El primer intento fue quitar `mias()` de `and(mio(animeId), mias())`, y no
 * pasó nada: **`mio(id)` YA es `and(eq(anime.id, id), mias())`**. La condición
 * estaba escrita dos veces, así que quitar una copia no quitaba la protección.
 *
 * Una mutación que sale verde no siempre significa «el test no vale»: aquí
 * significaba «has mutado algo que no era la protección». La redundancia se
 * quitó y la mutación se rehízo contra la condición de verdad.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;

const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[enlaces] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que un enlace no se puede colgar del anime de otro.\n" +
      "  Omitirlo NO es aprobarlo.\n",
  );
}

describeSiHayBase("los enlaces para continuar, contra Postgres real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let vaultA: Vault;
  let vaultB: Vault;
  let idA: string;
  let idB: string;
  let animeDeA: string;
  let animeDeB: string;

  const marca = randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable: hayBase ya lo comprueba");
    cliente = crearClientePrueba(url);
    db = cliente.db;

    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: `enlaces-a-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: `enlaces-b-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    if (a === undefined || b === undefined) throw new Error("no se pudieron crear los usuarios");
    idA = a.id;
    idB = b.id;

    vaultA = vaultDe(contextoDePrueba(idA), db);
    vaultB = vaultDe(contextoDePrueba(idB), db);

    const crear = async (vault: Vault, titulo: string) => {
      const creado = await vault.crear({ titulo, estado: "VIENDO" });
      if (creado === null) throw new Error(`no se pudo crear ${titulo}`);
      return creado.id;
    };
    animeDeA = await crear(vaultA, `Vinland Saga de A ${marca}`);
    animeDeB = await crear(vaultB, `Vinland Saga de B ${marca}`);
    // El normalizado se usa abajo para comprobar que no chocan entre usuarios.
    expect(normalizarTitulo(`Vinland Saga de A ${marca}`)).not.toBe("");
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, idA));
    await db.delete(users).where(eq(users.id, idB));
    await cliente.cerrar();
  });

  it("guarda un enlace y lo devuelve con su etiqueta", async () => {
    const guardado = await vaultA.guardarEnlace(animeDeA, {
      url: "https://animeflv.net/ver/vinland-saga-7",
      etiqueta: "AnimeFLV V2 · Ep 7",
      temporada: 1,
      episodio: 7,
    });

    expect(guardado).not.toBeNull();

    const lista = await vaultA.enlaces(animeDeA);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.etiqueta).toBe("AnimeFLV V2 · Ep 7");
    expect(lista[0]?.episodio).toBe(7);
    // Nace sin usar: pegarlo no es abrirlo.
    expect(lista[0]?.ultimoUso).toBeNull();
  });

  it("NO cuelga un enlace del anime de otro", async () => {
    // El control que importa: A intenta escribir sobre el anime de B. El
    // `INSERT … SELECT` no produce fila, así que no hay nada que insertar.
    const intento = await vaultA.guardarEnlace(animeDeB, {
      url: "https://ejemplo.test/robado",
    });

    expect(intento).toBeNull();
    // Control positivo: B sigue sin enlaces, no es que la consulta falle
    // siempre y el test pase por eso.
    expect(await vaultB.enlaces(animeDeB)).toHaveLength(0);
  });

  it("EL RECIÉN PEGADO NO ADELANTA AL QUE SE USÓ", async () => {
    // ── EL FALLO QUE ESTE TEST FIJA ─────────────────────────────────────
    //
    // `ORDER BY last_used_at DESC` pone los NULL PRIMERO en Postgres. Un
    // enlace recién pegado —`last_used_at` a null— se colaría por delante del
    // que se abrió hace un minuto, y como el primero es la acción primaria de
    // la card, la card ofrecería el enlace equivocado.
    const usado = await vaultA.enlaces(animeDeA);
    const primero = usado[0];
    if (primero === undefined) throw new Error("hace falta el enlace del test anterior");

    await vaultA.marcarEnlaceUsado(primero.id);

    await vaultA.guardarEnlace(animeDeA, {
      url: "https://jkanime.net/vinland-saga/8",
      etiqueta: "JKAnime · Ep 8",
    });

    const orden = await vaultA.enlaces(animeDeA);
    expect(orden).toHaveLength(2);
    expect(orden[0]?.etiqueta).toBe("AnimeFLV V2 · Ep 7");
    expect(orden[0]?.ultimoUso).not.toBeNull();
    expect(orden[1]?.etiqueta).toBe("JKAnime · Ep 8");
  });

  it("marcar como usado devuelve la URL, y no la que le pasen", async () => {
    const [enlace] = await vaultA.enlaces(animeDeA);
    if (enlace === undefined) throw new Error("hace falta un enlace");

    const resultado = await vaultA.marcarEnlaceUsado(enlace.id);

    // Se devuelve la URL leída de la base: quien abre la pestaña no tiene que
    // fiarse de una que le hayan pasado por parámetro.
    expect(resultado?.url).toBe(enlace.url);
  });

  it("NO marca ni borra el enlace de otro", async () => {
    await vaultB.guardarEnlace(animeDeB, {
      url: "https://ejemplo.test/de-b",
      etiqueta: "de B",
    });
    const [deB] = await vaultB.enlaces(animeDeB);
    if (deB === undefined) throw new Error("no se creó el enlace de B");

    // `continue_link` no tiene `user_id`: la propiedad va por EXISTS contra
    // `anime`. Si ese EXISTS estuviera mal, A tocaría lo de B sin enterarse.
    expect(await vaultA.marcarEnlaceUsado(deB.id)).toBeNull();
    expect(await vaultA.borrarEnlace(deB.id)).toBeNull();

    // Control positivo: B SÍ puede con el suyo.
    expect(await vaultB.marcarEnlaceUsado(deB.id)).not.toBeNull();
    // Y sigue ahí después del intento de A.
    expect(await vaultB.enlaces(animeDeB)).toHaveLength(1);
  });

  it("borrar el anime se lleva sus enlaces por cascada", async () => {
    const temporal = await vaultA.crear({ titulo: `Efímero ${marca}`, estado: "PENDIENTE" });
    if (temporal === null) throw new Error("no se pudo crear el anime temporal");

    await vaultA.guardarEnlace(temporal.id, { url: "https://ejemplo.test/efimero" });
    expect(await vaultA.enlaces(temporal.id)).toHaveLength(1);

    await vaultA.borrar(temporal.id);

    // Lo garantiza el `ON DELETE CASCADE` del esquema, no la aplicación. Que se
    // compruebe aquí es lo que impide que alguien lo quite en una migración.
    const [huerfano] = await db
      .select({ id: anime.id })
      .from(anime)
      .where(eq(anime.id, temporal.id));
    expect(huerfano).toBeUndefined();
    expect(await vaultA.enlaces(temporal.id)).toHaveLength(0);
  });

  describe("las dos lecturas que usan las Server Actions", () => {
    it("`porTituloNormalizado` encuentra el propio y NO el de otro", async () => {
      const normalizado = normalizarTitulo(`Vinland Saga de A ${marca}`);

      const mio = await vaultA.porTituloNormalizado(normalizado);
      expect(mio?.id).toBe(animeDeA);

      // El de B tiene un título distinto, así que se busca EL DE B desde A:
      // el control que importa es que el filtro de propiedad esté puesto.
      const ajeno = await vaultA.porTituloNormalizado(
        normalizarTitulo(`Vinland Saga de B ${marca}`),
      );
      expect(ajeno).toBeNull();
      // Control positivo: B sí lo encuentra. Sin esto, una consulta que
      // devolviera siempre `null` pasaría la aserción de arriba.
      expect(
        (await vaultB.porTituloNormalizado(normalizarTitulo(`Vinland Saga de B ${marca}`)))?.id,
      ).toBe(animeDeB);
    });

    it("un normalizado vacío no devuelve el primer anime que haya", async () => {
      // `""` casaría con cualquier cosa en una comparación mal escrita, y sería
      // el peor caso posible: el alta creería que TODO está duplicado.
      expect(await vaultA.porTituloNormalizado("")).toBeNull();
      expect(await vaultA.porTituloNormalizado("   ")).toBeNull();
    });

    it("`progresoDe` lee el propio y NO el de otro", async () => {
      await vaultA.guardarProgreso(animeDeA, {
        kind: "EPISODIO",
        label: "Temporada 2 · episodio 7",
        temporada: 2,
        episodio: 7,
      });

      const mio = await vaultA.progresoDe(animeDeA);
      expect(mio).toMatchObject({ tipo: "EPISODIO", temporada: 2, episodio: 7 });

      // Es lo que leen los botones rápidos antes de sumar. Si el filtro se
      // cayera, «+1 episodio» de A partiría del progreso de B.
      expect(await vaultA.progresoDe(animeDeB)).toBeNull();
    });

    it("un anime sin progreso devuelve null, no un objeto a medias", async () => {
      const nuevo = await vaultA.crear({ titulo: `Sin progreso ${marca}`, estado: "PENDIENTE" });
      if (nuevo === null) throw new Error("no se pudo crear");

      // Es el caso de «+1 episodio» sobre un anime recién añadido, y el que
      // decide que la temporada arranque en 1.
      expect(await vaultA.progresoDe(nuevo.id)).toBeNull();
    });
  });
});
