import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { marcaDeRevocacion } from "@/lib/auth/sesion";
import { normalizarTitulo } from "@/lib/domain/normalizar";

import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "./cliente-test";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { anime, users } from "./schema";
import { vaultDe, type Vault } from "./vault";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `vault.recuentos()` — LOS NÚMEROS DE LOS CHIPS, CONTRA POSTGRES REAL
 *
 * ── POR QUÉ NACIÓ ESTE MÉTODO ─────────────────────────────────────────────
 *
 * Los recuentos se calculaban en JavaScript recorriendo las filas que
 * `listar()` ya había traído. Correcto y gratis… mientras la barra de filtros y
 * la rejilla salieran del mismo `await`.
 *
 * Dejaron de salir del mismo `await` al meter la rejilla en un `<Suspense>`
 * interno —lo que devolvió el esqueleto de carga sin reintroducir un
 * `loading.tsx` de ruta, que rompía el 404 de la ficha y la navegación por
 * query—. La barra tiene que poder pintarse ANTES de que lleguen las filas, o
 * el esqueleto no sirve de nada porque igualmente se espera a todo.
 *
 * ── LO QUE HAY QUE COMPROBAR AQUÍ, Y NO EN UNA UNIDAD ─────────────────────
 *
 * Quien cuenta es el `GROUP BY` con `count(*) FILTER (WHERE …)`. Un test que
 * fabricara las filas probaría mi bucle de sumas, no el SQL. Y es SQL que nunca
 * se había ejecutado: exactamente la trampa de `registrarIntento`, donde la
 * unidad medía la decisión y quien contaba era una consulta sin test.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   1. Quitando `mias()` del `WHERE` → rojo «no cuenta lo de otro usuario».
 *   2. Cambiando `count(*) filter (where is_favorite)` por `count(*)` → rojo
 *      «los favoritos se cuentan aparte y no son el total».
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;

const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[recuentos] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba los números que se pintan en los chips de filtro.\n" +
      "  Omitirlo NO es aprobarlo.\n",
  );
}

/** El reparto sembrado para A. Se comprueba exactamente este. */
const REPARTO: readonly { estado: Estado; favorito: boolean }[] = [
  { estado: "VISTO", favorito: true },
  { estado: "VISTO", favorito: true },
  { estado: "VISTO", favorito: false },
  { estado: "VIENDO", favorito: true },
  { estado: "EN_ESPERA", favorito: false },
  { estado: "EN_ESPERA", favorito: false },
  { estado: "ABANDONADO", favorito: false },
  // PENDIENTE queda a CERO a propósito: es el caso que distingue un
  // `Record` completo de un `Partial`, y el chip tiene que poder pintar «0».
];

describeSiHayBase("vault.recuentos() contra Postgres real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let vaultA: Vault;
  let vaultB: Vault;
  let idA: string;
  let idB: string;

  const marca = randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable: hayBase ya lo comprueba");
    cliente = crearClientePrueba(url);
    db = cliente.db;

    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: `recuentos-a-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: `recuentos-b-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    if (a === undefined || b === undefined) throw new Error("no se pudieron crear los usuarios");
    idA = a.id;
    idB = b.id;

    vaultA = vaultDe(contextoDePrueba(idA), db);
    vaultB = vaultDe(contextoDePrueba(idB), db);

    for (const [i, fila] of REPARTO.entries()) {
      const titulo = `Serie ${String(i)} de A ${marca}`;
      await db.insert(anime).values({
        userId: idA,
        title: titulo,
        titleNormalized: normalizarTitulo(titulo),
        status: fila.estado,
        isFavorite: fila.favorito,
      });
    }

    // B tiene VEINTE, todos favoritos y todos VIENDO: si el filtro de propiedad
    // se cayera, los números de A se dispararían de forma imposible de ignorar.
    for (let i = 0; i < 20; i += 1) {
      const titulo = `Serie ${String(i)} de B ${marca}`;
      await db.insert(anime).values({
        userId: idB,
        title: titulo,
        titleNormalized: normalizarTitulo(titulo),
        status: "VIENDO",
        isFavorite: true,
      });
    }
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, idA));
    await db.delete(users).where(eq(users.id, idB));
    await cliente.cerrar();
  });

  it("cuenta cada estado, y el que no tiene ninguno vale 0", async () => {
    const { porEstado } = await vaultA.recuentos();

    expect(porEstado).toEqual({
      VISTO: 3,
      VIENDO: 1,
      EN_ESPERA: 2,
      ABANDONADO: 1,
      PENDIENTE: 0,
    });
  });

  it("el total es la suma, y los favoritos se cuentan APARTE", async () => {
    const { total, favoritos, porEstado } = await vaultA.recuentos();

    expect(total).toBe(REPARTO.length);
    expect(Object.values(porEstado).reduce((n, x) => n + x, 0)).toBe(total);

    // Tres favoritos de siete: si esto devolviera 7, alguien habría cambiado el
    // `count(*) FILTER` por un `count(*)` y el chip «★ Favoritos» mentiría.
    expect(favoritos).toBe(3);
    expect(favoritos).toBeLessThan(total);
  });

  it("NO cuenta lo de otro usuario", async () => {
    const deA = await vaultA.recuentos();
    const deB = await vaultB.recuentos();

    // Control negativo: B tiene 20 VIENDO y A tiene 1. Sin el filtro de
    // propiedad, A vería 21 y el chip diría un número que no es suyo.
    expect(deA.porEstado.VIENDO).toBe(1);
    // Control positivo: B SÍ ve los suyos. Sin esto, una consulta que devolviera
    // siempre vacío pasaría el test de arriba.
    expect(deB.porEstado.VIENDO).toBe(20);
    expect(deB.favoritos).toBe(20);
  });

  it("un vault vacío devuelve ceros, no un objeto a medias", async () => {
    const [c] = await db
      .insert(users)
      .values({
        email: `recuentos-c-${marca}@ejemplo.test`,
        sessionsValidFrom: marcaDeRevocacion(new Date()),
      })
      .returning({ id: users.id });
    if (c === undefined) throw new Error("no se pudo crear el usuario vacío");

    const vacio = await vaultDe(contextoDePrueba(c.id), db).recuentos();

    // Los cinco chips tienen que poder pintar «0» el primer día. Un `Partial`
    // aquí dejaría cinco `undefined` y la barra saldría sin números.
    expect(vacio).toEqual({
      porEstado: { VISTO: 0, VIENDO: 0, EN_ESPERA: 0, ABANDONADO: 0, PENDIENTE: 0 },
      total: 0,
      favoritos: 0,
    });

    await db.delete(users).where(eq(users.id, c.id));
  });

  it("dice lo mismo que contar las filas a mano: no hay dos verdades", async () => {
    // Los recuentos se calculaban antes en JavaScript sobre el resultado de
    // `listar()`. Ahora salen de un `GROUP BY`. Que las dos formas coincidan es
    // lo que garantiza que el cambio no movió ningún número en pantalla.
    const filas = await vaultA.listar({ limite: 500 });
    const { porEstado, total, favoritos } = await vaultA.recuentos();

    expect(total).toBe(filas.length);
    expect(favoritos).toBe(filas.filter((f) => f.esFavorito).length);
    for (const [estado, n] of Object.entries(porEstado)) {
      expect(filas.filter((f) => f.estado === estado).length).toBe(n);
    }
  });
});
