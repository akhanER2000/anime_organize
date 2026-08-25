import { MENSAJES, mensajeRecuperarEnviado } from "@/lib/auth/mensajes";
import { EsquemaRecuperar } from "@/lib/validation/auth";

import {
  CADUCIDAD_ENLACE_MINUTOS,
  MENSAJE_DEMASIADOS_INTENTOS,
  SEGUNDOS_ANTES_DE_REENVIAR,
} from "./constantes";

import type { DatosRecuperar } from "@/lib/validation/auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL FLUJO DE «RECUPERAR ACCESO», SIN NADA ALREDEDOR.
 *
 * Aquí vive el ORDEN —parsear → rate limit → trabajar— y nada más: ni
 * cabeceras, ni Postgres, ni Argon2, ni correo. Todo lo que hace efecto entra
 * como dependencia inyectada.
 *
 * ── POR QUÉ ES UN `.ts` Y NO PARTE DE `acciones.ts` ───────────────────────
 * 1. **Vitest corre con `environment: "node"` y no transforma `.tsx`.** Un
 *    módulo `"use server"` tampoco se importa desde un test sin arrastrar
 *    `next/headers` entero.
 * 2. **Se puede AFIRMAR que el trabajo no se llega a hacer.** Con las
 *    dependencias inyectadas, el test comprueba que `emitirEnlace` recibe CERO
 *    llamadas cuando el límite bloquea. Sin inyección eso solo se podría
 *    comprobar leyendo el código.
 *
 * ── LAS DOS REGLAS QUE ESTE MÓDULO HACE CUMPLIR ───────────────────────────
 *
 * **(a) La respuesta es IDÉNTICA exista o no la cuenta.** Si no lo fuera, el
 * formulario se convertiría en un buscador de direcciones registradas: se
 * escriben mil correos, se miran mil respuestas y se sabe cuáles tienen cuenta
 * (`security.md` §2). Por eso el sobre de éxito se construye UNA vez, en
 * `RESPUESTA_ENVIADO`, y no hay una segunda rama que pueda divergir.
 *
 * **(b) Los dos caminos tardan lo mismo.** Cuidar el mensaje no basta: si el
 * camino «no hay cuenta» responde en microsegundos y el real tarda decenas de
 * milisegundos —consulta, token, correo—, la existencia de la cuenta se deduce
 * **cronometrando**, sin leer un solo texto. Cuando no hay trabajo que hacer se
 * llama a `consumirTiempoEquivalente()`, que paga el mismo precio en CPU que
 * una verificación Argon2id (`security.md` § «Enumeración por tiempo»).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Códigos de `.claude/rules/api-conventions.md` § «Códigos de error».
 *
 * Se declaran aquí porque `src/lib/api/errors.ts` —que la regla nombra como su
 * hogar— todavía no existe. Los nombres ya coinciden a propósito: el día que
 * exista, esto es un cambio de import y nada más.
 */
export type CodigoErrorRecuperar = "VALIDACION" | "LIMITE_EXCEDIDO" | "ERROR_INTERNO";

/** Los campos del formulario. Sale del esquema, no de una lista escrita a mano. */
export type CampoRecuperar = keyof DatosRecuperar;

/** Un error de validación atado a su campo, para que el formulario lo pinte donde toca. */
export type DetalleCampo = { campo: CampoRecuperar; motivo: string };

/** Lo que la pantalla necesita para pintar el estado de éxito. */
export type DatosEnviado = {
  /** El texto canónico de `MENSAJES`, que no confirma si la cuenta existe. */
  mensaje: string;
  /** Sale de la constante, nunca de un número escrito a mano en la vista. */
  minutosCaducidad: number;
  /** Cuánto dura la cuenta atrás COSMÉTICA del botón de reenvío. */
  segundosHastaReenvio: number;
};

/**
 * El sobre de `api-conventions.md`. Las Server Actions devuelven el mismo que
 * los Route Handlers y **no lanzan al cliente**, para que el formulario pueda
 * pintar el error sin `try/catch` en el componente.
 *
 * `reintentarEnSegundos` va suelto y no dentro de `detalles` a propósito: la
 * convención reserva `detalles` para errores de campo. En un Route Handler esto
 * viajaría en la cabecera `Retry-After`, que una Server Action no puede poner.
 */
export type RespuestaRecuperar =
  | { ok: true; data: DatosEnviado }
  | {
      ok: false;
      error: {
        codigo: CodigoErrorRecuperar;
        mensaje: string;
        detalles?: DetalleCampo[];
        reintentarEnSegundos?: number;
      };
    };

/**
 * Qué se hizo de verdad. **Nunca sale de aquí hacia el cliente**: es lo único
 * que distingue una cuenta existente de una inexistente, así que se queda
 * dentro del servidor y solo decide si hay que pagar el tiempo equivalente.
 */
export type ResultadoEmision = "ENVIADO" | "NADA_QUE_HACER";

