import "server-only";

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { siguienteEtiquetaDeEspejo } from "@/lib/domain/sitios";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { dbInterna, type ClienteInterno } from "./interno";
import { streamingMirror, streamingSite } from "./schema";

import type { TipoSitio } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL HUB DE SITIOS — artboard 08, y la pestaña «Sitios» de Ajustes.
 *
 * ── LA PROPIEDAD AQUÍ NO ES LA DEL VAULT, Y ESA ES TODA LA DIFICULTAD ─────
 *
 * `vault.ts` tiene una sola regla y se aplica a todo: `user_id = el mío`. Aquí
 * hay **dos conjuntos** y se comportan distinto:
 *
 * | | leer | modificar |
 * |---|---|---|
 * | sitios globales (`is_global`, `user_id` nulo) | **sí**, los ve todo el mundo | **no**, de nadie |
 * | sitios propios (`user_id` = el mío) | sí | sí |
 * | sitios de OTRO usuario | no | no |
 *
 * Y por eso hay **dos predicados y no uno**: `visibles()` para leer y `mios()`
 * para escribir. Reutilizar el de lectura en una escritura dejaría a cualquiera
 * editar la semilla compartida —que ven todos—, y eso es la vía más corta para
 * que un usuario cambie el dominio que se le sirve a otro.
 *
 * La confusión es fácil de cometer y silenciosa: el `UPDATE` funcionaría, no
 * habría error, y solo se notaría cuando alguien más viera el cambio. Por eso
 * los dos predicados tienen nombres que no se parecen.
 *
 * ── LOS ESPEJOS NO TIENEN `user_id` ──────────────────────────────────────
 *
 * Cuelgan de `streaming_site`, igual que `continue_link` cuelga de `anime`. Su
 * propiedad va por `EXISTS` correlacionado contra el sitio, que es el punto
 * exacto donde se filtra entre usuarios si está mal escrito — y está mal escrito
 * en silencio.
 *
 * ── UN ESPEJO CAÍDO SE DESACTIVA, NUNCA SE BORRA ─────────────────────────
 *
 * Skill de dominio §8, con todas las letras. Y no es cortesía: un espejo que
 * responde 503 hoy puede responder 200 mañana, y borrarlo obliga al usuario a
 * volver a buscar una dirección que ya tenía. `is_active = false` lo aparta de
 * la vista y conserva el dato.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SitioConEspejos = {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
  readonly tipo: TipoSitio;
  /** `true` = de la semilla compartida. No se puede editar ni borrar. */
  readonly esGlobal: boolean;
  readonly orden: number;
  readonly espejos: readonly {
    readonly id: string;
    readonly etiqueta: string;
    readonly url: string;
    readonly activo: boolean;
    readonly comprobadoEn: Date | null;
    readonly orden: number;
  }[];
};

export type DatosSitio = {
  readonly nombre: string;
  readonly tipo: TipoSitio;
};

export type DatosEspejo = {
  readonly url: string;
  /** Si falta, se calcula el siguiente `V…` libre. */
  readonly etiqueta?: string | null;
};

export type Sitios = ReturnType<typeof sitiosDe>;

