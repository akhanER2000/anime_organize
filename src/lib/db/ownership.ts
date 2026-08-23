import "server-only";

import { and, eq } from "drizzle-orm";

import { anime } from "./schema";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/**
 * Propiedad por `user_id`. La regla que domina todo el proyecto:
 * **ninguna consulta cruza usuarios, nunca.**
 *
 * Este módulo existe para que esa regla sea UNA función y no una disciplina
 * repetida en cuarenta sitios. Un olvido en cualquiera de esos cuarenta es una
 * fuga de datos entre usuarios.
 *
 * `.claude/rules/security.md` §1.
 */

/** Cualquiera de los clientes de Drizzle que usa el proyecto (HTTP, pool, tests). */
export type ClienteDb =
  | NeonHttpDatabase<Record<string, unknown>>
  | NeonDatabase<Record<string, unknown>>
  | NodePgDatabase<Record<string, unknown>>;

/**
 * Error de recurso no encontrado.
 *
 * SE USA TAMBIÉN CUANDO EL RECURSO EXISTE PERO ES DE OTRO USUARIO. Nunca un 403:
 * un 403 confirma que el recurso existe y permite enumerar los ids ajenos
 * probando uuids. Para quien pregunta, «no es tuyo» y «no existe» son
 * indistinguibles, que es exactamente lo que queremos.
 */
export class ErrorNoEncontrado extends Error {
  override readonly name = "ErrorNoEncontrado";
  readonly codigo = "NO_ENCONTRADO" as const;
  readonly estadoHttp = 404 as const;

  constructor(recurso = "recurso") {
    super(`No se ha encontrado el ${recurso}.`);
  }
}

/**
 * Devuelve el anime SOLO si pertenece a este usuario.
 *
 * @throws {ErrorNoEncontrado} si no existe **o no es suyo**.
 */
export async function exigirAnimePropio(
  db: ClienteDb,
  parametros: { animeId: string; userId: string },
): Promise<typeof anime.$inferSelect> {
  const [fila] = await db
    .select()
    .from(anime)
    .where(
      // Las DOS condiciones, siempre, en el mismo WHERE. Filtrar por id y
      // comprobar el dueño después en JavaScript es una carrera y un descuido
      // esperando a pasar.
      and(eq(anime.id, parametros.animeId), eq(anime.userId, parametros.userId)),
    )
    .limit(1);

  if (fila === undefined) {
    throw new ErrorNoEncontrado("anime");
  }

  return fila;
}

/**
 * ¿Es de este usuario? Versión que no lanza, para cuando la respuesta es un
 * booleano y no un recurso.
 */
export async function esAnimePropio(
  db: ClienteDb,
  parametros: { animeId: string; userId: string },
): Promise<boolean> {
  const [fila] = await db
    .select({ id: anime.id })
    .from(anime)
    .where(and(eq(anime.id, parametros.animeId), eq(anime.userId, parametros.userId)))
    .limit(1);

  return fila !== undefined;
}

/**
 * Condición reutilizable para componer consultas más grandes.
 *
 * Se expone para que las consultas de listado y los JOIN contra tablas hijas
 * (`anime_cover`, `progress`, `continue_link`, `anime_genre`) puedan llegar a
 * ellas **siempre** a través de un `anime` ya filtrado, en vez de con un
 * `WHERE anime_id = ?` a pelo sobre un id que viene del cliente.
 */
export function esDelUsuario(userId: string) {
  return eq(anime.userId, userId);
}
