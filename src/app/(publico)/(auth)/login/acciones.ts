"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { seExigeVerificacionEmail } from "@/lib/config/entorno";
import { clavePorEmail, clavePorIp, ipDelCliente, registrarIntentos } from "@/lib/rate-limit";

import { ejecutarLogin, hayErrorEnUrl } from "./flujo";

import type { RespuestaLogin } from "./flujo";
import type { NombreLimite } from "@/lib/rate-limit";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVER ACTION, NO ROUTE HANDLER. Y eso ES la defensa CSRF.
 *
 * Next **comprueba el origen de las Server Actions por su cuenta** (compara
 * `Origin` con `Host` y rechaza si no casan). Es protección por defecto, sin
 * código propio que se pueda olvidar. Un `POST /api/login` no tiene nada de
 * eso: se ejecuta venga de donde venga con solo llevar la cookie.
 * Ver `.claude/rules/security.md` §2 ter y `api-conventions.md`.
 *
 * Defensa en profundidad, no capa única: las cookies de Auth.js son
 * `SameSite=Lax`, que ya bloquea el POST entre sitios en navegadores actuales.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A dónde va el usuario tras entrar. `/app` es el vault, protegido por el middleware. */
const DESTINO = "/app";

/** Las dos claves del limitador para esta acción (`security.md` §5). */
const LIMITE_POR_EMAIL: NombreLimite = "login:email";
const LIMITE_POR_IP: NombreLimite = "login:ip";

/**
 * Inicia sesión.
 *
 * ORDEN, y no es negociable: **parsear → rate limit → `signIn`**. `signIn`
 * acaba en `authorize`, que ejecuta Argon2id; una petición bloqueada no puede
 * llegar hasta ahí. La lógica del orden vive en `./flujo.ts`, que es donde se
 * testea.
 *
 * @param entrada lo que manda el formulario. `unknown` A PROPÓSITO: tiparlo
 * como `DatosLogin` sería una promesa que el navegador no tiene por qué
 * cumplir. Se parsea con Zod dentro.
 */
export async function iniciarSesion(entrada: unknown): Promise<RespuestaLogin> {
  let resultado: RespuestaLogin;

  try {
    resultado = await ejecutarLogin(entrada, {
      comprobarLimite: comprobarLimiteDeLogin,
      autenticar: autenticarConCredenciales,
      seExigeVerificacion: seExigeVerificacionEmail,
    });
  } catch (error) {
    // Lo inesperado no se le enseña al usuario: ni un stack, ni un hostname
    // interno, ni el error del driver (`api-conventions.md` § «Forma de la
    // respuesta»). Se registra sin el correo: los logs de producción no llevan
    // direcciones completas.
    console.error("login: fallo inesperado en la Server Action", error);
    return {
      ok: false,
      error: {
        codigo: "ERROR_INTERNO",
        mensaje: "No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.",
      },
    };
  }

  // ── FUERA DEL try/catch, Y ES IMPRESCINDIBLE ─────────────────────────────
  // `redirect()` funciona LANZANDO (`NEXT_REDIRECT`). Dentro de un `catch` que
  // traga excepciones, la navegación se convertiría en un «error interno» y el
  // usuario se quedaría en el login con sesión ya iniciada.
  if (resultado.ok) redirect(DESTINO);

  return resultado;
}

/**
 * Registra el intento contra las DOS claves y devuelve el veredicto.
 *
 * Por **email** frena la fuerza bruta contra una cuenta aunque el atacante rote
 * IPs; por **IP** frena el barrido de muchas cuentas desde un mismo origen.
 * Hacen falta las dos, y se registran ambas aunque una ya haya bloqueado: si se
 * cortocircuitara, el contador de la otra clave no avanzaría y un atacante
 * podría mantenerlo a cero (`security.md` §5).
 */
async function comprobarLimiteDeLogin({ email }: { email: string }): Promise<{
  permitido: boolean;
}> {
  try {
    const ip = ipDelCliente(await headers());

    const entradas: { nombre: NombreLimite; clave: string }[] = [
      { nombre: LIMITE_POR_EMAIL, clave: clavePorEmail("login", email) },
    ];

    // Sin cabecera de IP no se aplica la clave por IP. NO se inventa un cubo
    // «desconocido» compartido: todos los clientes sin cabecera se bloquearían
    // entre sí (`security.md` §5).
    if (ip !== null) {
      entradas.push({ nombre: LIMITE_POR_IP, clave: clavePorIp("login", ip) });
    }

    const veredicto = await registrarIntentos(entradas);
    return { permitido: veredicto.permitido };
  } catch (error) {
    // FALLA CERRADO. Si el limitador no responde se deniega, y no es una
    // decisión dura: el login necesita la base para verificar la contraseña,
    // así que si la base está caída no hay login que permitir.
    console.error("login: el limitador no respondió; se deniega el intento", error);
    return { permitido: false };
  }
}

/**
 * `signIn` de Auth.js, con el resultado reducido a un booleano.
 *
 * `redirect: false` porque quien decide a dónde va el usuario es esta acción,
 * no Auth.js: con `redirect: true` la navegación ocurre dentro de `signIn` y el
 * fallo de credenciales acabaría en `/login?error=…`, una URL que enseña el
 * motivo del fallo en la barra de direcciones.
 *
 * **No se distingue qué falló.** Credenciales malas, cuenta inexistente,
 * desactivada o sin verificar: los cuatro devuelven `false` y la pantalla
 * enseña el mismo texto. Distinguirlos sería un oráculo de enumeración
 * (`security.md` §2).
 */
async function autenticarConCredenciales({
  email,
  password,
  recordarme,
}: {
  email: string;
  password: string;
  recordarme: boolean;
}): Promise<boolean> {
  try {
    const destino: unknown = await signIn("credentials", {
      email,
      password,
      // Cadena, porque es lo que viaja por el formulario de Auth.js. En
      // `authorize` solo un "true" explícito cuenta como marcada.
      recordarme: recordarme ? "true" : "false",
      redirect: false,
    });
    return !hayErrorEnUrl(destino);
  } catch (error) {
    // `AuthError` es el fallo ESPERADO: `CredentialsSignin` cuando `authorize`
    // devuelve null. Cualquier otra cosa (la base caída, una variable de
    // entorno que falta) no es un fallo de credenciales y se propaga para que
    // el `catch` de arriba la registre y devuelva ERROR_INTERNO.
    if (error instanceof AuthError) return false;
    throw error;
  }
}
