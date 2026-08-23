/**
 * Validez de una sesión JWT contra el estado real del usuario.
 *
 * EL PROBLEMA QUE RESUELVE: un JWT es válido hasta que expira. El servidor no
 * guarda nada, así que **no puede revocarlo**. Sin esta comprobación:
 *
 *   · borro mi cuenta → mi token me sigue autenticando durante días,
 *     contra un `user_id` que ya no existe;
 *   · me roban la sesión y cambio la contraseña → el token robado sigue valiendo,
 *     que es justo lo contrario de lo que el usuario cree que ha hecho.
 *
 * LA SOLUCIÓN: en el callback de sesión se comprueba contra la base que
 *   (a) el usuario existe,
 *   (b) `deleted_at` es NULL,
 *   (c) el token se emitió DESPUÉS de `users.sessions_valid_from`.
 *
 * Módulo PURO: la decisión se separa de la consulta para poder testear las tres
 * condiciones sin base de datos.
 *
 * COSTE ACEPTADO: una consulta por petición autenticada, por clave primaria e
 * indexada. Renuncia a parte de la gracia del JWT (no tocar la base), y es
 * deliberado: una sesión que no se puede revocar no es aceptable en una app con
 * borrado de cuenta. Cachearlo reintroduciría exactamente la ventana que esto
 * cierra.
 */

/** Lo que la base dice del usuario del token. `null` = no existe. */
export type EstadoCuenta = {
  deletedAt: Date | null;
  sessionsValidFrom: Date;
} | null;

export type MotivoSesionInvalida =
  | "USUARIO_NO_EXISTE"
  | "CUENTA_DESACTIVADA"
  | "SESION_REVOCADA"
  | "TOKEN_SIN_IAT";

export type VeredictoSesion =
  | { valida: true }
  | { valida: false; motivo: MotivoSesionInvalida };

/**
 * ¿Sigue siendo válida esta sesión?
 *
 * @param cuenta  estado en la base, o `null` si el usuario ya no existe
 * @param iatSegundos  `iat` del JWT, en SEGUNDOS (es lo que marca el estándar)
 */
export function evaluarSesion(cuenta: EstadoCuenta, iatSegundos: number | undefined): VeredictoSesion {
  // El usuario borró su cuenta: el `user_id` del token no apunta a nada. Este es
  // el caso que hace que borrar la cuenta eche a la sesión de verdad.
  if (cuenta === null) {
    return { valida: false, motivo: "USUARIO_NO_EXISTE" };
  }

  if (cuenta.deletedAt !== null) {
    return { valida: false, motivo: "CUENTA_DESACTIVADA" };
  }

  // Un token sin `iat` no se puede fechar, así que no se puede saber si es
  // anterior al corte. Se rechaza: ante la duda, fuera.
  if (iatSegundos === undefined || !Number.isFinite(iatSegundos)) {
    return { valida: false, motivo: "TOKEN_SIN_IAT" };
  }

  const emitidoEnMs = Math.floor(iatSegundos) * 1000;
  const corteMs = cuenta.sessionsValidFrom.getTime();

  /**
   * Emitido ANTES del corte → revocado.
   *
   * Comparación con `<` y no `<=`: al cambiar la contraseña se pone el corte a
   * `now()` y se emite un token nuevo, que puede caer en el MISMO segundo. Con
   * `<=` se rechazaría el token recién emitido y el usuario quedaría fuera justo
   * después de cambiar su contraseña.
   *
   * Contrapartida conocida: un token robado emitido en el mismo segundo exacto
   * del cambio sobrevive. Es una ventana de un segundo que exige que el robo
   * haya ocurrido en ese mismo segundo; el borrado de cuenta no la tiene, porque
   * ahí manda `USUARIO_NO_EXISTE`, que no depende del reloj.
   */
  if (emitidoEnMs < corteMs) {
    return { valida: false, motivo: "SESION_REVOCADA" };
  }

  return { valida: true };
}

/**
 * Marca de corte al revocar.
 *
 * Se resta un segundo para absorber el desfase de redondeo del `iat` (que va en
 * segundos enteros): sin esto, un token emitido a las 12:00:00.700 tiene
 * `iat` = 12:00:00.000 y un corte puesto a 12:00:00.400 lo mataría por error.
 * Al restar, el corte nunca cae por delante del `iat` de un token legítimo ya
 * emitido en ese mismo segundo.
 */
export function marcaDeRevocacion(ahora: Date): Date {
  return new Date(ahora.getTime() - 1000);
}

/** Operaciones que revocan TODAS las sesiones anteriores del usuario. */
export const OPERACIONES_QUE_REVOCAN = [
  "CAMBIO_PASSWORD",
  "RESET_PASSWORD",
  "CIERRE_TODAS_SESIONES",
  "BORRADO_CUENTA",
] as const;

export type OperacionRevocadora = (typeof OPERACIONES_QUE_REVOCAN)[number];
