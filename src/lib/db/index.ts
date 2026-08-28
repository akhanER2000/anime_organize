import "server-only";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PUERTA A LOS DATOS.
 *
 * Esto es lo ÚNICO que el código de aplicación importa de la capa de datos.
 * Fíjate en lo que NO se exporta: ni las tablas, ni el cliente crudo. No es un
 * olvido — es el mecanismo.
 *
 * Para consultar:
 *
 *     const { ctx } = await exigirSesionParaLeer();   // src/auth.ts
 *     const vault = vaultDe(ctx);
 *     const mios = await vault.listar();
 *
 * No hay atajo, y no hay «solo esta vez». Si necesitas una consulta que el vault
 * no tiene, se añade AL VAULT, donde el filtro por usuario viene dado por la
 * forma de la API en vez de por acordarse.
 *
 * Ver `contexto.ts` para las cuatro capas de garantía y dónde está el hueco.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export { ContextoUsuario, ErrorNoEncontrado, ErrorContextoFalsificado } from "./contexto";
export type { ModoAcceso } from "./contexto";

export { vaultDe, enTransaccion } from "./vault";
export type {
  Vault,
  AnimeEnListado,
  CeldaDeRecuento,
  DatosCrearAnime,
  DatosEditarAnime,
  DatosEnlace,
  DatosPortada,
  DatosProgreso,
} from "./vault";
