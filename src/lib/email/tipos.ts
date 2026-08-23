/** Contrato de envío de correo. Módulo puro: sin dependencias de infraestructura. */

export type MensajeEmail = {
  para: string;
  asunto: string;
  /** Cuerpo en texto plano. Obligatorio: no todos los clientes pintan HTML. */
  texto: string;
  html?: string;
};

/**
 * Motivo del fallo, con lo único que de verdad decide qué hacer después:
 * si merece la pena reintentar.
 */
export type MotivoFallo =
  /** 429 o 5xx, o un fallo de red. Reintentar tiene sentido. */
  | "TEMPORAL"
  /** 4xx que no es 429: dirección inválida, remitente no verificado, clave mala.
   *  Reintentar solo gasta tiempo y cuota: el resultado será el mismo. */
  | "PERMANENTE";

export type ResultadoEnvio =
  | { ok: true; driver: string; id?: string }
  | { ok: false; driver: string; motivo: MotivoFallo; estado?: number };

export type DriverEmail = {
  readonly nombre: string;
  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio>;
};

/**
 * Clasifica un código HTTP.
 *
 * 429 y 5xx son temporales; el resto de 4xx son permanentes. Un 401 por clave
 * incorrecta NO se reintenta: reintentarlo tres veces con backoff solo retrasa
 * el registro del usuario nueve segundos para acabar igual.
 */
export function clasificarEstadoHttp(estado: number): MotivoFallo {
  if (estado === 429 || estado >= 500) return "TEMPORAL";
  return "PERMANENTE";
}
