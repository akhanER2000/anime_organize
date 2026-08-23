import "server-only";

import { entornoEmail } from "./config";
import { driverConsola } from "./driver-consola";
import { crearDriverResend } from "./driver-resend";
import type { DriverEmail, MensajeEmail, ResultadoEnvio } from "./tipos";

export type { DriverEmail, MensajeEmail, ResultadoEnvio } from "./tipos";
export { plantillaVerificacion, plantillaReset } from "./plantillas";

/**
 * Envío de correo.
 *
 * DISEÑO: el driver se elige en runtime y **nunca es obligatorio tener clave**.
 *
 *   con RESEND_API_KEY  → se envía de verdad
 *   sin RESEND_API_KEY  → driver de consola, con un aviso claro en el log
 *
 * Esto no es una comodidad: es lo que permite desarrollar y ejecutar los tests
 * sin credenciales, y lo que hace que el día que se ponga la clave no haya que
 * tocar ni una línea de la autenticación.
 */

let cache: DriverEmail | null = null;

/** Resuelve el driver una sola vez por proceso. */
export function obtenerDriverEmail(): DriverEmail {
  if (cache !== null) return cache;

  const env = entornoEmail();

  if (env.resendApiKey !== undefined && env.emailFrom !== undefined) {
    cache = crearDriverResend({ apiKey: env.resendApiKey, from: env.emailFrom });
    return cache;
  }

  if (env.resendApiKey !== undefined && env.emailFrom === undefined) {
    // Clave sin remitente: es un error de configuración, no un modo de trabajo.
    // Se avisa fuerte y se cae a consola en vez de romper el registro.
    console.warn(
      "[email] RESEND_API_KEY está definida pero falta EMAIL_FROM. " +
        "No se puede enviar sin remitente: se usa el driver de consola. " +
        "Define EMAIL_FROM con una dirección de tu dominio verificado en Resend.",
    );
  }

  cache = driverConsola;
  return cache;
}

/** Solo para tests: obliga a reevaluar el entorno. */
export function reiniciarDriverEmail(): void {
  cache = null;
}

/**
 * Envía un correo.
 *
 * NO lanza si el envío falla: devuelve el resultado. Un fallo de correo no puede
 * tumbar un registro ni un cambio de contraseña — el usuario ya está creado y el
 * token ya está guardado; lo que procede es ofrecerle reenviar, no un 500.
 */
export async function enviarEmail(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
  const driver = obtenerDriverEmail();
  try {
    return await driver.enviar(mensaje);
  } catch (error) {
    // El mensaje del proveedor puede llevar la dirección o parte de la clave.
    console.error("[email] fallo al enviar", {
      driver: driver.nombre,
      asunto: mensaje.asunto,
      error: error instanceof Error ? error.message : "desconocido",
    });
    return { ok: false, driver: driver.nombre, motivo: "ERROR_PROVEEDOR" };
  }
}