export function sitiosDe(ctx: ContextoUsuario, cliente: ClienteInterno = dbInterna()) {
  // La misma garantía de runtime que `vaultDe`: un contexto sin la marca
  // privada no abre nada, venga de donde venga.
  if (!ContextoUsuario.esAutentico(ctx)) {
    throw new ErrorContextoFalsificado();
  }

  /** Lo que este usuario puede VER: la semilla compartida y lo suyo. */
  const visibles = () => or(eq(streamingSite.isGlobal, true), eq(streamingSite.userId, ctx.userId));

  /**
   * Lo que este usuario puede MODIFICAR: **solo lo suyo**.
   *
   * `isNull(userId)` NO entra aquí a propósito, aunque un sitio global lo tenga:
   * es justo el conjunto que no se puede tocar.
   */
  const mios = () => and(eq(streamingSite.isGlobal, false), eq(streamingSite.userId, ctx.userId));

  /** Un sitio propio, por id. Las dos condiciones, siempre. */
  const mio = (sitioId: string) => and(eq(streamingSite.id, sitioId), mios());

  /**
   * «Este espejo cuelga de un sitio que puedo modificar.»
   *
   * Va por `EXISTS` porque `streaming_mirror` no tiene `user_id`. Y usa `mios()`,
   * no `visibles()`: añadir un espejo a Crunchyroll se lo añadiría **a todos**.
   */
  const espejoMio = () =>
    sql`exists (
      select 1 from ${streamingSite}
       where ${streamingSite.id} = ${streamingMirror.siteId}
         and ${streamingSite.isGlobal} = false
         and ${streamingSite.userId} = ${ctx.userId}
    )`;

  return {
    /**
     * Todos los sitios que este usuario ve, con sus espejos.
     *
     * Dos consultas y no un `JOIN`: los espejos son 0..N por sitio, así que un
     * `JOIN` multiplicaría las filas y habría que reagruparlas igualmente.
     */
    async listar(): Promise<SitioConEspejos[]> {
      const filas = await cliente
        .select({
          id: streamingSite.id,
          slug: streamingSite.slug,
          nombre: streamingSite.name,
          tipo: sql<TipoSitio>`${streamingSite.kind}`,
          esGlobal: streamingSite.isGlobal,
          orden: streamingSite.sort,
        })
        .from(streamingSite)
        .where(visibles())
        .orderBy(asc(streamingSite.sort), asc(streamingSite.name));

      if (filas.length === 0) return [];

      const espejos = await cliente
        .select({
          id: streamingMirror.id,
          siteId: streamingMirror.siteId,
          etiqueta: streamingMirror.label,
          url: streamingMirror.url,
          activo: streamingMirror.isActive,
          comprobadoEn: streamingMirror.lastCheckedAt,
          orden: streamingMirror.sort,
        })
        .from(streamingMirror)
        .innerJoin(streamingSite, eq(streamingSite.id, streamingMirror.siteId))
        .where(visibles())
        .orderBy(asc(streamingMirror.sort), asc(streamingMirror.label));

      const porSitio = new Map<string, SitioConEspejos["espejos"][number][]>();
      for (const espejo of espejos) {
        const lista = porSitio.get(espejo.siteId) ?? [];
        lista.push({
          id: espejo.id,
          etiqueta: espejo.etiqueta,
          url: espejo.url,
          activo: espejo.activo,
          comprobadoEn: espejo.comprobadoEn,
          orden: espejo.orden,
        });
        porSitio.set(espejo.siteId, lista);
      }

      return filas.map((fila) => ({ ...fila, espejos: porSitio.get(fila.id) ?? [] }));
    },

    /**
     * Crea un sitio PROPIO.
     *
     * El `slug` se deriva del nombre y lleva el `userId` dentro, porque
     * `uq_streaming_site_slug` es único **globalmente**: sin eso, el primer
     * usuario que añadiera «Mi sitio» impediría a todos los demás usar ese
     * nombre — y el mensaje de error diría «ya existe» sobre algo que no ve.
     */
    async crear(datos: DatosSitio) {
      const base = datos.nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Mn}+/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const [fila] = await cliente
        .insert(streamingSite)
        .values({
          slug: `u-${ctx.userId.slice(0, 8)}-${base === "" ? "sitio" : base}`,
          name: datos.nombre,
          kind: datos.tipo,
          isGlobal: false,
          userId: ctx.userId,
          sort: 1000,
        })
        .onConflictDoNothing({ target: streamingSite.slug })
        .returning({ id: streamingSite.id });

      return fila ?? null;
    },

    /** Renombra o recategoriza un sitio PROPIO. `null` si no es suyo. */
    async editar(sitioId: string, datos: Partial<DatosSitio>) {
      const cambios: Record<string, unknown> = {};
      if (datos.nombre !== undefined) cambios["name"] = datos.nombre;
      if (datos.tipo !== undefined) cambios["kind"] = datos.tipo;
      if (Object.keys(cambios).length === 0) return null;

      const [fila] = await cliente
        .update(streamingSite)
        .set(cambios)
        .where(mio(sitioId))
        .returning({ id: streamingSite.id });

      return fila ?? null;
    },

    /** Borra un sitio PROPIO. Sus espejos se van por cascada. */
    async borrar(sitioId: string) {
      const [fila] = await cliente
        .delete(streamingSite)
        .where(mio(sitioId))
        .returning({ id: streamingSite.id });

      return fila ?? null;
    },

    /**
     * Añade un espejo a un sitio PROPIO.
     *
     * Dos sentencias por el mismo motivo que `guardarEnlace` en el vault: el
     * `INSERT … SELECT` de Drizzle exige que los campos casen uno a uno con la
     * tabla, y añadir una columna rompería la consulta en runtime. Lo que hace
     * segura la versión de dos pasos es que **nada cambia el dueño de un
     * sitio**: no hay método que lo haga.
     */
    async anadirEspejo(sitioId: string, datos: DatosEspejo) {
      const [propio] = await cliente
        .select({ id: streamingSite.id })
        .from(streamingSite)
        .where(mio(sitioId))
        .limit(1);

      if (propio === undefined) return null;

      const existentes = await cliente
        .select({ etiqueta: streamingMirror.label, orden: streamingMirror.sort })
        .from(streamingMirror)
        .where(eq(streamingMirror.siteId, propio.id));

      const etiqueta =
        datos.etiqueta === undefined || datos.etiqueta === null || datos.etiqueta.trim() === ""
          ? siguienteEtiquetaDeEspejo(existentes.map((e) => e.etiqueta))
          : datos.etiqueta.trim();

      const [fila] = await cliente
        .insert(streamingMirror)
        .values({
          siteId: propio.id,
          label: etiqueta,
          url: datos.url,
          sort: existentes.length === 0 ? 0 : Math.max(...existentes.map((e) => e.orden)) + 1,
        })
        .returning({ id: streamingMirror.id, etiqueta: streamingMirror.label });

      return fila ?? null;
    },

    /** Borra un espejo de un sitio PROPIO. */
    async borrarEspejo(espejoId: string) {
      const [fila] = await cliente
        .delete(streamingMirror)
        .where(and(eq(streamingMirror.id, espejoId), espejoMio()))
        .returning({ id: streamingMirror.id });

      return fila ?? null;
    },

    /**
     * Anota el resultado de una comprobación. **Nunca borra.**
     *
     * Skill §8: «se marca `is_active = false` los caídos, guardando
     * `last_checked_at`. Nunca se borra un espejo automáticamente». Un 503 de
     * hoy puede ser un 200 mañana, y borrarlo obliga al usuario a volver a
     * buscar una dirección que ya tenía.
     */
    async anotarComprobacion(espejoId: string, vivo: boolean, ahora = new Date()) {
      const [fila] = await cliente
        .update(streamingMirror)
        .set({ isActive: vivo, lastCheckedAt: ahora })
        .where(and(eq(streamingMirror.id, espejoId), espejoMio()))
        .returning({ id: streamingMirror.id, activo: streamingMirror.isActive });

      return fila ?? null;
    },

    /** Los espejos propios que hay que comprobar, con su URL. */
    async espejosParaComprobar() {
      return cliente
        .select({ id: streamingMirror.id, url: streamingMirror.url })
        .from(streamingMirror)
        .where(espejoMio());
    },
  };
}