/** Todo lo que toca el mundo exterior, inyectado. */
export type DependenciasRecuperar = {
  /**
   * Registra el intento y decide. Se llama SIEMPRE antes de trabajar, y recibe
   * el email ya normalizado por Zod porque la clave del limitador se calcula
   * sobre ese valor: sin normalizar, `A@B.com` y `a@b.com` serían dos cubos
   * distintos y el límite se saltaría cambiando las mayúsculas
   * (`security.md` §5).
   */
  comprobarLimite: (datos: {
    email: string;
  }) => Promise<{ permitido: boolean; reintentarEnSegundos: number }>;

  /**
   * Genera el token, lo guarda y manda el correo. Devuelve `NADA_QUE_HACER`
   * cuando no hay cuenta detrás de esa dirección.
   */
  emitirEnlace: (datos: { email: string }) => Promise<ResultadoEmision>;

  /** Paga en CPU lo que el camino real habría pagado en trabajo. */
  consumirTiempoEquivalente: () => Promise<void>;
};

/**
 * EL SOBRE DE ÉXITO, CONSTRUIDO UNA SOLA VEZ.
 *
 * Que sea una constante y no dos objetos idénticos en dos ramas es la mitad de
 * la defensa contra la enumeración: no hay una segunda copia que alguien pueda
 * «mejorar» dentro de seis meses sin darse cuenta de que la diferencia es
 * justo el oráculo. Es el mismo razonamiento de
 * `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` en `mensajes.ts`.
 */
const RESPUESTA_ENVIADO: RespuestaRecuperar = {
  ok: true,
  data: {
    // El texto lleva DENTRO la caducidad real, sacada de la constante que usa
    // el backend para el `expires_at`. Ver `mensajeRecuperarEnviado`.
    mensaje: mensajeRecuperarEnviado(CADUCIDAD_ENLACE_MINUTOS),
    minutosCaducidad: CADUCIDAD_ENLACE_MINUTOS,
    segundosHastaReenvio: SEGUNDOS_ANTES_DE_REENVIAR,
  },
};

/**
 * Pide un enlace de recuperación.
 *
 * @param entrada lo que manda el formulario. `unknown` A PROPÓSITO: tiparlo
 * como `DatosRecuperar` sería una promesa que el navegador no tiene por qué
 * cumplir. Se parsea con Zod dentro (`security.md` §8).
 */
export async function ejecutarRecuperacion(
  entrada: unknown,
  deps: DependenciasRecuperar,
): Promise<RespuestaRecuperar> {
  // ── 1. PARSEAR ───────────────────────────────────────────────────────────
  // Antes que nada: sin un email válido no hay clave de limitador que calcular.
  const parseado = EsquemaRecuperar.safeParse(entrada);

  if (!parseado.success) {
    return {
      ok: false,
      error: {
        codigo: "VALIDACION",
        mensaje: MENSAJES.campos.emailMalFormado,
        // Un fallo de FORMATO sí se puede señalar en el campo: comprueba la
        // forma del texto, no si la cuenta existe. No enumera a nadie.
        detalles: [{ campo: "email", motivo: primerMotivo(parseado.error.issues) }],
      },
    };
  }

  const { email } = parseado.data;

  // ── 2. RATE LIMIT ────────────────────────────────────────────────────────
  // Lo PRIMERO que toca la base, y antes de cualquier trabajo caro. Sin esto,
  // el formulario sería un generador gratuito de correo hacia terceros y un
  // amplificador de coste: cada petición dispara consulta, token y proveedor.
  const limite = await deps.comprobarLimite({ email });

  if (!limite.permitido) {
    return {
      ok: false,
      error: {
        codigo: "LIMITE_EXCEDIDO",
        mensaje: MENSAJE_DEMASIADOS_INTENTOS,
        reintentarEnSegundos: limite.reintentarEnSegundos,
      },
    };
  }

  // ── 3. Y SOLO ENTONCES, TRABAJAR ─────────────────────────────────────────
  const emision = await deps.emitirEnlace({ email });

  if (emision === "NADA_QUE_HACER") {
    // El camino vacío paga lo mismo que el real. Ver la nota (b) de la
    // cabecera: sin esto, la existencia de la cuenta se lee en el cronómetro.
    await deps.consumirTiempoEquivalente();
  }

  // MISMA respuesta en los dos casos. No hay rama que devuelva otra cosa.
  return RESPUESTA_ENVIADO;
}

/**
 * El motivo del primer problema de validación, con red de seguridad.
 *
 * `noUncheckedIndexedAccess` obliga a tratar `issues[0]` como opcional, y hace
 * bien: un `ZodError` sin `issues` no debería existir, pero si existiera, el
 * `!` que lo daría por hecho sería una excepción en producción esperando turno
 * (`code-style.md`).
 */
function primerMotivo(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? MENSAJES.campos.emailMalFormado;
}
