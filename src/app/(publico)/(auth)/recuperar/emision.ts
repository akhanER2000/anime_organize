import "server-only";

import { enviarEmail, plantillaReset } from "@/lib/email";
import { emitirEnlaceDeReset } from "@/lib/db/cuentas";

import { CADUCIDAD_ENLACE_MS } from "./constantes";

import type { ResultadoEmision } from "./flujo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA COSTURA DEL ENVÍO. HOY NO ENVÍA NADA, Y ESTÁ ASÍ A PROPÓSITO.
 *
 * Esta función es el único punto por el que la pantalla «Recuperar acceso»
 * tocaría el mundo: buscar la cuenta, generar el token, guardarlo y mandar el
 * correo. Devuelve `NADA_QUE_HACER` porque **no puede hacerlo desde aquí**, y
 * el motivo no es que falte escribirlo: es que el contrato de datos lo prohíbe.
 *
 * ── POR QUÉ ESTÁ VACÍA ────────────────────────────────────────────────────
 *
 * **1. `password_reset_tokens` no se puede escribir desde `src/app/**`.**
 *    `.claude/rules/db-conventions.md` § «EL CONTRATO DE DATOS» cierra el
 *    acceso a las tablas crudas fuera de `src/lib/db/**`, y `eslint.config.mjs`
 *    lo hace cumplir: importar `@/lib/db/schema` o `@/lib/db/interno` desde una
 *    pantalla es un error de lint, y el import dinámico tampoco esquiva la
 *    regla. `vaultDe(ctx)` tampoco sirve: exige un `ContextoUsuario`, y aquí no
 *    hay sesión —el usuario está precisamente fuera— ni podría haberla, porque
 *    el token es lo que va a demostrar quién es.
 *
 *    Es una costura de arquitectura, no un olvido. Se resuelve creando el
 *    orquestador en `src/lib/auth/` (fuera de esta carpeta) y llamándolo desde
 *    aquí.
 *
 * **2. El envío real de correo no está decidido para este flujo.** `src/lib/email`
 *    ya existe, con driver de Resend, driver de consola y `plantillaReset()`
 *    lista — pero sin `RESEND_API_KEY` ni `EMAIL_FROM` en el entorno cae al
 *    driver de consola, y el correo de reset ni siquiera tiene todavía quién lo
 *    llame. No se instala ninguna dependencia nueva ni se escribe un cliente
 *    SMTP: la pieza que falta es la de arriba, no el transporte.
 *
 * ── TODO(recuperar): lo que falta, en orden ───────────────────────────────
 *
 *   a) Crear `src/lib/auth/recuperar.ts` (FUERA de esta carpeta, dentro de
 *      `src/lib`, que sí puede tocar la capa de datos) con:
 *        · buscar el usuario por email (`citext`, así que la caja da igual);
 *        · si no existe o está desactivado → `NADA_QUE_HACER`, sin escribir;
 *        · si existe → `crypto.randomBytes(32)` para el token,
 *          `sha256` en `password_reset_tokens.token_hash`, `expires_at` =
 *          ahora + `CADUCIDAD_ENLACE_MS`, todo en una transacción;
 *        · enviar con `enviarEmail(plantillaReset({ urlBase, token }))` de
 *          `@/lib/email`, DESPUÉS de confirmar la transacción — igual que en el
 *          registro (`src/lib/auth/registro.ts` explica por qué el correo va
 *          fuera de la transacción).
 *
 *   b) MUDAR `CADUCIDAD_ENLACE_MS` de `./constantes.ts` a ese módulo, para que
 *      el `expires_at` del `INSERT` y el número que enseña la card salgan de la
 *      MISMA constante. Mientras no se haga, hay una sola copia pero el backend
 *      no la lee: el día que alguien cambie una y no la otra, la pantalla miente.
 *
 *   c) `EL FALLO DE ENVÍO NO PUEDE SER VISIBLE.` Cuando (a) exista, un correo
 *      que no sale debe seguir devolviendo `ENVIADO` de cara al usuario: el
 *      camino «no hay cuenta» nunca intenta enviar, así que un error de envío
 *      visible sería un oráculo perfecto de qué direcciones tienen cuenta. Se
 *      registra en el log del servidor y se deja que el usuario use el botón de
 *      reenvío, que ya existe en esta pantalla. Ver
 *      `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` en `src/lib/auth/mensajes.ts`.
 *
 *   d) Sustituir el test RECONSTRUIDO de `flujo.test.ts` por uno del CAMINO
 *      REAL (`testing.md`): pedir el enlace cuatro veces contra la app
 *      arrancada y ver el corte del limitador de verdad.
 *
 * ── QUÉ PASA MIENTRAS TANTO ───────────────────────────────────────────────
 * La pantalla funciona entera: valida, aplica el rate limit real contra
 * Postgres, paga el tiempo equivalente y enseña el estado de éxito. Lo único
 * que no ocurre es que salga un correo. Para el usuario es indistinguible de
 * una cuenta que no existe — que es exactamente lo que el diseño de este flujo
 * quiere que sea indistinguible.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function emitirEnlaceDeRecuperacion(datos: {
  email: string;
}): Promise<ResultadoEmision> {
  const enlace = await emitirEnlaceDeReset({
    email: datos.email,
    caducidadMs: CADUCIDAD_ENLACE_MS,
  });

  // ── SIN CUENTA: NI SE ESCRIBE NI SE ENVÍA ────────────────────────────────
  // Quien llama paga el tiempo equivalente en esta rama. El email NO se
  // registra en el log: `api-conventions.md` § «Registro de errores» prohíbe la
  // dirección completa en logs de producción, y este camino se recorre en cada
  // intento — sería un censo de direcciones probadas.
  if (enlace === null) return "NADA_QUE_HACER";

  const mensaje = plantillaReset({ urlBase: urlBaseDeLaApp(), token: enlace.token });
  const envio = await enviarEmail({ ...mensaje, para: datos.email });

  if (!envio.ok) {
    // ── EL FALLO DE ENVÍO NO PUEDE SER VISIBLE ─────────────────────────────
    // Se devuelve "ENVIADO" igualmente, y no es un descuido. El camino «no hay
    // cuenta» nunca intenta enviar, así que **nunca puede fallar**: si un fallo
    // de envío cambiara la respuesta, la diferencia sería un oráculo perfecto
    // de qué direcciones tienen cuenta — bastaría con saturar el proveedor de
    // correo para consultarlo a voluntad.
    //
    // Queda en el log del servidor, sin la dirección, y la persona tiene el
    // botón de reenvío que ya existe en la pantalla.
    console.error("[recuperar] el correo de restablecimiento no salió:", envio.motivo);
  }

  return "ENVIADO";
}

/**
 * La base de las URL que van dentro del correo.
 *
 * Sale de `AUTH_URL`, que es la misma variable con la que se compara el
 * `Origin` en la guarda CSRF: si el enlace del correo apuntara a otro sitio que
 * el que la aplicación considera suyo, o el enlace no funcionaría o la guarda
 * estaría mal configurada. Una sola fuente para las dos cosas.
 */
function urlBaseDeLaApp(): string {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (url === undefined || url.length === 0) {
    // Falla ruidosamente en vez de mandar un enlace a `undefined/recuperar/nueva`.
    throw new Error(
      "AUTH_URL no está definida: no se puede construir el enlace de restablecimiento.",
    );
  }
  return url.replace(/\/+$/, "");
}
