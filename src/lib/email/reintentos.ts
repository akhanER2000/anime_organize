import type { ResultadoEnvio } from "./tipos";

/**
 * Reintento con retroceso exponencial y jitter.
 *
 * Módulo PURO: recibe la función de envío y la de espera, así que se testea sin
 * relojes reales ni esperas de verdad.
 *
 * REGLAS:
 *  · solo se reintenta lo `TEMPORAL` (429, 5xx, red). Un 4xx permanente
 *    —dirección inválida, remitente sin verificar, clave mala— da igual cuántas
 *    veces se repita: solo retrasa la respuesta al usuario.
 *  · con jitter, porque si veinte registros fallan a la vez por un 5xx de
 *    Resend, reintentar todos exactamente a los 500 ms recrea el pico que tumbó
 *    el servicio.
 *  · el tope de intentos es bajo A PROPÓSITO: esto corre dentro de la petición
 *    de registro, y el usuario está mirando una pantalla. Si no sale en ~3 s,
 *    la cuenta se crea igual y se le ofrece reenviar.
 */

export type OpcionesReintento = {
  /** Intentos TOTALES, incluido el primero. */
  intentos?: number;
  /** Retraso base en ms; se duplica en cada intento. */
  baseMs?: number;
  /** Tope de retraso por intento. */
  topeMs?: number;
  /** Inyectables para los tests. */
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
};

export type ResultadoConReintentos = {
  resultado: ResultadoEnvio;
  intentosUsados: number;
  /** Los retrasos aplicados, en orden. Útil para el log y para los tests. */
  esperas: number[];
};

const POR_DEFECTO = {
  intentos: 3,
  baseMs: 300,
  topeMs: 2_000,
} as const;

const dormirDeVerdad = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Calcula el retraso del intento `n` (0-indexado): exponencial con jitter
 * completo, acotado por `topeMs`.
 *
 * Jitter completo (aleatorio en [0, tope]) en vez de parcial: es lo que mejor
 * dispersa una avalancha de reintentos simultáneos.
 */
export function calcularEspera(
  intento: number,
  opciones: { baseMs: number; topeMs: number; aleatorio: () => number },
): number {
  const exponencial = Math.min(opciones.baseMs * 2 ** intento, opciones.topeMs);
  return Math.floor(opciones.aleatorio() * exponencial);
}

export async function enviarConReintentos(
  enviar: () => Promise<ResultadoEnvio>,
  opciones: OpcionesReintento = {},
): Promise<ResultadoConReintentos> {
  const intentos = opciones.intentos ?? POR_DEFECTO.intentos;
  const baseMs = opciones.baseMs ?? POR_DEFECTO.baseMs;
  const topeMs = opciones.topeMs ?? POR_DEFECTO.topeMs;
  const dormir = opciones.dormir ?? dormirDeVerdad;
  const aleatorio = opciones.aleatorio ?? Math.random;

  const esperas: number[] = [];
  let ultimo: ResultadoEnvio = { ok: false, driver: "ninguno", motivo: "TEMPORAL" };

  for (let n = 0; n < intentos; n += 1) {
    ultimo = await enviar();

    if (ultimo.ok) {
      return { resultado: ultimo, intentosUsados: n + 1, esperas };
    }

    // Permanente: no se reintenta. Reintentar un 422 tres veces solo hace que el
    // usuario espere más para recibir el mismo error.
    if (ultimo.motivo === "PERMANENTE") {
      return { resultado: ultimo, intentosUsados: n + 1, esperas };
    }

    const quedanIntentos = n < intentos - 1;
    if (quedanIntentos) {
      const espera = calcularEspera(n, { baseMs, topeMs, aleatorio });
      esperas.push(espera);
      await dormir(espera);
    }
  }

  return { resultado: ultimo, intentosUsados: intentos, esperas };
}
