import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { marcaDeRevocacion } from "@/lib/auth/sesion";

import { crearClientePrueba, urlDePruebas, type ClientePrueba } from "./cliente-test";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { streamingMirror, streamingSite, users } from "./schema";
import { sembrarSitiosGlobales, sitiosDe, type Sitios } from "./sitios";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL HUB DE SITIOS, CONTRA POSTGRES REAL.
 *
 * ── LO QUE SE PRUEBA, Y POR QUÉ NO PUEDE SER UNA UNIDAD ──────────────────
 *
 * La propiedad aquí tiene **dos conjuntos**: lo que se VE (la semilla
 * compartida y lo propio) y lo que se MODIFICA (solo lo propio). Son dos
 * predicados distintos, y confundirlos deja a cualquiera editar la semilla que
 * ven todos los usuarios — sin error, sin aviso, y solo visible cuando otro nota
 * el cambio.
 *
 * Un mock del ORM comprobaría que se llamó a `update`. Lo que hay que comprobar
 * es sobre QUÉ FILAS actuó, y eso solo lo responde la base.
 *
 * Además hay dos cosas del esquema que solo existen en Postgres:
 *   · `ck_streaming_site_propiedad` — un sitio es global O de un usuario, nunca
 *     las dos ni ninguna;
 *   · `ck_streaming_mirror_url` — la URL empieza por http(s).
 *
 * VERIFICADO POR MUTACIÓN (2026-08-28):
 *   1. Usando `visibles()` en vez de `mios()` en `editar` → rojo «NO edita un
 *      sitio global».
 *   2. Quitando el `EXISTS` de `borrarEspejo` → rojo «no borra el espejo de
 *      otro».
 *   3. Haciendo que `anotarComprobacion` borre en vez de desactivar → 2 rojos.
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const url = urlDePruebas();
const hayBase = url !== undefined;
const describeSiHayBase = describe.skipIf(!hayBase);

if (!hayBase) {
  console.warn(
    "\n[sitios] OMITIDO: falta DATABASE_URL_UNPOOLED.\n" +
      "  Este test comprueba que un usuario no puede editar la semilla que ven\n" +
      "  todos. Omitirlo NO es aprobarlo.\n",
  );
}

