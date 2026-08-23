import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { normalizarTitulo } from "@/lib/domain/normalizar";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { conTransaccion, dbInterna, type ClienteInterno } from "./interno";
import { anime, animeCover, continueLink, progress } from "./schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL VAULT — la única puerta a los datos de un usuario.
 *
 * **No hay forma de llegar a las tablas sin pasar por aquí**, y no hay forma de
 * entrar aquí sin un `ContextoUsuario`, que a su vez no se puede falsificar.
 * Ver `contexto.ts` para las cuatro capas y dónde está el hueco.
 *
 * REGLA INTERNA DE ESTE FICHERO, y es la única que hay que sostener a mano:
 * **toda consulta usa `mias()` o `mio(id)` en su `WHERE`.** No se escribe
 * `eq(anime.id, ...)` suelto en ningún sitio. Son cuatro líneas de vigilancia
 * en un solo archivo, en vez de cuarenta repartidas por la aplicación.
 *
 * Cada consulta tiene su test de mutación en `vault.integracion.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type DatosCrearAnime = {
  titulo: string;
  estado: string;
  formato?: string | null;
  anio?: number | null;
  notas?: string | null;
  esFavorito?: boolean;
  anilistId?: number | null;
};

export type DatosEditarAnime = Partial<Omit<DatosCrearAnime, "titulo">> & {
  titulo?: string;
};

/** Lo que devuelve un listado. **Nunca incluye los bytes de la portada.** */
export type AnimeEnListado = {
  id: string;
  titulo: string;
  estado: string;
  esFavorito: boolean;
  anio: number | null;
  actualizadoEn: Date;
  /** Para construir la URL versionada. Los BYTES no viajan aquí. */
  checksumPortada: string | null;
  progresoEtiqueta: string | null;
};

/**
 * El contrato del vault, escrito explícitamente.
 *
 * No se deriva con `ReturnType<typeof vaultDe>` a propósito: un tipo derivado no
 * se puede leer, y esta interfaz ES la documentación de qué se puede hacer con
 * los datos de un usuario. Si una operación no está aquí, no existe.
 */
export interface Vault {
  /**
   * NO hay `userId` aquí, y es deliberado.
   *
   * Un `{ ...vault, userId: otroId }` copiaría los métodos —que son closures
   * sobre el contexto real y siguen filtrando bien— pero dejaría una etiqueta
   * MENTIROSA que acabaría en un log culpando al usuario equivocado.
   *
   * Quien tiene el contexto ya tiene el `userId`. Se elimina la superficie en
   * vez de vigilarla.
   */

  // Lectura
  listar(opciones?: { limite?: number }): Promise<AnimeEnListado[]>;
  obtener(animeId: string): Promise<typeof anime.$inferSelect | null>;
  contar(): Promise<number>;
  portada(
    animeId: string,
    tamano: "full" | "thumb",
  ): Promise<{ bytes: Buffer | null; mime: string; checksum: string } | null>;
  enlaceMasReciente(
    animeId: string,
  ): Promise<{ id: string; url: string; etiqueta: string | null } | null>;

  // Escritura
  crear(datos: DatosCrearAnime): Promise<{ id: string } | null>;
  editar(animeId: string, datos: DatosEditarAnime): Promise<{ id: string } | null>;
  borrar(animeId: string): Promise<{ id: string } | null>;
}

/**
 * Abre el vault de un usuario.
 *
 * Es imposible llamar a esto sin un `ContextoUsuario`, y es imposible fabricar
 * uno fuera de `src/auth.ts`. Ese es todo el mecanismo.
 *
 * @param ctx contexto de una sesión ya verificada contra la base
 * @param cliente cliente de base de datos; los tests de integración inyectan el
 *        suyo. Por defecto, el de la aplicación.
 */
export function vaultDe(ctx: ContextoUsuario, cliente: ClienteInterno = dbInterna()): Vault {
  // LA GARANTÍA DE VERDAD, y está en runtime. Los tipos bloquean el literal y
  // el `new`, pero un `any` —de `JSON.parse` o `Object.create`— se cuela sin
  // `as`. Aquí no: un contexto sin la marca privada no abre nada.
  // Ver `ContextoUsuario.esAutentico`.
  if (!ContextoUsuario.esAutentico(ctx)) {
    throw new ErrorContextoFalsificado();
  }

  /**
   * Condición de propiedad. **Todo `WHERE` de este fichero empieza por aquí.**
   */
  const mias = () => eq(anime.userId, ctx.userId);

  /** Un anime concreto, pero solo si es suyo. Las DOS condiciones, siempre. */
  const mio = (animeId: string) => and(eq(anime.id, animeId), mias());

  return {
    // ─────────────────────────────────────────────────────────────────────
    // LECTURA
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Listado de la biblioteca.
     *
     * `anime_cover.bytes` NO se selecciona: son megabytes por fila. Solo viaja
     * el `checksum`, que es lo que necesita la URL versionada de `/api/covers`.
     */
    async listar(opciones: { limite?: number } = {}): Promise<AnimeEnListado[]> {
      return (
        cliente
          .select({
            id: anime.id,
            titulo: anime.title,
            estado: anime.status,
            esFavorito: anime.isFavorite,
            anio: anime.year,
            actualizadoEn: anime.updatedAt,
            checksumPortada: animeCover.checksum,
            progresoEtiqueta: progress.label,
          })
          .from(anime)
          // Las tablas hijas se alcanzan por JOIN contra `anime` YA filtrado,
          // nunca con un `WHERE anime_id = ?` suelto.
          .leftJoin(animeCover, eq(animeCover.animeId, anime.id))
          .leftJoin(progress, eq(progress.animeId, anime.id))
          .where(mias())
          .orderBy(desc(anime.updatedAt))
          .limit(opciones.limite ?? 500)
      );
    },

    /** Un anime por id. `null` si no existe **o no es suyo** (indistinguible). */
    async obtener(animeId: string) {
      const [fila] = await cliente.select().from(anime).where(mio(animeId)).limit(1);
      return fila ?? null;
    },

    /** ¿Cuántos animes tiene? */
    async contar(): Promise<number> {
      const [fila] = await cliente
        .select({ n: sql<number>`count(*)::int` })
        .from(anime)
        .where(mias());
      return fila?.n ?? 0;
    },

    /** Los bytes de una portada. La ÚNICA consulta que los selecciona. */
    async portada(animeId: string, tamano: "full" | "thumb") {
      const [fila] = await cliente
        .select({
          bytes: tamano === "full" ? animeCover.bytes : animeCover.thumbBytes,
          mime: animeCover.mime,
          checksum: animeCover.checksum,
        })
        .from(animeCover)
        .innerJoin(anime, eq(anime.id, animeCover.animeId))
        .where(and(eq(animeCover.animeId, animeId), mias()))
        .limit(1);

      return fila ?? null;
    },

    /** El enlace de continuación más reciente. */
    async enlaceMasReciente(animeId: string) {
      const [fila] = await cliente
        .select({
          id: continueLink.id,
          url: continueLink.url,
          etiqueta: continueLink.label,
        })
        .from(continueLink)
        .innerJoin(anime, eq(anime.id, continueLink.animeId))
        .where(and(eq(continueLink.animeId, animeId), mias()))
        .orderBy(desc(continueLink.lastUsedAt))
        .limit(1);

      return fila ?? null;
    },

    // ─────────────────────────────────────────────────────────────────────
    // ESCRITURA
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Crea un anime. El `user_id` lo pone el vault, **no quien llama**: es
     * imposible crear un anime a nombre de otro.
     */
    async crear(datos: DatosCrearAnime) {
      const [fila] = await cliente
        .insert(anime)
        .values({
          userId: ctx.userId,
          title: datos.titulo,
          titleNormalized: normalizarTitulo(datos.titulo),
          status: datos.estado,
          format: datos.formato ?? null,
          year: datos.anio ?? null,
          notes: datos.notas ?? null,
          isFavorite: datos.esFavorito ?? false,
          anilistId: datos.anilistId ?? null,
        })
        .returning({ id: anime.id });

      return fila ?? null;
    },

    /**
     * Edita un anime propio. Devuelve `null` si no existe o no es suyo, en vez
     * de tocar cero filas en silencio.
     */
    async editar(animeId: string, datos: DatosEditarAnime) {
      const cambios: Record<string, unknown> = { updatedAt: new Date() };

      if (datos.titulo !== undefined) {
        cambios.title = datos.titulo;
        // El normalizado se recalcula SIEMPRE que cambia el título: si se
        // desincroniza, la deduplicación deja de funcionar en silencio.
        cambios.titleNormalized = normalizarTitulo(datos.titulo);
      }
      if (datos.estado !== undefined) cambios.status = datos.estado;
      if (datos.formato !== undefined) cambios.format = datos.formato;
      if (datos.anio !== undefined) cambios.year = datos.anio;
      if (datos.notas !== undefined) cambios.notes = datos.notas;
      if (datos.esFavorito !== undefined) cambios.isFavorite = datos.esFavorito;

      const [fila] = await cliente
        .update(anime)
        .set(cambios)
        .where(mio(animeId))
        .returning({ id: anime.id });

      return fila ?? null;
    },

    /** Borra un anime propio. La cascada se lleva portada, progreso y enlaces. */
    async borrar(animeId: string) {
      const [fila] = await cliente.delete(anime).where(mio(animeId)).returning({ id: anime.id });

      return fila ?? null;
    },
  };
}

/**
 * Ejecuta varias operaciones del vault en UNA transacción.
 *
 * ── POR QUÉ ES UNA FUNCIÓN APARTE Y NO UN MÉTODO DEL VAULT ─────────────────
 *
 * El driver HTTP de Neon **no soporta transacciones interactivas**: cada
 * consulta es una petición independiente. Si `transaccion()` fuera un método del
 * vault, se podría llamar sobre un vault construido con el cliente HTTP y fallar
 * en runtime.
 *
 * Al ser una función aparte que abre su propio cliente por WebSocket, **no hay
 * forma de pedir una transacción sobre un cliente que no las soporta**. Otra vez
 * lo mismo: la forma de la API impide el error en vez de advertir de él.
 *
 * El callback recibe **otro vault**, atado al mismo contexto y al cliente
 * transaccional: dentro de la transacción sigue siendo imposible consultar sin
 * filtro por usuario.
 *
 *     await enTransaccion(ctx, async (vault) => {
 *       const creado = await vault.crear({ titulo, estado: "PENDIENTE" });
 *       // …portada y progreso, todo o nada
 *     });
 */
export async function enTransaccion<T>(
  ctx: ContextoUsuario,
  trabajo: (vault: Vault) => Promise<T>,
): Promise<T> {
  // Misma comprobación que en `vaultDe`: esta es la otra puerta.
  if (!ContextoUsuario.esAutentico(ctx)) {
    throw new ErrorContextoFalsificado();
  }

  return conTransaccion(async (cliente) =>
    cliente.transaction(async (tx) => trabajo(vaultDe(ctx, tx))),
  );
}
