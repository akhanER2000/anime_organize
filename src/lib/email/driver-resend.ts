import "server-only";

import { clasificarEstadoHttp, type DriverEmail, type MensajeEmail, type ResultadoEnvio } from "./tipos";

/**
 * Driver de Resend, sobre su API HTTP.
 *
 * NO se usa el SDK `resend`: es una única petición POST con JSON, y evitar la
 * dependencia mantiene el bundle pequeño y una superficie menos que auditar.
 *
 * Plan gratuito: 3.000 correos/mes, 100/día, 1 dominio verificado. Hasta
 * verificar un dominio propio, Resend solo permite enviar a tu propia dirección.
 */
const ENDPOINT = "https://api.resend.com/emails";
const TIEMPO_MAXIMO_MS = 10_000;

export function crearDriverResend(opciones: { apiKey: string; from: string }): DriverEmail {
  return {
    nombre: "resend",

    async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
      let respuesta: Response;
      try {
        respuesta = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${opciones.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: opciones.from,
            to: [mensaje.para],
            subject: mensaje.asunto,
            text: mensaje.texto,
            ...(mensaje.html !== undefined ? { html: mensaje.html } : {}),
          }),
          signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        });
      } catch {
        // Red caída o timeout: temporal por definición. No se registra el error
        // en bruto porque puede llevar la URL con credenciales del proxy.
        return { ok: false, driver: "resend", motivo: "TEMPORAL" };
      }

      if (!respuesta.ok) {
        // El cuerpo de error de Resend puede incluir la dirección de destino.
        // Se registra el estado, nunca el cuerpo entero.
        console.error("[email] Resend respondió", respuesta.status);
        return {
          ok: false,
          driver: "resend",
          motivo: clasificarEstadoHttp(respuesta.status),
          estado: respuesta.status,
        };
      }

      const cuerpo: unknown = await respuesta.json();
      const id =
        typeof cuerpo === "object" && cuerpo !== null && "id" in cuerpo
          ? String((cuerpo as { id: unknown }).id)
          : undefined;

      return id !== undefined ? { ok: true, driver: "resend", id } : { ok: true, driver: "resend" };
    },
  };
}