/**
 * Siembra los sitios globales. **Idempotente.**
 *
 * No lleva contexto de usuario porque no escribe nada de nadie: son las filas
 * `is_global = true` que ve todo el mundo. Vive aquí y no en `vaultDe` por eso
 * mismo — meterla en el vault daría a entender que pertenecen a alguien.
 *
 * `onConflictDoNothing` sobre `slug` la hace repetible: correrla dos veces no
 * duplica ni pisa un nombre que el dueño haya corregido.
 */
export async function sembrarSitiosGlobales(
  sitios: readonly { slug: string; nombre: string; tipo: TipoSitio; orden: number }[],
  cliente: ClienteInterno = dbInterna(),
): Promise<number> {
  if (sitios.length === 0) return 0;

  const filas = await cliente
    .insert(streamingSite)
    .values(
      sitios.map((sitio) => ({
        slug: sitio.slug,
        name: sitio.nombre,
        kind: sitio.tipo,
        isGlobal: true,
        userId: null,
        sort: sitio.orden,
      })),
    )
    .onConflictDoNothing({ target: streamingSite.slug })
    .returning({ id: streamingSite.id });

  return filas.length;
}

/** Cuántos sitios globales hay. Para que el seed pueda decir la verdad. */
export async function contarSitiosGlobales(cliente: ClienteInterno = dbInterna()): Promise<number> {
  const [fila] = await cliente
    .select({ n: sql<number>`count(*)::int` })
    .from(streamingSite)
    .where(and(eq(streamingSite.isGlobal, true), isNull(streamingSite.userId)));

  return fila?.n ?? 0;
}