describeSiHayBase("el hub de sitios, contra Postgres real", () => {
  let cliente: ClientePrueba;
  let db: ClientePrueba["db"];
  let deA: Sitios;
  let deB: Sitios;
  let idA: string;
  let idB: string;
  let slugGlobal: string;
  let sitioGlobal: string;

  const marca = randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (url === undefined) throw new Error("inalcanzable");
    cliente = crearClientePrueba(url);
    db = cliente.db;

    const ahora = () => marcaDeRevocacion(new Date());
    const [a] = await db
      .insert(users)
      .values({ email: `sitios-a-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    const [b] = await db
      .insert(users)
      .values({ email: `sitios-b-${marca}@ejemplo.test`, sessionsValidFrom: ahora() })
      .returning({ id: users.id });
    if (a === undefined || b === undefined) throw new Error("sin usuarios");
    idA = a.id;
    idB = b.id;

    deA = sitiosDe(contextoDePrueba(idA), db);
    deB = sitiosDe(contextoDePrueba(idB), db);

    // Un global propio del test: no se toca la semilla de verdad de la rama.
    slugGlobal = `global-de-prueba-${marca}`;
    await sembrarSitiosGlobales(
      [{ slug: slugGlobal, nombre: `Global ${marca}`, tipo: "PAGO", orden: 5 }],
      db,
    );
    const [g] = await db
      .select({ id: streamingSite.id })
      .from(streamingSite)
      .where(eq(streamingSite.slug, slugGlobal));
    if (g === undefined) throw new Error("no se sembró el global");
    sitioGlobal = g.id;
  });

  afterAll(async () => {
    await db.delete(streamingSite).where(eq(streamingSite.slug, slugGlobal));
    await db.delete(users).where(inArray(users.id, [idA, idB]));
    await cliente.cerrar();
  });

  it("la semilla global la ven LOS DOS usuarios", async () => {
    const enA = (await deA.listar()).map((s) => s.id);
    const enB = (await deB.listar()).map((s) => s.id);

    expect(enA).toContain(sitioGlobal);
    expect(enB).toContain(sitioGlobal);
  });

  it("sembrar dos veces NO duplica: es idempotente", async () => {
    const antes = (await deA.listar()).filter((s) => s.id === sitioGlobal).length;

    const creados = await sembrarSitiosGlobales(
      [{ slug: slugGlobal, nombre: "Otro nombre", tipo: "GRATIS", orden: 99 }],
      db,
    );

    expect(creados, "el segundo sembrado creó filas").toBe(0);
    expect((await deA.listar()).filter((s) => s.id === sitioGlobal).length).toBe(antes);
    // Y no pisó el nombre: si el dueño lo hubiera corregido, seguiría corregido.
    expect((await deA.listar()).find((s) => s.id === sitioGlobal)?.nombre).toBe(`Global ${marca}`);
  });

  it("NO EDITA UN SITIO GLOBAL, aunque lo vea", async () => {
    // ── EL CONTROL QUE IMPORTA ──────────────────────────────────────────
    //
    // `visibles()` incluye los globales; `mios()` no. Si `editar` usara el
    // primero, A cambiaría el nombre de Crunchyroll PARA TODOS.
    expect(await deA.editar(sitioGlobal, { nombre: "Secuestrado" })).toBeNull();
    expect((await deB.listar()).find((s) => s.id === sitioGlobal)?.nombre).toBe(`Global ${marca}`);
  });

  it("NO BORRA UN SITIO GLOBAL", async () => {
    expect(await deA.borrar(sitioGlobal)).toBeNull();
    expect((await deB.listar()).map((s) => s.id)).toContain(sitioGlobal);
  });

  it("NO AÑADE UN ESPEJO A UN SITIO GLOBAL", async () => {
    // Sería añadírselo a todos los usuarios.
    expect(await deA.anadirEspejo(sitioGlobal, { url: "https://ejemplo.test/colado" })).toBeNull();
    expect((await deB.listar()).find((s) => s.id === sitioGlobal)?.espejos).toEqual([]);
  });

  it("un sitio PROPIO se crea, se edita y se borra", async () => {
    const creado = await deA.crear({ nombre: `Mi sitio ${marca}`, tipo: "GRATIS" });
    expect(creado).not.toBeNull();
    if (creado === null) throw new Error("inalcanzable");

    expect(await deA.editar(creado.id, { tipo: "MIXTO" })).not.toBeNull();
    expect((await deA.listar()).find((s) => s.id === creado.id)?.tipo).toBe("MIXTO");

    expect(await deA.borrar(creado.id)).not.toBeNull();
    expect((await deA.listar()).map((s) => s.id)).not.toContain(creado.id);
  });

  it("EL SITIO DE OTRO NI SE VE NI SE TOCA", async () => {
    const deOtro = await deB.crear({ nombre: `Sitio de B ${marca}`, tipo: "GRATIS" });
    if (deOtro === null) throw new Error("no se creó");

    // Ni aparece en el listado de A…
    expect((await deA.listar()).map((s) => s.id)).not.toContain(deOtro.id);
    // …ni se puede editar, borrar, ni colgarle un espejo.
    expect(await deA.editar(deOtro.id, { nombre: "robado" })).toBeNull();
    expect(await deA.borrar(deOtro.id)).toBeNull();
    expect(await deA.anadirEspejo(deOtro.id, { url: "https://ejemplo.test/x" })).toBeNull();

    // Control positivo: B SÍ puede con el suyo.
    expect(await deB.editar(deOtro.id, { nombre: `Renombrado ${marca}` })).not.toBeNull();
    await deB.borrar(deOtro.id);
  });

  it("las etiquetas de espejo siguen la serie V1, V2, V3", async () => {
    const sitio = await deA.crear({ nombre: `Con espejos ${marca}`, tipo: "GRATIS" });
    if (sitio === null) throw new Error("no se creó");

    expect((await deA.anadirEspejo(sitio.id, { url: "https://uno.ejemplo.test" }))?.etiqueta).toBe(
      "V1",
    );
    expect((await deA.anadirEspejo(sitio.id, { url: "https://dos.ejemplo.test" }))?.etiqueta).toBe(
      "V2",
    );
    // Y una etiqueta escrita a mano se respeta tal cual.
    expect(
      (
        await deA.anadirEspejo(sitio.id, {
          url: "https://tres.ejemplo.test",
          etiqueta: "Espejo bueno",
        })
      )?.etiqueta,
    ).toBe("Espejo bueno");

    await deA.borrar(sitio.id);
  });

  it("UN ESPEJO CAÍDO SE DESACTIVA, NO SE BORRA", async () => {
    // Skill §8. Un 503 de hoy puede ser un 200 mañana, y borrarlo obliga al
    // usuario a volver a buscar una dirección que ya tenía.
    const sitio = await deA.crear({ nombre: `Para comprobar ${marca}`, tipo: "GRATIS" });
    if (sitio === null) throw new Error("no se creó");
    const espejo = await deA.anadirEspejo(sitio.id, { url: "https://caido.ejemplo.test" });
    if (espejo === null) throw new Error("no se creó el espejo");

    const antes = new Date("2026-08-28T00:00:00.000Z");
    expect((await deA.anotarComprobacion(espejo.id, false, antes))?.activo).toBe(false);

    const [conEspejos] = (await deA.listar()).filter((s) => s.id === sitio.id);
    expect(conEspejos?.espejos, "el espejo caído se borró en vez de desactivarse").toHaveLength(1);
    expect(conEspejos?.espejos[0]?.activo).toBe(false);
    expect(conEspejos?.espejos[0]?.comprobadoEn?.toISOString()).toBe(antes.toISOString());

    // Y vuelve a activarse si revive.
    expect((await deA.anotarComprobacion(espejo.id, true))?.activo).toBe(true);

    await deA.borrar(sitio.id);
  });

  it("NO ANOTA NI BORRA EL ESPEJO DE OTRO", async () => {
    const sitio = await deB.crear({ nombre: `De B con espejo ${marca}`, tipo: "GRATIS" });
    if (sitio === null) throw new Error("no se creó");
    const espejo = await deB.anadirEspejo(sitio.id, { url: "https://de-b.ejemplo.test" });
    if (espejo === null) throw new Error("no se creó el espejo");

    // `streaming_mirror` no tiene `user_id`: la propiedad va por EXISTS contra
    // el sitio, y ahí es donde se filtra si está mal escrito.
    expect(await deA.anotarComprobacion(espejo.id, false)).toBeNull();
    expect(await deA.borrarEspejo(espejo.id)).toBeNull();

    // Control positivo: B sí puede, y sigue ahí después del intento de A.
    expect(await deB.anotarComprobacion(espejo.id, false)).not.toBeNull();
    expect((await deB.listar()).find((s) => s.id === sitio.id)?.espejos).toHaveLength(1);

    await deB.borrar(sitio.id);
  });

  it("borrar el sitio se lleva sus espejos por cascada", async () => {
    const sitio = await deA.crear({ nombre: `Efímero ${marca}`, tipo: "GRATIS" });
    if (sitio === null) throw new Error("no se creó");
    const espejo = await deA.anadirEspejo(sitio.id, { url: "https://efimero.ejemplo.test" });
    if (espejo === null) throw new Error("no se creó el espejo");

    await deA.borrar(sitio.id);

    // Lo garantiza el `ON DELETE CASCADE` del esquema, no la aplicación.
    const huerfanos = await db
      .select({ id: streamingMirror.id })
      .from(streamingMirror)
      .where(eq(streamingMirror.id, espejo.id));
    expect(huerfanos).toHaveLength(0);
  });

  it("LA BASE RECHAZA UNA URL QUE NO SEA http(s)", async () => {
    // `ck_streaming_mirror_url`. Es la última línea: la validación de la acción
    // va delante, pero si algún día alguien escribe por otra vía, esto para.
    const sitio = await deA.crear({ nombre: `Con url mala ${marca}`, tipo: "GRATIS" });
    if (sitio === null) throw new Error("no se creó");

    await expect(deA.anadirEspejo(sitio.id, { url: "javascript:alert(1)" })).rejects.toThrow();

    await deA.borrar(sitio.id);
  });

  it("LA BASE RECHAZA un sitio que sea global Y de un usuario a la vez", async () => {
    // `ck_streaming_site_propiedad`. Sin él, una fila así la vería todo el mundo
    // Y sería editable por uno — la peor combinación posible.
    await expect(
      db.insert(streamingSite).values({
        slug: `imposible-${marca}`,
        name: "Imposible",
        kind: "GRATIS",
        isGlobal: true,
        userId: idA,
      }),
    ).rejects.toThrow();
  });
});
