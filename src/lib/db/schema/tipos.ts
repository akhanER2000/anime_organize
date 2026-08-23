import { customType } from "drizzle-orm/pg-core";

/**
 * Tipos de Postgres que Drizzle no trae de fábrica.
 *
 * Las extensiones que los habilitan (`citext`) se crean en la PRIMERA migración,
 * antes de cualquier tabla. Ver `drizzle/0000_extensiones.sql`.
 */

/**
 * `citext` — texto insensible a mayúsculas, para el email.
 *
 * Con `text` normal habría que recordar `lower(email)` en cada consulta y en cada
 * índice; olvidarlo una sola vez permite registrar `Juan@x.com` y `juan@x.com`
 * como dos cuentas distintas. `citext` lo resuelve en el tipo, no en la disciplina.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * `bytea` — binario. Aquí viven los bytes de las portadas.
 *
 * La URL de origen NUNCA es el almacenamiento: la fuente de verdad son estos
 * bytes. Ver la skill `anime-vault-domain` §5.
 *
 * CUIDADO: `anime_cover.bytes` y `thumb_bytes` no se seleccionan JAMÁS en un
 * listado — son megabytes por fila. Solo se leen en `/api/covers/[animeId]`.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
