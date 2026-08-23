/** Contrato de envío de correo. Módulo puro: sin dependencias de infraestructura. */

export type MensajeEmail = {
  para: string;
  asunto: string;
  /** Cuerpo en texto plano. Obligatorio: no todos los clientes pintan HTML. */
  texto: string;
  html?: string;
};

export type ResultadoEnvio =
  | { ok: true; driver: string; id?: string }
  | { ok: false; driver: string; motivo: "SIN_CONFIGURAR" | "ERROR_PROVEEDOR" };

export type DriverEmail = {
  readonly nombre: string;
  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio>;
};
