import { MENSAJES, mensajeLoginFallido } from "@/lib/auth/mensajes";
import { EsquemaLogin } from "@/lib/validation/auth";

import type { DatosLogin } from "@/lib/validation/auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL FLUJO DE «INICIAR SESIÓN», SIN NADA ALREDEDOR.
 *
 * Aquí vive el ORDEN —parsear → rate limit → autenticar— y nada más: ni
 * cabeceras, ni cookies, ni Auth.js, ni Postgres. Todo lo que hace efecto entra
 * como dependencia inyectada.
 *
 * ── POR QUÉ ES UN `.ts` Y NO PARTE DE `acciones.ts` ────────────────────────
 * Dos motivos, y el segundo es el que manda:
 *
 * 1. **Vitest corre con `environment: "node"` y no transforma `.tsx`.** Es la
 *    misma razón por la que `src/lib/ui/href.ts` existe separado de
 *    `enlace.tsx`. Un módulo `"use server"` tampoco se puede importar desde un
 *    test sin arrastrar `next/headers` y Auth.js enteros.
 * 2. **Se puede AFIRMAR que el hash no se llega a llamar.** Con las
 *    dependencias inyectadas, el test comprueba que `autenticar` recibe CERO
 *    llamadas cuando el límite bloquea. Eso es lo que protege de verdad, y sin
 *    inyección solo se podría comprobar leyendo el código.
 *
 * ── EL ORDEN NO ES NEGOCIABLE ──────────────────────────────────────────────
 * Argon2id cuesta 19 MiB y decenas de milisegundos por verificación. Si el
 * límite se comprobara DESPUÉS, el login sería un amplificador de denegación de
 * servicio: peticiones baratísimas para el atacante, carísimas para la función
 * serverless, que además cobra por milisegundo de CPU.
 * Ver `.claude/rules/security.md` §2 y `src/lib/auth/login.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Códigos de `.claude/rules/api-conventions.md` § «Códigos de error».
 *
 * Se declaran aquí porque `src/lib/api/errors.ts` —que la regla nombra como su
 * hogar— **todavía no existe** en el repositorio. Cuando exista, esta unión se
 * sustituye por la suya; los nombres ya coinciden a propósito para que sea un
 * cambio de import y nada más.
 */
export type CodigoErrorLogin =
  "VALIDACION" | "LIMITE_EXCEDIDO" | "NO_AUTENTICADO" | "ERROR_INTERNO";

/** Los campos del formulario. Sale del esquema, no de una lista escrita a mano. */
export type CampoLogin = keyof DatosLogin;

/** Un error de validación atado a su campo, para que el formulario lo pinte donde toca. */
export type DetalleCampo = { campo: CampoLogin; motivo: string };

/**
 * El sobre de `api-conventions.md`: las Server Actions devuelven el mismo que
 * los Route Handlers y **no lanzan al cliente**, para que el formulario pueda
 * pintar el error sin `try/catch` en el componente.
 */
export type RespuestaLogin =
  | { ok: true }
  | {
      ok: false;
      error: { codigo: CodigoErrorLogin; mensaje: string; detalles?: DetalleCampo[] };
    };

/** Todo lo que toca el mundo exterior, inyectado. */
export type DependenciasLogin = {
  /**
   * Registra el intento y decide. Se llama SIEMPRE antes de autenticar, y
   * recibe el email ya normalizado por Zod porque la clave del limitador se
   * calcula sobre ese valor (`security.md` §5).
   */
  comprobarLimite: (datos: { email: string }) => Promise<{ permitido: boolean }>;
  /**
   * Verifica las credenciales. CARO: aquí dentro está Argon2id.
   *
   * `recordarme` viaja con ellas porque la duración de la sesión se congela en
   * el mismo `authorize` que comprueba la contraseña. Ver `duracion.ts`.
   */
  autenticar: (credenciales: {
    email: string;
    password: string;
    recordarme: boolean;
  }) => Promise<boolean>;
  /** ¿`AUTH_REQUIRE_EMAIL_VERIFICATION` está encendida? */
  seExigeVerificacion: () => boolean;
};

/** Nombre de campo conocido, o `null` si el issue no apunta a uno de los nuestros. */
function campoDelIssue(ruta: readonly PropertyKey[]): CampoLogin | null {
  const primero = ruta[0];
  return primero === "email" || primero === "password" || primero === "recordarme" ? primero : null;
}

export async function ejecutarLogin(
  entrada: unknown,
  deps: DependenciasLogin,
): Promise<RespuestaLogin> {
  // ── 1. PARSEAR ───────────────────────────────────────────────────────────
  // El cliente ya validó con este MISMO esquema, por UX. Aquí se revalida por
  // seguridad: lo que llega a una Server Action es texto que manda el
  // navegador, y el servidor no se fía de él (`security.md` §8).
  const parseado = EsquemaLogin.safeParse(entrada);

  if (!parseado.success) {
    const detalles: DetalleCampo[] = [];
    for (const issue of parseado.error.issues) {
      const campo = campoDelIssue(issue.path);
      if (campo !== null) detalles.push({ campo, motivo: issue.message });
    }

    return {
      ok: false,
      error: {
        codigo: "VALIDACION",
        // El texto sale del esquema compartido, no de una copia local: si
        // mañana cambia «Escribe tu correo», cambia en los dos lados a la vez.
        mensaje:
          detalles[0]?.motivo ?? parseado.error.issues[0]?.message ?? MENSAJES.campos.emailVacio,
        detalles,
      },
    };
  }

  /**
   * ── «RECORDARME» YA HACE ALGO ────────────────────────────────────────────
   *
   * Estuvo un tiempo parseándose y descartándose: la casilla se marcaba y la
   * sesión duraba lo mismo. Una casilla inerte es peor que no tenerla, porque
   * enseña que la interfaz miente.
   *
   * Ahora viaja hasta `authorize`, que congela la elección en el token, y la
   * caducidad se cuenta desde ese instante: **12 horas** sin marcar, **30 días**
   * marcada. Ver `src/lib/auth/duracion.ts`.
   */
  const { email, password, recordarme } = parseado.data;

  // ── 2. RATE LIMIT ────────────────────────────────────────────────────────
  // ANTES del hash. Una petición bloqueada no llega a Argon2id ni consulta al
  // usuario. Es lo que fija el test de este módulo.
  const limite = await deps.comprobarLimite({ email });

  if (!limite.permitido) {
    return {
      ok: false,
      error: {
        codigo: "LIMITE_EXCEDIDO",
        // Aquí SÍ se puede ser concreto: el límite no revela nada de la cuenta.
        mensaje: MENSAJES.loginDemasiadosIntentos,
      },
    };
  }

  // ── 3. AUTENTICAR ────────────────────────────────────────────────────────
  const autenticado = await deps.autenticar({ email, password, recordarme });

  if (!autenticado) {
    return {
      ok: false,
      error: {
        codigo: "NO_AUTENTICADO",
        /**
         * ── DESVIACIÓN CONSCIENTE RESPECTO AL ARTBOARD ────────────────────
         * El PNG de `design/screens/07-auth.png` dice «Contraseña incorrecta ·
         * te quedan 4 intentos». Eso **viola `security.md` §2** por partida
         * doble: «contraseña incorrecta» confirma que el correo existe, y el
         * contador confirma que hay una cuenta contando intentos. Gana la regla
         * de seguridad. Ver SUPUESTOS.md.
         */
        mensaje: mensajeLoginFallido(deps.seExigeVerificacion()),
      },
    };
  }

  return { ok: true };
}

/**
 * ¿La URL que devolvió `signIn(..., { redirect: false })` lleva un error?
 *
 * Auth.js **lanza** un `AuthError` cuando las credenciales fallan, y ese es el
 * camino normal. Esta comprobación es el cinturón además de los tirantes: si
 * una versión de la beta dejara de lanzar y se limitara a devolver
 * `…/login?error=CredentialsSignin`, sin esto el fallo se leería como un login
 * correcto y la pantalla dejaría entrar a quien no debe.
 *
 * Se acepta `unknown` porque `signIn` está tipado como `Promise<any>` y ese
 * `any` no debe propagarse al resto del código.
 */
export function hayErrorEnUrl(destino: unknown): boolean {
  if (typeof destino !== "string") return false;

  try {
    // `base` porque el valor puede ser una ruta relativa. El host es irrelevante:
    // solo se mira el query.
    const url = new URL(destino, "http://localhost");
    return url.searchParams.has("error");
  } catch {
    // Si no se puede parsear, no se puede afirmar que haya error.
    return false;
  }
}
