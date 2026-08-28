/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL SOBRE DE RESPUESTA — `api-conventions.md` § «Forma de la respuesta».
 *
 * ── POR QUÉ UN SOBRE Y NO UN THROW ────────────────────────────────────────
 *
 * Una Server Action que lanza llega al cliente como un error genérico: en
 * producción Next **borra el mensaje** y manda un digest, precisamente para no
 * filtrar las tripas del servidor. Así que un `throw new Error("Ya tienes este
 * anime")` se convierte en «Se ha producido un error» y el usuario no se entera
 * de nada.
 *
 * Devolver el sobre deja el mensaje intacto y con un `codigo` estable por el que
 * el formulario puede ramificar. Los errores de verdad —los que no se esperan—
 * sí lanzan, y ahí el digest es lo correcto.
 *
 * ── `ok: true` CON UN AVISO NO ES UNA CONTRADICCIÓN ───────────────────────
 *
 * `api-conventions.md` lo fija: `ANIME_SIMILAR` e `IA_NO_CONFIGURADA` van con
 * **200 y `ok: true`**. Son resultados esperados del flujo, no fallos. Meterlos
 * en la rama de error obligaría al cliente a tratar «puede que ya lo tengas» con
 * el mismo camino que «la base no responde», y a pintarlo en granate.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Códigos estables. **El cliente ramifica por esto, nunca por `mensaje`.**
 *
 * Están en `SCREAMING_SNAKE_CASE` y no cambian: un `mensaje` se puede reescribir
 * para que se lea mejor, y si alguien hubiera comparado contra él, la interfaz
 * dejaría de reaccionar sin que ningún test lo viera.
 */
export const CODIGOS = [
  "NO_AUTENTICADO",
  "NO_ENCONTRADO",
  "VALIDACION",
  "ANIME_DUPLICADO",
  "LIMITE_EXCEDIDO",
  "IMAGEN_NO_DESCARGABLE",
  "IMAGEN_DEMASIADO_GRANDE",
  "TIPO_NO_SOPORTADO",
  "PROVEEDOR_NO_DISPONIBLE",
  "CONFLICTO_ESTADO",
  "ERROR_INTERNO",
] as const;

export type CodigoError = (typeof CODIGOS)[number];

export type Fallo = {
  readonly codigo: CodigoError;
  /** En español y apto para enseñárselo al usuario TAL CUAL. */
  readonly mensaje: string;
  /**
   * Solo errores de campo.
   *
   * **Nunca** un stack, un SQL, un hostname interno ni el error del driver:
   * `api-conventions.md` § «Registro de errores». Lo inesperado se loguea con
   * un `requestId` y al cliente solo le llega ese id.
   */
  readonly detalles?: readonly { readonly campo: string; readonly motivo: string }[];
};

export type Respuesta<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: Fallo };

export function exito<T>(data: T): Respuesta<T> {
  return { ok: true, data };
}

export function fallo(
  codigo: CodigoError,
  mensaje: string,
  detalles?: Fallo["detalles"],
): Respuesta<never> {
  return {
    ok: false,
    error: detalles === undefined ? { codigo, mensaje } : { codigo, mensaje, detalles },
  };
}

/**
 * Traduce un `ZodError` al sobre, sin filtrar la forma del esquema.
 *
 * `issue.path` puede llevar índices numéricos y claves anidadas; se aplana con
 * puntos porque es lo que el formulario usa como nombre de campo. Un `path`
 * vacío —el error es del objeto entero, no de un campo— se llama `_` en vez de
 * quedarse en blanco, que dejaría un `<label for="">` apuntando a nada.
 */
export function falloDeValidacion(
  problemas: readonly { path: PropertyKey[]; message: string }[],
): Respuesta<never> {
  const detalles = problemas.map((problema) => ({
    campo: problema.path.length === 0 ? "_" : problema.path.map(String).join("."),
    motivo: problema.message,
  }));

  return fallo("VALIDACION", "Revisa los campos marcados.", detalles);
}
