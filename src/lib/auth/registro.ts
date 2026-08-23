/**
 * Qué hacer cuando el correo de verificación falla durante el registro.
 *
 * EL PROBLEMA: si Resend devuelve 429 o 5xx justo después de crear el usuario,
 * la cuenta queda creada y sin correo. Al reintentar el registro, el usuario
 * choca contra el UNIQUE del email y ve «ya existe» — pero no puede entrar,
 * porque nunca recibió el enlace. **Un estado del que no se puede salir.**
 *
 * LA DECISIÓN: la cuenta se crea igualmente y SIEMPRE hay una salida.
 *
 *   1. El usuario y su token se guardan en la misma transacción.
 *   2. El correo se envía DESPUÉS de confirmar esa transacción, con reintentos.
 *   3. Si aun así falla, el registro se considera CORRECTO y la pantalla ofrece
 *      «reenviar verificación».
 *   4. El login también ofrece reenviar si la cuenta existe y no está verificada.
 *
 * POR QUÉ EL CORREO VA DESPUÉS DE LA TRANSACCIÓN Y NO DENTRO: una transacción
 * abierta esperando a un tercero puede quedarse minutos bloqueando una conexión
 * de Neon. Y si el correo va dentro y falla, un rollback borraría un usuario que
 * quizá sí recibió el correo — lo peor de los dos mundos.
 *
 * Módulo puro: decide, no ejecuta.
 */

export type ResultadoRegistro = {
  /** Siempre true si la transacción cuajó: el correo NO decide si hay cuenta. */
  cuentaCreada: boolean;
  correoEnviado: boolean;
  /** Qué se le enseña al usuario. */
  siguientePaso: SiguientePaso;
};

export type SiguientePaso =
  /** Todo bien: «te hemos enviado un correo». */
  | "REVISAR_CORREO"
  /** La cuenta existe pero el correo no salió: se ofrece reenviar. */
  | "REENVIAR_VERIFICACION"
  /** No hace falta verificar (bandera apagada): a entrar directamente. */
  | "ENTRAR";

export function decidirSiguientePaso(contexto: {
  seExigeVerificacion: boolean;
  correoEnviado: boolean;
}): SiguientePaso {
  // Sin verificación obligatoria, el correo es informativo: que falle no bloquea
  // nada, porque el usuario puede entrar igual.
  if (!contexto.seExigeVerificacion) {
    return "ENTRAR";
  }

  return contexto.correoEnviado ? "REVISAR_CORREO" : "REENVIAR_VERIFICACION";
}

/**
 * ¿Se le puede ofrecer «reenviar verificación» a quien intenta registrarse con
 * un email que ya existe?
 *
 * CUIDADO CON LA ENUMERACIÓN: decir «esa cuenta existe pero no está verificada»
 * confirma qué direcciones están registradas. Por eso la respuesta HTTP es
 * siempre la misma (`REVISAR_CORREO`) exista o no la cuenta, y lo que cambia es
 * lo que se hace por detrás:
 *
 *   · cuenta nueva          → se crea y se envía la verificación
 *   · existe, sin verificar → NO se toca, se reenvía la verificación
 *   · existe y verificada   → NO se toca, se envía un «ya tienes cuenta, entra»
 *
 * En los tres casos el usuario ve el mismo mensaje, y en los tres recibe un
 * correo útil. Quien no sea el titular no aprende nada.
 */
export type AccionRegistroDuplicado = "CREAR" | "REENVIAR_VERIFICACION" | "AVISAR_YA_REGISTRADO";

export function accionAnteEmailExistente(cuenta: {
  existe: boolean;
  verificada: boolean;
}): AccionRegistroDuplicado {
  if (!cuenta.existe) return "CREAR";
  return cuenta.verificada ? "AVISAR_YA_REGISTRADO" : "REENVIAR_VERIFICACION";
}

/**
 * Mensaje único del registro. Idéntico en los tres casos anteriores, a propósito.
 */
export const MENSAJE_REGISTRO =
  "Si la dirección es válida, te hemos enviado un correo. Revisa tu bandeja de entrada.";

/**
 * ¿Puede este usuario pedir que le reenvíen la verificación?
 *
 * Una cuenta ya verificada no necesita reenvío, y permitirlo convertiría el
 * endpoint en un generador de correo gratuito hacia terceros.
 */
export function puedeReenviarVerificacion(cuenta: {
  existe: boolean;
  verificada: boolean;
  deletedAt: Date | null;
}): boolean {
  return cuenta.existe && !cuenta.verificada && cuenta.deletedAt === null;
}
