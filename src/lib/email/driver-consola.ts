import "server-only";

import type { DriverEmail, MensajeEmail, ResultadoEnvio } from "./tipos";

/**
 * Driver por defecto: imprime el correo en el log del servidor.
 *
 * No es un "modo degradado" vergonzante: es el modo normal de desarrollo. El
 * enlace sale completo y clicable en la terminal, que para un vault de una sola
 * persona es más cómodo que abrir el buzón.
 */
export const driverConsola: DriverEmail = {
  nombre: "consola",

  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
    const linea = "─".repeat(72);
    console.info(
      [
        "",
        linea,
        "  CORREO NO ENVIADO — driver de consola",
        "  Define RESEND_API_KEY y EMAIL_FROM para enviarlo de verdad.",
        linea,
        `  Para:    ${mensaje.para}`,
        `  Asunto:  ${mensaje.asunto}`,
        linea,
        mensaje.texto,
        linea,
        "",
      ].join("\n"),
    );

    // `ok: true` a propósito: el correo SÍ se ha entregado a su destino, que en
    // este modo es la consola. Devolver `false` haría que la aplicación creyera
    // que hubo un fallo y enseñara un error al usuario que no existe.
    return Promise.resolve({ ok: true, driver: "consola" });
  },
};
